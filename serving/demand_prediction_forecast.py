"""
전일(가장 최근 확정일) 기준 실제 대여량과 챔피언 모델의 backtest 예측치를 시간대별로
비교해 demand_prediction_forecast에 적재하는 야간 배치.

전체 대여소 x 24시간을 매 요청마다 predict()하면 admin-analytics.js 페이지 로딩 한 번에
수천 번의 DB 조회가 필요해 감당할 수 없다. 그래서 자치구별 실제 대여량 상위 N개
대여소만 실제로 backtest하고, (자치구 실제 합계 / 표본 실제 합계) 비율로 스케일업해
자치구 전체 예측치를 근사한다. serving/scheduler.py가 매일 새벽 한 번 이 함수를 호출해
결과를 테이블에 저장해두면, /analytics/model-monitoring은 그 결과만 읽어 즉시 응답한다.
"""
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.db_connection import engine
from models.models import DemandPredictionMaster2024, DemandPredictionForecast
from serving.analytics_utils import latest_available_date
from serving.district import DISTRICTS
from serving.feature import StationNotFoundError, build_feature_row
from serving.target_encoding import TargetEncodingCache

logger = logging.getLogger(__name__)

_SAMPLE_STATIONS_PER_DISTRICT = 8  # 클수록 근사치가 정확해지지만 배치 시간이 늘어난다
_RENT_TARGETS = ("general_rent_cnt", "sprout_rent_cnt")  # "총 대여량" = 이 둘의 합 (다른 analytics 엔드포인트와 동일한 정의)


def _sample_station_ids(session: Session, district_name: str, target_date) -> list[str]:
    stmt = (
        select(
            DemandPredictionMaster2024.station_id,
            func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt).label("total"),
        )
        .where(
            DemandPredictionMaster2024.district == district_name,
            func.date(DemandPredictionMaster2024.datetime_hr) == target_date,
        )
        .group_by(DemandPredictionMaster2024.station_id)
        .order_by(func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt).desc())
        .limit(_SAMPLE_STATIONS_PER_DISTRICT)
    )
    return [row[0] for row in session.execute(stmt).all()]


def _actual_by_hour(
    session: Session, target_date, station_ids: list[str] | None, district_name: str | None
) -> dict[int, int]:
    hour_expr = func.hour(DemandPredictionMaster2024.datetime_hr)
    stmt = (
        select(hour_expr, func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt))
        .where(func.date(DemandPredictionMaster2024.datetime_hr) == target_date)
        .group_by(hour_expr)
    )
    if station_ids is not None:
        stmt = stmt.where(DemandPredictionMaster2024.station_id.in_(station_ids))
    elif district_name:
        stmt = stmt.where(DemandPredictionMaster2024.district == district_name)
    rows = session.execute(stmt).all()
    return {int(h): int(v or 0) for h, v in rows}


def _predicted_by_hour(
    session: Session,
    station_ids: list[str],
    target_date,
    champion_models: dict[str, Any],
    encoding_cache: TargetEncodingCache,
) -> dict[int, float]:
    models = {t: champion_models[t] for t in _RENT_TARGETS if t in champion_models}
    predicted: dict[int, float] = {h: 0.0 for h in range(24)}
    if not models:
        return predicted

    day_start = datetime.combine(target_date, datetime.min.time())
    for station_id in station_ids:
        for hour in range(24):
            target_dt = day_start + timedelta(hours=hour)
            try:
                feature_row = build_feature_row(session, station_id, target_dt, encoding_cache)
            except StationNotFoundError:
                continue
            predicted[hour] += sum(max(0.0, float(model.predict(feature_row)[0])) for model in models.values())

    return predicted


def run_model_monitoring_backfill(champion_models: dict[str, Any], encoding_cache: TargetEncodingCache) -> None:
    """
    스케줄러가 매일 새벽 호출하는 진입점. 해당 target_date가 이미 계산돼 있으면
    건너뛴다(멱등). 실패해도 다음 스케줄에서 자연히 재시도되므로 예외를 삼키고
    로깅만 한다 - rt_collection 배치와 동일한 정책 (serving/scheduler.py 참고).
    """
    try:
        with Session(engine) as session:
            target_date = latest_available_date(session)
            if target_date is None:
                logger.warning("[모델 모니터링] latest_available_date를 찾지 못해 backfill을 건너뜁니다.")
                return

            already_done = session.execute(
                select(func.count()).select_from(DemandPredictionForecast)
                .where(DemandPredictionForecast.target_date == target_date)
            ).scalar_one()
            if already_done:
                logger.info("[모델 모니터링] %s는 이미 계산돼 있어 건너뜁니다.", target_date)
                return

            city_actual = _actual_by_hour(session, target_date, station_ids=None, district_name=None)
            city_predicted = {h: 0.0 for h in range(24)}
            city_sample_cnt = 0

            for district in DISTRICTS:
                sample_ids = _sample_station_ids(session, district["name"], target_date)
                district_actual = _actual_by_hour(session, target_date, station_ids=None, district_name=district["name"])

                if sample_ids:
                    sample_predicted = _predicted_by_hour(session, sample_ids, target_date, champion_models, encoding_cache)
                    sample_actual = _actual_by_hour(session, target_date, station_ids=sample_ids, district_name=None)
                    sample_actual_total = sum(sample_actual.values())
                    district_actual_total = sum(district_actual.values())
                    scale = (district_actual_total / sample_actual_total) if sample_actual_total else 0.0
                    district_predicted = {h: v * scale for h, v in sample_predicted.items()}
                else:
                    district_predicted = {h: 0.0 for h in range(24)}

                city_sample_cnt += len(sample_ids)
                for h in range(24):
                    city_predicted[h] += district_predicted[h]
                    session.merge(DemandPredictionForecast(
                        target_date=target_date, hour=h, district_id=district["id"],
                        actual_total=district_actual.get(h, 0),
                        predicted_total=round(district_predicted[h]),
                        sample_station_cnt=len(sample_ids),
                    ))

            for h in range(24):
                session.merge(DemandPredictionForecast(
                    target_date=target_date, hour=h, district_id=0,
                    actual_total=city_actual.get(h, 0),
                    predicted_total=round(city_predicted[h]),
                    sample_station_cnt=city_sample_cnt,
                ))

            session.commit()
            logger.info("[모델 모니터링] %s backfill 완료 (자치구 표본 총 %d개 대여소)", target_date, city_sample_cnt)
    except Exception:
        logger.exception("[모델 모니터링] backfill 실패")
