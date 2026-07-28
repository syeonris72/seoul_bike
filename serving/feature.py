from datetime import datetime

import holidays
import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.models import DemandPredictionMaster2024, InfraMaster, StationLoc
from serving.constant import (
    FEATURE_COLUMNS,
    LATE_NIGHT_HOURS,
    PM10_BINS,
    PM10_LABELS,
    RUSH_HOURS,
    SEASON_CHANGE_MONTHS,
    TARGET_COLUMNS,
)
from serving.rent_history import (
    compute_interaction_features,
    extract_lag_and_rolling,
    extract_population_trend,
    fetch_station_window,
)
from serving.target_encoding import TargetEncodingCache
from serving.env import WeatherFeatures, get_target_hour_weather

_KR_HOLIDAYS = holidays.KR()


class StationNotFoundError(Exception):
    """station_id에 해당하는 StationLoc/InfraMaster 행이 없을 때 발생시킨다."""


def build_feature_row(
    session: Session,
    station_id: str,
    target_dt: datetime,
    encoding_cache: TargetEncodingCache,
) -> pd.DataFrame:
    """
    (station_id, target_dt)에 대해 FEATURE_COLUMNS 순서와 정확히 일치하는 1행
    DataFrame을 만든다. model.predict()에 바로 넘길 수 있는 형태.

    baseline.ipynb 셀 15/18의 피처 엔지니어링을 그대로 재현한다 - 자세한 수식은
    각 단계 주석 참고. station_id가 StationLoc/InfraMaster에 없으면
    StationNotFoundError를 던진다 (라우터에서 404로 변환).
    """
    # 1) 정적 속성 (StationLoc + InfraMaster)
    station = session.execute(
        select(StationLoc).where(StationLoc.station_id == station_id)
    ).scalar_one_or_none()
    if station is None:
        raise StationNotFoundError(station_id)

    infra = session.execute(
        select(InfraMaster).where(InfraMaster.station_id == station_id)
    ).scalar_one_or_none()

    lat = float(station.lat) if station.lat is not None else 0.0
    lon = float(station.lon) if station.lon is not None else 0.0
    district = station.district or ""

    subway_cnt_300m = int(infra.subway_cnt_300m or 0) if infra else 0
    biz_cnt_300m = int(infra.biz_cnt_300m or 0) if infra else 0
    edu_cnt_500m = int(infra.edu_cnt_500m or 0) if infra else 0
    park_cnt_500m = int(infra.park_cnt_500m or 0) if infra else 0
    river_cnt_1km = int(infra.river_cnt_1km or 0) if infra else 0
    dist_subway = float(infra.dist_subway or 0.0) if infra else 0.0
    dist_river = float(infra.dist_river or 0.0) if infra else 0.0

    # 2) 달력 피처
    hour = target_dt.hour
    month = target_dt.month
    day_of_week = target_dt.weekday()  # 0=월 ~ 6=일, baseline.ipynb의 .dt.dayofweek와 동일
    is_weekend = int(day_of_week >= 5)
    # korea_holidays 테이블(2024년치만 있을 위험) 대신 holidays 라이브러리로 직접 계산
    is_holiday = int(target_dt.date() in _KR_HOLIDAYS)

    # 3)+4) 날씨/인구: target_dt가 이미 확정된 과거 시점이면(예: model_monitoring의 backtest)
    # demand_prediction_master_2024에 그 시점 실측값이 그대로 있으므로 그것을 쓴다. 그렇지 않고
    # 아직 확정 안 된 시점(라이브 예측)일 때만 "가장 최근 관측치"로 근사한다. 이 구분이 없으면
    # 과거 시점을 예측할 때도 항상 "현재" 날씨/인구를 섞어 넣게 되어(look-ahead leak),
    # backtest 결과가 실제 모델 성능을 반영하지 못한다.
    exact_row = session.execute(
        select(DemandPredictionMaster2024).where(
            DemandPredictionMaster2024.station_id == station_id,
            DemandPredictionMaster2024.datetime_hr == target_dt,
        )
    ).scalar_one_or_none()

    if exact_row is not None:
        weather = WeatherFeatures(
            temperature=float(exact_row.temperature or 0.0),
            precipitation=float(exact_row.precipitation or 0.0),
            pm10=float(exact_row.pm10 or 0.0),
            snowfall=float(exact_row.snowfall or 0.0),
            source="historical_exact",
        )
    else:
        # 다음 1시간 근사치 - RtWeather/RtAir 최신 관측 또는 폴백
        weather = get_target_hour_weather(session, station_id, district, target_dt)

    # 인구 이력 조회 (lag/rolling + 인구 트렌드 계산에 공용으로 씀)
    window_df = fetch_station_window(session, station_id, target_dt)

    flwpop_cols = ["flwpop_10s", "flwpop_20s", "flwpop_30s", "flwpop_40s", "flwpop_50s", "flwpop_60up"]
    lvgpop_cols = ["lvgpop_10s", "lvgpop_20s", "lvgpop_30s", "lvgpop_40s", "lvgpop_50s", "lvgpop_60up"]

    if exact_row is not None:
        latest_demand_row = exact_row
    else:
        # 실시간 인구 예보 소스가 없으므로, 이 station의 가장 최근 실측값을 target_dt 시점의
        # 근사치로 사용한다 (알려진 한계 - 가장 큰 근사 지점, 라이브 예측에서만 발생).
        latest_demand_row = session.execute(
            select(DemandPredictionMaster2024)
            .where(DemandPredictionMaster2024.station_id == station_id)
            .order_by(DemandPredictionMaster2024.datetime_hr.desc())
            .limit(1)
        ).scalar_one_or_none()

    pop_values = {}
    for col in flwpop_cols + lvgpop_cols:
        pop_values[col] = float(getattr(latest_demand_row, col, 0) or 0.0) if latest_demand_row else 0.0

    flwpop_tot = float(latest_demand_row.flwpop_tot or 0.0) if latest_demand_row else 0.0
    lvgpop_tot = float(latest_demand_row.lvgpop_tot or 0.0) if latest_demand_row else 0.0

    # 5) pm10_grade (실제 pd.cut 사용 - 경계값 불일치 위험 제거)
    pm10_grade = float(
        pd.cut(pd.Series([weather.pm10]), bins=PM10_BINS, labels=PM10_LABELS).astype(float).iloc[0]
    )

    # 6) v1_v4 / v3 / v2 / v5 파생 피처 (baseline.ipynb 셀 15 그대로)
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    month_sin = np.sin(2 * np.pi * month / 12)
    month_cos = np.cos(2 * np.pi * month / 12)
    is_rush_hour = int(hour in RUSH_HOURS)

    is_bad_weather = int(
        (weather.precipitation > 0) or (weather.snowfall > 0) or (pm10_grade >= 3)
    )

    flow_to_living_ratio = flwpop_tot / lvgpop_tot if lvgpop_tot not in (0, 0.0) else 0.0
    if not np.isfinite(flow_to_living_ratio):
        flow_to_living_ratio = 0.0

    infra_density_score = subway_cnt_300m + biz_cnt_300m + edu_cnt_500m + park_cnt_500m + river_cnt_1km

    is_late_night = int(hour in LATE_NIGHT_HOURS)
    subway_last_mile_synergy = subway_cnt_300m * is_late_night

    pop_trend = extract_population_trend(window_df, target_dt, flwpop_tot, lvgpop_tot)
    pop_spike_ratio = pop_trend["pop_spike_ratio"]
    population_dynamic_flux = pop_trend["population_dynamic_flux"]

    is_riverside_park = int((park_cnt_500m > 0) and (river_cnt_1km > 0))

    is_extreme_temp = int((weather.temperature <= 0) or (weather.temperature >= 30))
    is_season_change = int(month in SEASON_CHANGE_MONTHS)
    is_long_weekend = int(bool(is_holiday) and bool(is_weekend))
    day_type = 2 if is_holiday == 1 else (1 if is_weekend == 1 else 0)

    is_biz_hour = int((9 <= hour <= 18) and (is_weekend == 0))
    synergy_biz_weekday = biz_cnt_300m * is_biz_hour
    leisure_infra_cnt = park_cnt_500m + river_cnt_1km
    synergy_leisure_weekend = leisure_infra_cnt * is_weekend

    # 7) lag/rolling + interaction 피처
    lag_and_rolling = extract_lag_and_rolling(window_df, target_dt)
    interaction = compute_interaction_features(lag_and_rolling)

    # 8) 타깃 인코딩
    encoded = {
        f"{target}_station_dow_hour_mean": encoding_cache.lookup(target, station_id, day_of_week, hour)
        for target in TARGET_COLUMNS
    }

    # 9) 전체 조립 (FEATURE_COLUMNS 순서로 columns= 명시)
    row = {
        "lat": lat, "lon": lon,
        "subway_cnt_300m": subway_cnt_300m, "edu_cnt_500m": edu_cnt_500m,
        "river_cnt_1km": river_cnt_1km, "dist_subway": dist_subway, "dist_river": dist_river,
        "temperature": weather.temperature, "precipitation": weather.precipitation, "pm10": weather.pm10,
        **{col: pop_values[col] for col in flwpop_cols},
        **{col: pop_values[col] for col in lvgpop_cols},
        "day_of_week": day_of_week, "month": month, "hour": hour,
        "hour_sin": hour_sin, "hour_cos": hour_cos,
        "month_sin": month_sin, "month_cos": month_cos,
        "is_rush_hour": is_rush_hour, "is_bad_weather": is_bad_weather,
        "flow_to_living_ratio": flow_to_living_ratio,
        "infra_density_score": infra_density_score,
        "subway_last_mile_synergy": subway_last_mile_synergy,
        "pop_spike_ratio": pop_spike_ratio,
        "population_dynamic_flux": population_dynamic_flux,
        "is_riverside_park": is_riverside_park,
        "is_extreme_temp": is_extreme_temp, "is_season_change": is_season_change,
        "is_long_weekend": is_long_weekend, "day_type": day_type,
        "is_biz_hour": is_biz_hour, "synergy_biz_weekday": synergy_biz_weekday,
        "leisure_infra_cnt": leisure_infra_cnt, "synergy_leisure_weekend": synergy_leisure_weekend,
        **lag_and_rolling,
        **interaction,
        **encoded,
    }

    return pd.DataFrame([row], columns=FEATURE_COLUMNS)
