import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.models import DemandPredictionMaster2024, RtAir, RtWeather

logger = logging.getLogger(__name__)

# serving/scheduler.py 기본 수집 주기(30분)의 몇 배 여유를 두고, target_dt와 이보다 멀리
# 떨어진 관측치는 "그 시각의 실측"으로 취급하지 않는다 (라이브 예측이면 스케줄러가 죽어있다는
# 신호, backtest면 그 시간대에 수집이 아예 없었다는 신호).
_RT_MAX_AGE = timedelta(hours=2)

# nearest-match 조회 시 DB에서 끌어올 후보 범위. 초단기실황 수집 주기(30분)보다 넉넉히 잡아
# target_dt 앞뒤로 가장 가까운 관측치를 반드시 후보에 포함시킨다.
_NEAREST_SEARCH_WINDOW = timedelta(hours=3)

# RtWeather/RtAir 어디에도 적설량(snowfall) 컬럼이 없어 실시간 소스가 존재하지 않는다.
# 그래서 실시간 예측에서는 항상 0으로 고정한다 - is_bad_weather의 snowfall 조건은
# 라이브 예측에서는 절대 발동하지 않는다는 뜻이다 (알려진 한계).
_SNOWFALL_DEFAULT = 0.0

# 날씨/이력 어디에도 값이 없을 때 쓰는 최후의 기본값 (서울 연평균 대략치)
_HARDCODED_TEMPERATURE = 15.0
_HARDCODED_PRECIPITATION = 0.0
_HARDCODED_PM10 = 40.0


@dataclass(frozen=True)
class WeatherFeatures:
    temperature: float
    precipitation: float
    pm10: float
    snowfall: float
    source: str  # "rt_live" | "demand_predict_master_fallback" | "hardcoded_default"


def _nearest_row(session: Session, model, region_name: str, target_dt: datetime):
    """model.measure_date가 target_dt에 가장 가까운 행 하나를 찾는다 (± _NEAREST_SEARCH_WINDOW
    범위 내에서). target_dt가 "지금"이면 사실상 최신 관측치와 같은 결과를 주므로 라이브 예측
    경로의 기존 동작과 호환되고, target_dt가 과거(backtest)면 그 시각에 가장 가까운 실측치를
    돌려준다는 점이 다르다."""
    window_start = target_dt - _NEAREST_SEARCH_WINDOW
    window_end = target_dt + _NEAREST_SEARCH_WINDOW
    rows = session.execute(
        select(model).where(
            model.region_name == region_name,
            model.measure_date.between(window_start, window_end),
        )
    ).scalars().all()
    if not rows:
        return None
    return min(rows, key=lambda r: abs((r.measure_date - target_dt).total_seconds()))


def get_target_hour_weather(
    session: Session, station_id: str, district: str, target_dt: datetime
) -> WeatherFeatures:
    """
    target_dt 시각의 날씨 근사치를 구한다 (라이브 예측이면 다음 1시간, backtest면 과거 특정 시각).

    주의: RtWeather/RtAir는 data/collect_rt.py가 KMA 초단기실황(getUltraSrtNcst) API로
    채우는 테이블이라, 사실 "예보"가 아니라 "관측치(nowcast)"다. target_dt에 가장 가까운
    관측치를 쓰므로 1시간 지평선의 라이브 예측에서는 합리적인 근사치이고, backtest에서도
    수집이 켜져 있던 구간이면 시간대별로 실제 관측값 변화를 반영한다는 점에서 "정확한 예보"는
    아니라는 점을 코드 이름에도 반영했다 (get_target_hour_*forecast*가 아니라
    get_target_hour_weather).
    """
    rt_weather_row = _nearest_row(session, RtWeather, district, target_dt)
    rt_air_row = _nearest_row(session, RtAir, district, target_dt)

    rt_is_fresh = (
        rt_weather_row is not None and rt_air_row is not None
        and abs(target_dt - rt_weather_row.measure_date) <= _RT_MAX_AGE
        and abs(target_dt - rt_air_row.measure_date) <= _RT_MAX_AGE
    )
    if not rt_is_fresh and rt_weather_row is not None and rt_air_row is not None:
        logger.warning(
            "station_id=%s district=%s target_dt=%s: rt_weather/rt_air 관측치가 %s 이상 떨어져 있어 "
            "stale로 취급하고 폴백합니다 (weather=%s, air=%s)",
            station_id, district, target_dt, _RT_MAX_AGE, rt_weather_row.measure_date, rt_air_row.measure_date,
        )

    if rt_is_fresh:
        return WeatherFeatures(
            temperature=float(rt_weather_row.temperature or 0.0),
            precipitation=float(rt_weather_row.precipitation or 0.0),
            pm10=float(rt_air_row.pm10 or 0.0),
            snowfall=_SNOWFALL_DEFAULT,
            source="rt_live",
        )

    logger.warning(
        "station_id=%s district=%s: rt_weather/rt_air 데이터 없음 -> "
        "demand_prediction_master_2024 최신 실측값으로 폴백",
        station_id, district,
    )
    fallback_row = session.execute(
        select(DemandPredictionMaster2024)
        .where(DemandPredictionMaster2024.station_id == station_id)
        .order_by(DemandPredictionMaster2024.datetime_hr.desc())
        .limit(1)
    ).scalar_one_or_none()

    if fallback_row is not None:
        return WeatherFeatures(
            temperature=float(fallback_row.temperature or 0.0),
            precipitation=float(fallback_row.precipitation or 0.0),
            pm10=float(fallback_row.pm10 or 0.0),
            snowfall=_SNOWFALL_DEFAULT,
            source="demand_predict_master_fallback",
        )

    logger.error(
        "station_id=%s district=%s: 날씨 데이터를 어디서도 찾을 수 없어 하드코딩 기본값 사용",
        station_id, district,
    )
    return WeatherFeatures(
        temperature=_HARDCODED_TEMPERATURE,
        precipitation=_HARDCODED_PRECIPITATION,
        pm10=_HARDCODED_PM10,
        snowfall=_SNOWFALL_DEFAULT,
        source="hardcoded_default",
    )
