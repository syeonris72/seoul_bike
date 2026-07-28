"""
demand_prediction_master_2024는 2024년치 과거 데이터뿐이라 실제 '오늘' 행이 존재하지
않는다. 항상 가용한 가장 최근 날짜로 폴백하고, 그 날짜를 라벨로 같이 반환해
프론트가 "최근 데이터 기준"임을 표시할 수 있게 한다.
"""
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.models import DemandPredictionMaster2024


_MIN_ROWS_FOR_FULL_DAY = 1000  # 마지막 날짜가 자정 근처 일부 행만 있는 partial day면 건너뛴다


def latest_available_date(session: Session) -> date | None:
    date_expr = func.date(DemandPredictionMaster2024.datetime_hr)
    rows = session.execute(
        select(date_expr, func.count())
        .group_by(date_expr)
        .order_by(date_expr.desc())
        .limit(3)
    ).all()
    for d, cnt in rows:
        if cnt >= _MIN_ROWS_FOR_FULL_DAY:
            return d
    return rows[0][0] if rows else None


def total_rentals_on(session: Session, target_date: date, district: str | None = None) -> int:
    if target_date is None:
        return 0
    stmt = select(
        func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt)
    ).where(func.date(DemandPredictionMaster2024.datetime_hr) == target_date)
    if district:
        stmt = stmt.where(DemandPredictionMaster2024.district == district)
    return int(session.execute(stmt).scalar_one_or_none() or 0)
