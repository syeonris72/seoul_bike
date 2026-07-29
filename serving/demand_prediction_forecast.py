"""
전일(실제 달력 기준 어제) 실시간 대여소 재고 변화량과 챔피언 모델의 backtest 예측치를
시간대별로 비교해 demand_prediction_forecast에 적재하는 야간 배치.

"실제"는 more_prediction_master_2024(2024년 고정 이력)가 아니라 rt_bike_status - 30분
간격으로 serving/scheduler.py가 계속 쌓는 실시간 거치대 스냅샷 - 에서 뽑는다. 같은 대여소의
연속된 두 스냅샷 사이에 parked_bike_cnt가 줄었으면 그만큼 대여가 일어난 것으로 추정한다
(반대로 늘었으면 반납/배차 재배치). 배차 트럭이 자전거를 옮기는 경우도 같은 방식으로 카운트돼
순수 "대여"보다는 "순감소량" 근사치라는 한계가 있다 - 그래도 2024년 정적 이력보다는 실제
어제 하루를 반영한다.

전체 대여소 x 24시간을 매 요청마다 predict()하면 admin-analytics.js 페이지 로딩 한 번에
수천 번의 DB 조회가 필요해 감당할 수 없다. 그래서 자치구별 실제 대여량(위 추정치 기준) 상위
N개 대여소만 실제로 backtest하고, (자치구 실제 합계 / 표본 실제 합계) 비율로 스케일업해
자치구 전체 예측치를 근사한다. serving/scheduler.py가 매일 새벽 한 번 이 함수를 호출해
결과를 테이블에 저장해두면, /analytics/model-monitoring은 그 결과만 읽어 즉시 응답한다.

예측치 쪽 알려진 한계: build_feature_row는 demand_prediction_master_2024에 정확히 일치하는
행이 있을 때만(2024년 날짜) 과거 대여 이력(lag1h~lag168h) 피처를 채운다. 어제(2026년 이후
날짜)는 그 테이블에 없으므로 lag 계열 피처가 전부 0으로 근사된다 - routers/predict.py의
실시간 다음 시간 예측과 완전히 동일한 경로/한계이며, 이 배치가 새로 만든 문제가 아니다.
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.db_connection import engine
from models.models import DemandPredictionForecast, RtBikeStatus, StationLoc
from serving.district import DISTRICTS
from serving.feature import StationNotFoundError, build_feature_row
from serving.target_encoding import TargetEncodingCache

logger = logging.getLogger(__name__)

_SAMPLE_STATIONS_PER_DISTRICT = 8  # 클수록 근사치가 정확해지지만 배치 시간이 늘어난다
_RENT_TARGETS = ("general_rent_cnt", "sprout_rent_cnt")  # "총 대여량" = 이 둘의 합 (다른 analytics 엔드포인트와 동일한 정의)

# 스케줄러 기본 수집 주기(30분)의 1.5배. 서버 재시작 등으로 수집 공백이 생기면 그사이 몇 시간치
# 누적 변화량이 통째로 한 시간 버킷에 잡혀 스파이크가 생긴다 - 이 폭 밖의 간격은 신뢰할 수 없는
# 구간으로 보고 건너뛴다(과대집계보다 과소집계가 안전하다는 판단).
_MAX_SNAPSHOT_GAP = timedelta(minutes=45)


def _real_actual_by_hour_per_station(
    session: Session, target_date, district_name: str | None
) -> dict[str, dict[int, int]]:
    """target_date 하루 동안 rt_bike_status 스냅샷의 연속 감소분을 대여소별/시간대별로 합산한다."""
    stmt = (
        select(RtBikeStatus.station_id, RtBikeStatus.created_at, RtBikeStatus.parked_bike_cnt)
        .where(func.date(RtBikeStatus.created_at) == target_date)
        .order_by(RtBikeStatus.station_id, RtBikeStatus.created_at)
    )
    if district_name:
        stmt = stmt.join(StationLoc, StationLoc.station_id == RtBikeStatus.station_id).where(
            StationLoc.district == district_name
        )
    rows = session.execute(stmt).all()

    snapshots_by_station: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    for station_id, created_at, parked_cnt in rows:
        snapshots_by_station[station_id].append((created_at, int(parked_cnt or 0)))

    result: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for station_id, snapshots in snapshots_by_station.items():
        for (t0, c0), (t1, c1) in zip(snapshots, snapshots[1:]):
            if (t1 - t0) > _MAX_SNAPSHOT_GAP:
                continue  # 수집 공백 구간 - 이 구간의 변화량은 신뢰할 수 없어 건너뛴다
            delta = c1 - c0
            if delta < 0:
                result[station_id][t0.hour] += -delta

    return {sid: dict(hours) for sid, hours in result.items()}


def _sum_by_hour(per_station: dict[str, dict[int, int]], station_ids: list[str] | None = None) -> dict[int, int]:
    by_hour: dict[int, int] = defaultdict(int)
    for station_id, hours in per_station.items():
        if station_ids is not None and station_id not in station_ids:
            continue
        for h, v in hours.items():
            by_hour[h] += v
    return dict(by_hour)


def _sample_station_ids(per_station: dict[str, dict[int, int]]) -> list[str]:
    totals = {sid: sum(hours.values()) for sid, hours in per_station.items()}
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    return [sid for sid, _ in ranked[:_SAMPLE_STATIONS_PER_DISTRICT]]


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
    스케줄러가 매일 새벽 호출하는 진입점. 해당 target_date(달력 기준 어제)가 이미 계산돼
    있으면 건너뛴다(멱등). 실패해도 다음 스케줄에서 자연히 재시도되므로 예외를 삼키고
    로깅만 한다 - rt_collection 배치와 동일한 정책 (serving/scheduler.py 참고).

    rt_bike_status 수집이 시작된 지 얼마 안 됐거나 서버가 하루 종일 안 떠 있었으면 어제 하루
    중 일부 시간대만(혹은 전혀) 실측 스냅샷이 없을 수 있다 - 이 경우 그 시간대는 actual_total=0
    으로 저장되고, 프론트는 이를 "데이터 없음"과 동일하게 표시한다 (알려진 한계, 실제 서비스가
    계속 돌면서 rt_bike_status가 쌓일수록 자연히 해소된다).
    """
    try:
        with Session(engine) as session:
            target_date = date.today() - timedelta(days=1)

            already_done = session.execute(
                select(func.count()).select_from(DemandPredictionForecast)
                .where(DemandPredictionForecast.target_date == target_date)
            ).scalar_one()
            if already_done:
                logger.info("[모델 모니터링] %s는 이미 계산돼 있어 건너뜁니다.", target_date)
                return

            city_actual: dict[int, int] = {h: 0 for h in range(24)}
            city_predicted = {h: 0.0 for h in range(24)}
            city_sample_cnt = 0

            for district in DISTRICTS:
                per_station = _real_actual_by_hour_per_station(session, target_date, district["name"])
                sample_ids = _sample_station_ids(per_station)
                district_actual = _sum_by_hour(per_station)

                if sample_ids:
                    sample_predicted = _predicted_by_hour(session, sample_ids, target_date, champion_models, encoding_cache)
                    sample_actual = _sum_by_hour(per_station, sample_ids)
                    sample_actual_total = sum(sample_actual.values())
                    district_actual_total = sum(district_actual.values())
                    scale = (district_actual_total / sample_actual_total) if sample_actual_total else 0.0
                    district_predicted = {h: v * scale for h, v in sample_predicted.items()}
                else:
                    district_predicted = {h: 0.0 for h in range(24)}

                city_sample_cnt += len(sample_ids)
                for h in range(24):
                    city_actual[h] += district_actual.get(h, 0)
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
