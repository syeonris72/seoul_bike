"""
서비스 계정/운영 테이블(account, station_stock, rental, report,
dispatch, favorite_station) 생성 + station_stock 1회성 시딩.

실행: python -m data.init_tables
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from data.common_utils import init_db
from database.db_connection import engine
from models.models import (
    Account, StationStock, Rental, Report, Dispatch, FavoriteStation,
    DemandPredictionForecast, StationLoc, RtBikeStatus,
)
from serving.bike_split import compute_general_ratio, split_general_sprout

NEW_MODELS = [Account, StationStock, Rental, Report, Dispatch, FavoriteStation, DemandPredictionForecast]

_PLACEHOLDER_CAPACITY = 15  # rt_bike_status에 아직 값이 없는 대여소용 기본 거치대 수


def create_tables() -> None:
    init_db(engine, models=NEW_MODELS)


def _latest_rt_status_by_station(session: Session) -> dict[str, RtBikeStatus]:
    latest_ids = (
        select(RtBikeStatus.station_id, func.max(RtBikeStatus.id).label("max_id"))
        .group_by(RtBikeStatus.station_id)
        .subquery()
    )
    latest_rows = session.execute(
        select(RtBikeStatus).join(latest_ids, RtBikeStatus.id == latest_ids.c.max_id)
    ).scalars().all()
    return {row.station_id: row for row in latest_rows}


def seed_station_stock() -> None:
    """
    rt_bike_status에서 station_id별 최신 행을 가져와 station_stock를 시딩한다.
    일반/새싹 구분은 rent_history의 활동 비율(serving/bike_split.py)로 근사 분할한다.
    """
    with Session(engine) as session:
        latest_by_station = _latest_rt_status_by_station(session)
        ratios = compute_general_ratio(session)

        all_station_ids = session.execute(select(StationLoc.station_id)).scalars().all()
        existing_ids = set(session.execute(select(StationStock.station_id)).scalars().all())

        created = 0
        for station_id in all_station_ids:
            if station_id in existing_ids:
                continue
            row = latest_by_station.get(station_id)
            total = (row.parked_bike_cnt if row and row.parked_bike_cnt else 0)
            general, sprout = split_general_sprout(total, ratios.get(station_id, 0.9))
            session.add(StationStock(
                station_id=station_id,
                capacity=(row.rack_tot_cnt if row and row.rack_tot_cnt else _PLACEHOLDER_CAPACITY),
                general_bike_cnt=general,
                sprout_bike_cnt=sprout,
                broken_bike_cnt=0,
            ))
            created += 1

        session.commit()
        print(f"station_stock 시딩 완료: {created}행 생성 (전체 {len(all_station_ids)}개 대여소 중)")


def resync_general_sprout_split() -> None:
    """
    이미 존재하는 station_stock 행의 총대수(general+sprout)는 그대로 두고,
    rent_history 활동 비율로 general/sprout 분할만 다시 계산한다.
    (스케줄러가 rt_bike_status를 새로 수집한 뒤 호출 — 총대수 자체는 별도 로직에서 갱신)
    """
    with Session(engine) as session:
        ratios = compute_general_ratio(session)
        rows = session.execute(select(StationStock)).scalars().all()
        for inv in rows:
            total = inv.general_bike_cnt + inv.sprout_bike_cnt
            general, sprout = split_general_sprout(total, ratios.get(inv.station_id, 0.9))
            inv.general_bike_cnt = general
            inv.sprout_bike_cnt = sprout
        session.commit()
        print(f"station_stock 일반/새싹 비율 재계산 완료: {len(rows)}행")


if __name__ == "__main__":
    create_tables()
    seed_station_stock()
    print("done")
