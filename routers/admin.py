from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.deps import require_role
from database.db_connection import get_session
from models.models import Account, Report, Dispatch, StationLoc
from schema.request import DispatchCreateRequest, ReportDispatchCreateRequest
from schema.response import AccountOut, ReportOut, DispatchOut
from serving.district import district_name
from serving.report_matching import bike_ids_by_dispatch
from serving.station_lookup import get_station_names

router = APIRouter(prefix="/admin", tags=["admin"])


def _dispatch_out(order: Dispatch, names: dict, driver_names: dict, bike_ids: list[str] | None = None) -> DispatchOut:
    return DispatchOut(
        id=order.id,
        from_station_id=order.from_station_id,
        from_station_name=names.get(order.from_station_id),
        to_station_id=order.to_station_id,
        to_station_name=names.get(order.to_station_id),
        general_qty=order.general_qty,
        sprout_qty=order.sprout_qty,
        driver_id=order.driver_id,
        driver_name=driver_names.get(order.driver_id) if order.driver_id else None,
        ordered_by=order.ordered_by,
        ordered_at=order.ordered_at,
        pickup_completed_at=order.pickup_completed_at,
        dropoff_completed_at=order.dropoff_completed_at,
        status=order.status,
        is_emergency=order.is_emergency,
        order_type=order.order_type,
        report_id=order.report_id,
        bike_ids=bike_ids or [],
    )


def _driver_names(session: Session, driver_ids: set[int]) -> dict[int, str]:
    if not driver_ids:
        return {}
    rows = session.execute(select(Account.id, Account.name).where(Account.id.in_(driver_ids))).all()
    return dict(rows)


