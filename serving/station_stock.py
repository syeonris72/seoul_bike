from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.models import DemandPredictionMaster2024

_KST = ZoneInfo("Asia/Seoul")

# 시간당 평균 순감소(대여-반납) 대수가 이 값 이상이면 "정원의 90%를 넘겨도 곧 자연스럽게
# 빠질 대여소"로 보고 과포화 판정에서 제외한다. 0 근처의 잡음(예: 0.05대)까지 봐주면 실제로
# 정체된 대여소도 과포화가 아니라고 오판할 수 있어 최소 1대는 요구한다.
_SELF_RESOLVING_NET_OUTFLOW = 1.0


_hourly_net_outflow_cache: dict[int, dict[str, float]] | None = None


def _compute_hourly_net_outflow_all_hours(session: Session) -> dict[int, dict[str, float]]:
    """0~23시 x 대여소별 평균 순감소량을 한 번의 전체 스캔으로 모두 계산한다.
    datetime_hr을 func.hour()로 감싸 필터링하면(이전 구현) demand_prediction_master_2024가
    수백만 행이라 인덱스를 못 타 매 호출마다(요청 하나당 today-summary/stock-distribution
    두 번씩) 전체 테이블을 스캔했다 - 실측 결과 1회 스캔에만 1000초 가까이 걸려 페이지
    로딩을 사실상 막았다. 한 시간만 필터링하나 GROUP BY로 24시간을 한 번에 뽑으나 스캔
    비용(테이블 전체를 한 번 읽는 것)은 동일하므로, 대신 한 번만 스캔해 24시간 결과를
    전부 메모리에 캐싱해두고 프로세스가 떠 있는 동안 재사용한다."""
    hour_expr = func.hour(DemandPredictionMaster2024.datetime_hr)
    net = (
        DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt
        - DemandPredictionMaster2024.general_rtn_cnt - DemandPredictionMaster2024.sprout_rtn_cnt
    )
    stmt = (
        select(hour_expr, DemandPredictionMaster2024.station_id, func.avg(net))
        .group_by(hour_expr, DemandPredictionMaster2024.station_id)
    )
    result: dict[int, dict[str, float]] = {h: {} for h in range(24)}
    for h, station_id, avg_val in session.execute(stmt).all():
        result[int(h)][station_id] = float(avg_val or 0.0)
    return result


def hourly_net_outflow_by_station(
    session: Session, hour: int | None = None, station_ids: list[str] | None = None
) -> dict[str, float]:
    """대여소별로 주어진 시간대(기본: 현재 KST 시각)에 2024년 이력 기준으로 기대되는
    순감소량(평균 대여 - 평균 반납)을 계산한다. 양수면 그 시간대엔 그 대여소가 유동인구가
    많아 자연스럽게 빠지는 경향이 있다는 뜻 - classify_stock_level이 이 값을 받아 회전이
    빠른 대여소를 그저 꽉 찼다는 이유로 과포화라고 오판하지 않게 하는 데 쓴다."""
    global _hourly_net_outflow_cache
    if hour is None:
        hour = datetime.now(_KST).hour
    if _hourly_net_outflow_cache is None:
        _hourly_net_outflow_cache = _compute_hourly_net_outflow_all_hours(session)
    by_station = _hourly_net_outflow_cache.get(hour, {})
    if station_ids is not None:
        by_station = {sid: v for sid, v in by_station.items() if sid in station_ids}
    return by_station


def classify_stock_level(total: int, capacity: int, expected_net_outflow: float = 0.0) -> str:
    """대여소 재고 상태(과포화/고갈/부족/적정)를 정원 대비 비율로 판정한다.

    이전 버전(mock-data.js의 classifyStockLevel을 그대로 포팅한 것)은 과포화만
    비율(90%) 기준이고 고갈/부족은 절대 대수(<=1대/<=3대) 기준이라 정원이 큰
    대여소는 실제로 거의 비어 있어도(예: 정원 50에 5대 = 10%) "적정"으로,
    정원이 작은 대여소는 꽤 차 있어도(예: 정원 5에 3대 = 60%) "부족"으로
    잘못 판정되는 문제가 있었다. 네 등급 모두 정원 대비 비율로 통일한다.

    expected_net_outflow(hourly_net_outflow_by_station 참고)가 충분히 양수면, 정원의
    90%를 넘겨도 과포화로 보지 않는다 - 원래 유동인구가 많아 곧 자연스럽게 빠질 대여소를
    배차가 필요한 것처럼 오판하지 않기 위함. 기본값 0은 이 신호 없이 순수 비율만 쓰던
    이전 동작과 동일하다."""
    if capacity <= 0:
        return "적정"
    pct = total / capacity
    if pct >= 0.9 and expected_net_outflow < _SELF_RESOLVING_NET_OUTFLOW:
        return "과포화"
    if total == 0 or pct <= 0.1:
        return "고갈"
    if pct <= 0.3:
        return "부족"
    return "적정"
