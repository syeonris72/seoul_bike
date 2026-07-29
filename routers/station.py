from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from auth.deps import get_current_user, require_role
from database.db_connection import get_session
from models.models import Account, Report, FavoriteStation, Rental, StationStock, StationLoc
from schema.request import (
    ReportCreateRequest,
    FavoriteCreateRequest,
    RentalCreateRequest,
    ReturnRequest,
)
from schema.response import (
    DistrictOut,
    FavoriteOut,
    PublicSummaryOut,
    RentalOut,
    StationDetailOut,
    StationOut,
)
from serving.analytics_utils import latest_available_date, total_rentals_on
from serving.district import DISTRICTS, district_id as district_name_to_id, district_name
from serving.mapping import haversine_km, project_latlon_to_canvas
from serving.station_lookup import get_station_names, resolve_neighborhood
from serving.station_stock import classify_stock_level

router = APIRouter(prefix="/station", tags=["station"])

_CARBON_KG_PER_KM = 0.21  # 승용차 대비 km당 평균 CO2 절감량 근사치


def _station_out(station: StationLoc, inv: StationStock | None, name: str | None) -> StationOut:
    capacity = inv.capacity if inv else 0
    general = inv.general_bike_cnt if inv else 0
    sprout = inv.sprout_bike_cnt if inv else 0
    broken = inv.broken_bike_cnt if inv else 0
    total = general + sprout
    map_x, map_y = project_latlon_to_canvas(
        float(station.lat) if station.lat else None, float(station.lon) if station.lon else None
    )
    return StationOut(
        station_id=station.station_id,
        name=name or station.station_id,
        district_id=district_name_to_id(station.district),
        district_name=station.district,
        neighborhood_name=resolve_neighborhood(station),
        lat=float(station.lat) if station.lat else None,
        lon=float(station.lon) if station.lon else None,
        map_x=map_x,
        map_y=map_y,
        capacity=capacity,
        general_bike_cnt=general,
        sprout_bike_cnt=sprout,
        broken_bike_cnt=broken,
        total_bikes=total,
        stock_level=classify_stock_level(total, capacity),
    )


@router.get("/public/summary", response_model=PublicSummaryOut)
def public_summary(session: Session = Depends(get_session)) -> PublicSummaryOut:
    station_count = session.execute(select(func.count()).select_from(StationLoc)).scalar_one()
    total_bikes = session.execute(
        select(func.coalesce(func.sum(StationStock.general_bike_cnt + StationStock.sprout_bike_cnt), 0))
    ).scalar_one()
    latest_date = latest_available_date(session)
    return PublicSummaryOut(
        station_count=station_count,
        total_bikes=int(total_bikes),
        today_rentals=total_rentals_on(session, latest_date),
        as_of_label=latest_date.isoformat() if latest_date else "",
    )


@router.get("/stations", response_model=list[StationOut])
def list_stations(
    district_id: int | None = None,
    stock_level: str | None = None,
    session: Session = Depends(get_session),
    _user: Account = Depends(get_current_user),
) -> list[StationOut]:
    stmt = select(StationLoc)
    if district_id is not None:
        name = district_name(district_id)
        if name:
            stmt = stmt.where(StationLoc.district == name)
    stations = session.execute(stmt).scalars().all()

    inv_rows = session.execute(select(StationStock)).scalars().all()
    inv_by_id = {row.station_id: row for row in inv_rows}
    names = get_station_names(session, [s.station_id for s in stations])

    result = [_station_out(s, inv_by_id.get(s.station_id), names.get(s.station_id)) for s in stations]
    if stock_level:
        wanted = set(stock_level.split(","))
        result = [r for r in result if r.stock_level in wanted]
    return result


@router.get("/stations/{station_id}", response_model=StationDetailOut)
def get_station(
    station_id: str,
    session: Session = Depends(get_session),
    _user: Account = Depends(get_current_user),
) -> StationDetailOut:
    station = session.get(StationLoc, station_id)
    if station is None:
        raise HTTPException(404, f"Unknown station_id: {station_id}")
    inv = session.get(StationStock, station_id)
    names = get_station_names(session, [station_id])
    base = _station_out(station, inv, names.get(station_id))
    # neighborhood_name은 이제 address_1에서 뽑아낸 값이라(serving/station_lookup.extract_neighborhood)
    # 다시 이어붙이면 중복된다 - address_1 자체가 이미 완전한 주소.
    return StationDetailOut(**base.model_dump(), address=station.address_1)


