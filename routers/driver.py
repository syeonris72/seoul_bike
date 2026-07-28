from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.deps import require_role
from database.db_connection import get_session
from models.models import Account, Dispatch, StationStock
from schema.request import DispatchStatusUpdateRequest
from schema.response import DispatchOut
from serving.station_lookup import get_station_names

router = APIRouter(prefix="/driver", tags=["driver"])


def _dispatch_out(order: Dispatch, names: dict, driver_name: str | None) -> DispatchOut:
    return DispatchOut(
        id=order.id,
        from_station_id=order.from_station_id,
        from_station_name=names.get(order.from_station_id),
        to_station_id=order.to_station_id,
        to_station_name=names.get(order.to_station_id),
        general_qty=order.general_qty,
        sprout_qty=order.sprout_qty,
        driver_id=order.driver_id,
        driver_name=driver_name,
        ordered_by=order.ordered_by,
        ordered_at=order.ordered_at,
        pickup_completed_at=order.pickup_completed_at,
        dropoff_completed_at=order.dropoff_completed_at,
        status=order.status,
        is_emergency=order.is_emergency,
        order_type=order.order_type,
        report_id=order.report_id,
    )


@router.get("/orders", response_model=list[DispatchOut])
def my_orders(
    status: str | None = None,
    session: Session = Depends(get_session),
    driver: Account = Depends(require_role("driver")),
) -> list[DispatchOut]:
    stmt = select(Dispatch).where(Dispatch.driver_id == driver.id)
    if status:
        stmt = stmt.where(Dispatch.status.in_(status.split(",")))
    orders = session.execute(stmt.order_by(Dispatch.ordered_at.desc())).scalars().all()

    station_ids = set()
    for o in orders:
        station_ids.update([o.from_station_id, o.to_station_id])
    names = get_station_names(session, station_ids)
    return [_dispatch_out(o, names, driver.name) for o in orders]


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(high, value))


@router.patch("/orders/{order_id}", response_model=DispatchOut)
def update_order(
    order_id: int,
    req: DispatchStatusUpdateRequest,
    session: Session = Depends(get_session),
    driver: Account = Depends(require_role("driver")),
) -> DispatchOut:
    order = session.get(Dispatch, order_id)
    if order is None or order.driver_id != driver.id:
        raise HTTPException(404, "지시서를 찾을 수 없습니다.")

    if req.action == "start":
        if order.status != "대기":
            raise HTTPException(409, "대기 상태의 지시서만 시작할 수 있습니다.")
        active = session.execute(
            select(Dispatch).where(Dispatch.driver_id == driver.id, Dispatch.status == "진행중")
        ).scalar_one_or_none()
        if active is not None:
            raise HTTPException(400, "이미 진행 중인 지시서가 있습니다.")
        order.status = "진행중"
        order.pickup_completed_at = datetime.now()

    elif req.action == "complete":
        if order.status != "진행중":
            raise HTTPException(409, "진행 중인 지시서만 완료 처리할 수 있습니다.")
        order.status = "완료"
        order.dropoff_completed_at = datetime.now()

        if order.order_type == "고장수거":
            # 고장수거는 from==to station이며, 현장에서 고장 자전거를 수거해 가는 것이므로
            # 일반/새싹 재고가 아니라 broken_bike_cnt만 감소시킨다.
            inv = session.get(StationStock, order.from_station_id)
            if inv:
                inv.broken_bike_cnt = _clamp(inv.broken_bike_cnt - order.general_qty, 0, 10_000)
        else:
            from_inv = session.get(StationStock, order.from_station_id)
            to_inv = session.get(StationStock, order.to_station_id)
            if from_inv:
                from_inv.general_bike_cnt = _clamp(from_inv.general_bike_cnt - order.general_qty, 0, 10_000)
                from_inv.sprout_bike_cnt = _clamp(from_inv.sprout_bike_cnt - order.sprout_qty, 0, 10_000)
            if to_inv:
                to_inv.general_bike_cnt = _clamp(to_inv.general_bike_cnt + order.general_qty, 0, to_inv.capacity or 10_000)
                to_inv.sprout_bike_cnt = _clamp(to_inv.sprout_bike_cnt + order.sprout_qty, 0, to_inv.capacity or 10_000)

    session.commit()
    session.refresh(order)
    names = get_station_names(session, [order.from_station_id, order.to_station_id])
    return _dispatch_out(order, names, driver.name)