@router.get("/drivers", response_model=list[AccountOut])
def list_drivers(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[AccountOut]:
    stmt = select(Account).where(Account.role == "driver", Account.is_active.is_(True))
    if district_id is not None:
        stmt = stmt.where(Account.district_id == district_id)
    drivers = session.execute(stmt).scalars().all()
    return [
        AccountOut(
            id=d.id, login_id=d.login_id, name=d.name, role=d.role,
            district_id=d.district_id, district_name=district_name(d.district_id),
            phone=d.phone, email=d.email, created_at=d.created_at,
        )
        for d in drivers
    ]


@router.get("/dispatch", response_model=list[DispatchOut])
def list_dispatches(
    status: str | None = None,
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[DispatchOut]:
    stmt = select(Dispatch)
    if status:
        stmt = stmt.where(Dispatch.status.in_(status.split(",")))
    if district_id is not None:
        name = district_name(district_id)
        if name:
            stmt = stmt.join(StationLoc, StationLoc.station_id == Dispatch.from_station_id).where(
                StationLoc.district == name
            )
    orders = session.execute(stmt.order_by(Dispatch.ordered_at.desc())).scalars().all()

    station_ids = set()
    driver_ids = set()
    for o in orders:
        station_ids.update([o.from_station_id, o.to_station_id])
        if o.driver_id:
            driver_ids.add(o.driver_id)
    names = get_station_names(session, station_ids)
    driver_names = _driver_names(session, driver_ids)
    bike_ids_map = bike_ids_by_dispatch(session, orders)
    return [_dispatch_out(o, names, driver_names, bike_ids_map.get(o.id)) for o in orders]


@router.post("/dispatch", response_model=DispatchOut)
def create_dispatch(
    req: DispatchCreateRequest,
    session: Session = Depends(get_session),
    admin: Account = Depends(require_role("admin")),
) -> DispatchOut:
    if session.get(StationLoc, req.from_station_id) is None:
        raise HTTPException(404, f"Unknown station_id: {req.from_station_id}")
    if session.get(StationLoc, req.to_station_id) is None:
        raise HTTPException(404, f"Unknown station_id: {req.to_station_id}")
    if req.driver_id is None:
        raise HTTPException(400, "담당 기사를 배정해야 지시서를 전송할 수 있습니다.")

    order = Dispatch(
        from_station_id=req.from_station_id,
        to_station_id=req.to_station_id,
        general_qty=req.general_qty,
        sprout_qty=req.sprout_qty,
        driver_id=req.driver_id,
        ordered_by=admin.id,
        is_emergency=req.is_emergency,
        order_type="일반",
    )
    session.add(order)
    session.commit()
    session.refresh(order)

    names = get_station_names(session, [order.from_station_id, order.to_station_id])
    driver_names = _driver_names(session, {order.driver_id} if order.driver_id else set())
    return _dispatch_out(order, names, driver_names)


@router.get("/reports", response_model=list[ReportOut])
def list_reports(
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[ReportOut]:
    reports = session.execute(select(Report).order_by(Report.reported_at.desc())).scalars().all()

    report_ids = [r.id for r in reports]
    linked_orders: dict[int, Dispatch] = {}
    if report_ids:
        for o in session.execute(select(Dispatch).where(Dispatch.report_id.in_(report_ids))).scalars().all():
            linked_orders[o.report_id] = o

    # 대표 신고(report_id)로 연결 안 된 나머지 신고도, 같은 station에 그 신고 시점 이후 발행된
    # 고장수거 지시서가 있으면 그 지시서 상태를 보여준다 (목업의 시간창 매칭 방식을 서버 쿼리로 재현).
    station_orders = session.execute(
        select(Dispatch).where(Dispatch.order_type == "고장수거")
    ).scalars().all()

    station_ids = {r.station_id for r in reports}
    driver_ids = {o.driver_id for o in linked_orders.values() if o.driver_id} | {
        o.driver_id for o in station_orders if o.driver_id
    }
    names = get_station_names(session, station_ids)
    driver_names = _driver_names(session, driver_ids)

    result = []
    for r in reports:
        order = linked_orders.get(r.id)
        if order is None:
            order = next(
                (o for o in station_orders if o.from_station_id == r.station_id and o.ordered_at >= r.reported_at),
                None,
            )
        result.append(ReportOut(
            id=r.id,
            bike_id=r.bike_id,
            station_id=r.station_id,
            station_name=names.get(r.station_id),
            reported_by=r.reported_by,
            issue=r.issue,
            status=r.status,
            reported_at=r.reported_at,
            dispatch_status=order.status if order else None,
            driver_name=driver_names.get(order.driver_id) if order and order.driver_id else None,
        ))
    return result


@router.post("/reports/dispatch", response_model=DispatchOut)
def dispatch_reports(
    req: ReportDispatchCreateRequest,
    session: Session = Depends(get_session),
    admin: Account = Depends(require_role("admin")),
) -> DispatchOut:
    if session.get(StationLoc, req.station_id) is None:
        raise HTTPException(404, f"Unknown station_id: {req.station_id}")
    if req.driver_id is None:
        raise HTTPException(400, "담당 기사를 배정해야 지시서를 전송할 수 있습니다.")

    existing_orders = session.execute(
        select(Dispatch).where(Dispatch.order_type == "고장수거", Dispatch.from_station_id == req.station_id)
    ).scalars().all()
    already_linked_report_ids = {o.report_id for o in existing_orders if o.report_id}
    # report_id는 지시서당 하나만 저장되므로(list_reports의 시간창 매칭과 동일하게),
    # 이미 지시서가 발행된 시점 이전에 접수된 신고는 함께 묶인 것으로 보고 재배차 대상에서 제외한다.
    latest_ordered_at = max((o.ordered_at for o in existing_orders), default=None)

    stmt = select(Report).where(
        Report.station_id == req.station_id,
        ~Report.id.in_(already_linked_report_ids or [-1]),
    )
    if latest_ordered_at is not None:
        stmt = stmt.where(Report.reported_at > latest_ordered_at)
    unassigned = session.execute(stmt).scalars().all()
    if not unassigned:
        raise HTTPException(409, "이 대여소에 미배정 고장 신고가 없습니다.")

    order = Dispatch(
        from_station_id=req.station_id,
        to_station_id=req.station_id,
        general_qty=len(unassigned),
        sprout_qty=0,
        driver_id=req.driver_id,
        ordered_by=admin.id,
        order_type="고장수거",
        report_id=unassigned[0].id,
    )
    session.add(order)
    session.commit()
    session.refresh(order)

    names = get_station_names(session, [order.from_station_id])
    driver_names = _driver_names(session, {order.driver_id} if order.driver_id else set())
    bike_ids = [r.bike_id for r in unassigned]
    return _dispatch_out(order, names, driver_names, bike_ids)