@router.get("/districts", response_model=list[DistrictOut])
def list_districts(session: Session = Depends(get_session), _user: Account = Depends(get_current_user)) -> list[DistrictOut]:
    totals = dict(
        session.execute(
            select(StationLoc.district, func.coalesce(func.sum(StationStock.general_bike_cnt + StationStock.sprout_bike_cnt), 0))
            .join(StationStock, StationStock.station_id == StationLoc.station_id, isouter=True)
            .group_by(StationLoc.district)
        ).all()
    )
    return [DistrictOut(id=d["id"], name=d["name"], total_bikes=int(totals.get(d["name"], 0))) for d in DISTRICTS]


@router.post("/rentals", response_model=RentalOut)
def create_rental(
    req: RentalCreateRequest,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> RentalOut:
    inv = session.get(StationStock, req.station_id)
    if inv is None:
        raise HTTPException(404, f"Unknown station_id: {req.station_id}")

    # 일반 회원은 동시에 하나의 자전거만 대여할 수 있다.
    user_active_rental = session.execute(
        select(Rental.id).where(Rental.user_id == user.id, Rental.status == "대여중")
    ).scalar_one_or_none()
    if user_active_rental is not None:
        raise HTTPException(409, "이미 대여 중인 자전거가 있습니다. 반납 후 다시 대여해 주세요.")

    # 같은 자전거가 이미 대여중이면 거부 (동시 요청 사이의 잔여 경합은 아래 재고 원자적 업데이트가 좁혀준다).
    already_rented = session.execute(
        select(Rental.id).where(Rental.bike_id == req.bike_id, Rental.status == "대여중")
    ).scalar_one_or_none()
    if already_rented is not None:
        raise HTTPException(409, "이미 대여 중인 자전거입니다.")

    field = "general_bike_cnt" if req.bike_type == "general" else "sprout_bike_cnt"
    column = StationStock.general_bike_cnt if req.bike_type == "general" else StationStock.sprout_bike_cnt
    # 파이썬에서 읽은 값으로 감산하는 대신, DB에서 "재고 >= 1"을 조건으로 원자적으로 감산해
    # 동시 요청이 같은 재고를 동시에 통과해 음수로 내려가는 경쟁 조건을 막는다.
    result = session.execute(
        update(StationStock)
        .where(StationStock.station_id == req.station_id, column >= 1)
        .values({field: column - 1})
    )
    if result.rowcount == 0:
        raise HTTPException(409, "해당 대여소에 대여 가능한 자전거가 없습니다.")

    rental = Rental(
        user_id=user.id,
        bike_id=req.bike_id,
        bike_type=req.bike_type,
        rent_station_id=req.station_id,
        status="대여중",
    )
    session.add(rental)
    session.commit()
    session.refresh(rental)
    names = get_station_names(session, [rental.rent_station_id])
    return _rental_out(rental, names)


@router.patch("/rentals/{rental_id}/return", response_model=RentalOut)
def return_rental(
    rental_id: int,
    req: ReturnRequest,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> RentalOut:
    rental = session.get(Rental, rental_id)
    if rental is None or rental.user_id != user.id:
        raise HTTPException(404, "대여 기록을 찾을 수 없습니다.")
    if rental.status != "대여중":
        raise HTTPException(409, "이미 반납된 대여입니다.")
    if req.bike_id != rental.bike_id:
        raise HTTPException(400, "대여 중인 자전거 ID와 일치하지 않습니다.")

    return_inv = session.get(StationStock, req.return_station_id)
    if return_inv is None:
        raise HTTPException(404, f"Unknown station_id: {req.return_station_id}")

    rent_station = session.get(StationLoc, rental.rent_station_id)
    return_station = session.get(StationLoc, req.return_station_id)

    now = datetime.now()
    rental.return_station_id = req.return_station_id
    rental.return_time = now
    rental.status = "완료"
    rental.duration_min = max(0, int((now - rental.rent_time).total_seconds() // 60))

    if rent_station and return_station and rent_station.lat and rent_station.lon and return_station.lat and return_station.lon:
        rental.distance_km = haversine_km(
            float(rent_station.lat), float(rent_station.lon), float(return_station.lat), float(return_station.lon)
        )
    else:
        rental.distance_km = 0.0
    rental.carbon_reduction = round(rental.distance_km * _CARBON_KG_PER_KM, 2)

    field = "general_bike_cnt" if rental.bike_type == "general" else "sprout_bike_cnt"
    setattr(return_inv, field, getattr(return_inv, field) + 1)

    session.commit()
    session.refresh(rental)
    names = get_station_names(session, [rental.rent_station_id, rental.return_station_id])
    return _rental_out(rental, names)


@router.get("/rentals/active", response_model=RentalOut | None)
def active_rental(
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> RentalOut | None:
    rental = session.execute(
        select(Rental).where(Rental.user_id == user.id, Rental.status == "대여중")
    ).scalar_one_or_none()
    if rental is None:
        return None
    names = get_station_names(session, [rental.rent_station_id])
    return _rental_out(rental, names)


@router.get("/rentals/me", response_model=list[RentalOut])
def my_rentals(
    year: int | None = None,
    month: int | None = None,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> list[RentalOut]:
    stmt = select(Rental).where(Rental.user_id == user.id).order_by(Rental.rent_time.desc())
    if year:
        stmt = stmt.where(func.year(Rental.rent_time) == year)
    if month:
        stmt = stmt.where(func.month(Rental.rent_time) == month)
    rentals = session.execute(stmt).scalars().all()

    station_ids = set()
    for r in rentals:
        station_ids.add(r.rent_station_id)
        if r.return_station_id:
            station_ids.add(r.return_station_id)
    names = get_station_names(session, station_ids)
    return [_rental_out(r, names) for r in rentals]


def _rental_out(rental: Rental, names: dict[str, str | None]) -> RentalOut:
    return RentalOut(
        id=rental.id,
        user_id=rental.user_id,
        bike_id=rental.bike_id,
        bike_type=rental.bike_type,
        rent_station_id=rental.rent_station_id,
        rent_station_name=names.get(rental.rent_station_id),
        return_station_id=rental.return_station_id,
        return_station_name=names.get(rental.return_station_id) if rental.return_station_id else None,
        status=rental.status,
        rent_time=rental.rent_time,
        return_time=rental.return_time,
        distance_km=rental.distance_km,
        duration_min=rental.duration_min,
        carbon_reduction=rental.carbon_reduction,
    )


@router.get("/favorites", response_model=list[FavoriteOut])
def list_favorites(
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> list[FavoriteOut]:
    favs = session.execute(select(FavoriteStation).where(FavoriteStation.user_id == user.id)).scalars().all()
    names = get_station_names(session, [f.station_id for f in favs])
    inv_by_id = {
        row.station_id: row
        for row in session.execute(
            select(StationStock).where(StationStock.station_id.in_([f.station_id for f in favs]))
        ).scalars().all()
    }
    result = []
    for f in favs:
        inv = inv_by_id.get(f.station_id)
        result.append(FavoriteOut(
            id=f.id,
            station_id=f.station_id,
            station_name=names.get(f.station_id),
            general_bike_cnt=inv.general_bike_cnt if inv else 0,
            sprout_bike_cnt=inv.sprout_bike_cnt if inv else 0,
            capacity=inv.capacity if inv else 0,
        ))
    return result


@router.post("/favorites", response_model=FavoriteOut)
def add_favorite(
    req: FavoriteCreateRequest,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> FavoriteOut:
    station = session.get(StationLoc, req.station_id)
    if station is None:
        raise HTTPException(404, f"Unknown station_id: {req.station_id}")

    existing = session.execute(
        select(FavoriteStation).where(FavoriteStation.user_id == user.id, FavoriteStation.station_id == req.station_id)
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "이미 즐겨찾기에 추가된 대여소입니다.")

    fav = FavoriteStation(user_id=user.id, station_id=req.station_id)
    session.add(fav)
    session.commit()
    session.refresh(fav)

    inv = session.get(StationStock, req.station_id)
    names = get_station_names(session, [req.station_id])
    return FavoriteOut(
        id=fav.id,
        station_id=fav.station_id,
        station_name=names.get(req.station_id),
        general_bike_cnt=inv.general_bike_cnt if inv else 0,
        sprout_bike_cnt=inv.sprout_bike_cnt if inv else 0,
        capacity=inv.capacity if inv else 0,
    )


@router.delete("/favorites/{station_id}", status_code=204)
def remove_favorite(
    station_id: str,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> None:
    fav = session.execute(
        select(FavoriteStation).where(FavoriteStation.user_id == user.id, FavoriteStation.station_id == station_id)
    ).scalar_one_or_none()
    if fav is None:
        raise HTTPException(404, "즐겨찾기를 찾을 수 없습니다.")
    session.delete(fav)
    session.commit()


@router.post("/reports", status_code=201)
def create_report(
    req: ReportCreateRequest,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> dict:
    station = session.get(StationLoc, req.station_id)
    if station is None:
        raise HTTPException(404, f"Unknown station_id: {req.station_id}")

    report = Report(
        bike_id=req.bike_id,
        station_id=req.station_id,
        reported_by=user.id,
        issue=req.issue,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return {"id": report.id, "status": report.status, "reported_at": report.reported_at}
