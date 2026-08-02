from sqlalchemy import select
from sqlalchemy.orm import Session

from models.models import Dispatch, Report


def bike_ids_by_dispatch(session: Session, orders: list[Dispatch]) -> dict[int, list[str]]:
    """고장수거 지시서별로 수거 대상 자전거 ID 목록을 묶어 준다.

    지시서에는 대표 신고(report_id) 하나만 저장돼 있고 나머지 신고는 저장돼 있지 않으므로,
    list_reports(routers/admin.py)와 동일한 시간창 매칭(같은 대여소에서 그 지시서 발행 시점
    이전에 접수되고 아직 더 이른 지시서에 매칭되지 않은 신고)으로 역으로 묶는다.
    """
    broken_orders = [o for o in orders if o.order_type == "고장수거"]
    result: dict[int, list[str]] = {o.id: [] for o in broken_orders}
    if not broken_orders:
        return result

    orders_by_station: dict[str, list[Dispatch]] = {}
    for o in broken_orders:
        orders_by_station.setdefault(o.from_station_id, []).append(o)
    for lst in orders_by_station.values():
        lst.sort(key=lambda o: o.ordered_at)

    station_ids = list(orders_by_station.keys())
    reports = session.execute(
        select(Report).where(Report.station_id.in_(station_ids)).order_by(Report.reported_at)
    ).scalars().all()

    for r in reports:
        order = next(
            (o for o in orders_by_station.get(r.station_id, []) if o.ordered_at >= r.reported_at),
            None,
        )
        if order:
            result[order.id].append(r.bike_id)

    return result
