"""
rt_bike_status(30분 간격 실시간 거치대 재고 스냅샷)의 연속 증감으로 대여/반납 흐름을
추정하는 공용 저수준 로직. serving/demand_prediction_forecast.py(자치구 단위 "실제
이용량" 집계)와 serving/rent_history.py(개별 대여소의 lag/rolling 피처 라이브 폴백)
양쪽에서 이 판단 기준(스냅샷 간격이 얼마나 벌어지면 못 믿을 구간인지)을 공유한다 -
따로 두면 한쪽만 튜닝하고 다른 쪽은 안 바꿔 기준이 어긋나는 사고가 생기기 쉽다.

rt_bike_status는 서울시 공공 API를 30분 주기로 긁어온 스냅샷이라, 우리 앱 안에서
방금 일어난 대여(Rental, routers/station.py create_rental)는 다음 수집 주기 전까지
분석 화면에 반영되지 않는다. estimated_rentals는 이 스냅샷 기반 추정치에 Rental
테이블의 실제 대여 이벤트(rent_time)를 곧바로 더해, 우리 앱에서 대여가 발생하는
즉시 시간대별/요일별/자치구별 집계에 반영되게 한다.
"""
import math
from collections import defaultdict
from datetime import datetime, timedelta

import numpy as np
from scipy.spatial import cKDTree
from sqlalchemy import select
from sqlalchemy.orm import Session

from models.models import Rental, RtBikeStatus, StationLoc

_EARTH_RADIUS_KM = 6371.0

# collect_rt_bike()는 한 번 실행될 때 대상 대여소 전체를 훑어 단일 커밋으로 적재한다 -
# 같은 실행에서 나온 행들의 created_at은 실행 시각 근처(보통 몇 초~몇 분) 안에 몰려
# 찍힌다. 이 폭으로 반올림하면 같은 수집 실행끼리는 한 버킷으로 묶이고, 스케줄러 주기
# (30분, serving/scheduler.py RT_COLLECT_INTERVAL_MINUTES)보다 훨씬 좁아 서로 다른
# 실행이 섞일 위험은 없다.
_FLOW_BUCKET_MINUTES = 5

# estimated_flow_edges의 버킷별 최근접 매칭은 O(감소역수 x 증가역수)라, 수집 기간
# 전체(수만~수십만 스냅샷)를 다 훑으면 대여소가 많은 자치구에서 수 초~십수 초가 걸려
# 실시간 대시보드 위젯으로 쓰기엔 너무 느리다(실측: 서울 4개구 전체 기준 약 11초).
# 게다가 수집이 계속 쌓일수록 매 요청마다 갈수록 느려지는 구조적 문제도 있다. "최근
# 이동 흐름"이라는 위젯 성격상 오래된 스냅샷까지 반영할 필요도 없어, 최근 며칠로 창을
# 고정해 계산량과 응답 시간을 이 범위 안으로 묶어둔다.
FLOW_ESTIMATE_LOOKBACK = timedelta(days=3)

# 스케줄러 기본 수집 주기(30분, serving/scheduler.py RT_COLLECT_INTERVAL_MINUTES)의
# 1.5배. 서버 재시작 등으로 수집 공백이 생기면 그 사이 누적된 변화량이 통째로 한
# 시간 버킷에 잡혀 스파이크가 생긴다 - 이 폭 밖의 간격은 신뢰할 수 없는 구간으로 보고
# 건너뛴다(과대집계보다 과소집계가 안전하다는 판단).
MAX_SNAPSHOT_GAP = timedelta(minutes=45)


def snapshot_delta(t0: datetime, c0: int | None, t1: datetime, c1: int | None) -> int | None:
    """두 스냅샷(t0, c0) -> (t1, c1) 사이의 부호 있는 재고 변화량(c1 - c0).
    간격이 MAX_SNAPSHOT_GAP보다 넓으면(수집 공백) None을 반환해 호출부가 건너뛰게 한다."""
    if (t1 - t0) > MAX_SNAPSHOT_GAP:
        return None
    return int(c1 or 0) - int(c0 or 0)


def _app_rental_events(
    session: Session,
    district_name: str | None,
    start: datetime | None,
    end: datetime | None,
) -> list[tuple[str, datetime, int]]:
    """우리 앱에서 실제로 발생한 대여(Rental.rent_time)를 (station_id, rent_time, 1)
    이벤트로 반환한다. 반납 대기 중(대여중)이든 완료든 대여가 발생한 시점 자체는
    이미 확정된 사실이라 상태와 무관하게 센다."""
    stmt = select(Rental.rent_station_id, Rental.rent_time)
    if district_name:
        stmt = stmt.join(StationLoc, StationLoc.station_id == Rental.rent_station_id).where(
            StationLoc.district == district_name
        )
    if start is not None:
        stmt = stmt.where(Rental.rent_time >= start)
    if end is not None:
        stmt = stmt.where(Rental.rent_time < end)
    return [(station_id, rent_time, 1) for station_id, rent_time in session.execute(stmt).all()]


def estimated_rentals(
    session: Session,
    district_name: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[tuple[str, datetime, int]]:
    """대여소별 rt_bike_status 스냅샷을 시간순으로 훑어, 연속된 두 스냅샷 사이에
    parked_bike_cnt가 줄어든 만큼을 그 구간(start=t0)에서 발생한 대여로 추정한다.
    (station_id, interval_start, estimated_rent_cnt) 목록을 돌려준다 - 30분 간격으로
    계속 쌓이는 이 실시간 거치대 스냅샷이 "시간대별/요일별/자치구별 실제 이용 패턴"을
    보여줄 수 있는 핵심 소스다. serving/demand_prediction_forecast.py의
    _real_actual_by_hour_per_station와 같은 원리이되, 특정 하루에 묶이지 않고
    routers/analytics.py의 누적 집계 엔드포인트들이 공유해 쓸 수 있게 일반화했다.
    자정을 걸치는 스냅샷 쌍은 start/end 구간 필터에 걸려 두 스냅샷 다 범위 안에
    들어와야만 잡힌다 - _real_actual_by_hour_per_station의 하루 단위 집계와 동일한
    한계이며 새로 생긴 문제가 아니다.

    여기에 더해, 우리 앱 자체 대여 트랜잭션(Rental)도 같은 형식의 이벤트로 합쳐
    반환한다 - rt_bike_status는 다음 30분 수집 주기가 돌아야 반영되지만, 앱에서
    직접 발생한 대여는 _app_rental_events를 통해 즉시 집계에 잡힌다."""
    stmt = (
        select(RtBikeStatus.station_id, RtBikeStatus.created_at, RtBikeStatus.parked_bike_cnt)
        .order_by(RtBikeStatus.station_id, RtBikeStatus.created_at)
    )
    if district_name:
        stmt = stmt.join(StationLoc, StationLoc.station_id == RtBikeStatus.station_id).where(
            StationLoc.district == district_name
        )
    if start is not None:
        stmt = stmt.where(RtBikeStatus.created_at >= start)
    if end is not None:
        stmt = stmt.where(RtBikeStatus.created_at < end)
    rows = session.execute(stmt).all()

    snapshots_by_station: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    for station_id, created_at, parked_cnt in rows:
        snapshots_by_station[station_id].append((created_at, int(parked_cnt or 0)))

    events: list[tuple[str, datetime, int]] = []
    for station_id, snapshots in snapshots_by_station.items():
        for (t0, c0), (t1, c1) in zip(snapshots, snapshots[1:]):
            delta = snapshot_delta(t0, c0, t1, c1)
            if delta is not None and delta < 0:
                events.append((station_id, t0, -delta))

    events.extend(_app_rental_events(session, district_name, start, end))
    return events


def _floor_to_bucket(dt: datetime, minutes: int = _FLOW_BUCKET_MINUTES) -> datetime:
    discard = timedelta(minutes=dt.minute % minutes, seconds=dt.second, microseconds=dt.microsecond)
    return dt - discard


def estimated_flow_edges(
    session: Session, district_name: str | None = None
) -> dict[tuple[str, str], int]:
    """rt_bike_status만으로는 어느 대여소에서 어느 대여소로 이동했는지(출발-도착 쌍)를
    알 수 없다 - 서울시 공공 API(bikeList)가 자전거 개별 이동 기록이 아니라 대여소별
    재고 스냅샷만 주기 때문이다. 그래서 같은 수집 버킷(_floor_to_bucket) 안에서 재고가
    줄어든 대여소(감소역)를, 늘어난 대여소(증가역) 중 가장 가까운 곳부터 순서대로
    짝지어(최근접 그리디 매칭) "이동했을 가능성이 높은" 흐름을 근사한다. 버킷마다 증가역
    좌표로 KD-tree(scipy.spatial.cKDTree)를 세워 최근접 탐색하므로, 감소역 x 증가역 전체
    쌍에 거리를 다 계산하는 것보다 훨씬 빠르다 - 자치구 전체 기준 실측 약 11초 -> 1초
    미만으로 줄었다.

    이건 실측이 아니라 통계적 추정치다 - 같은 시간대에 우연히 감소/증가가 겹쳤을 뿐
    실제로는 무관한 두 대여소가 짝지어질 수 있다. routers/analytics.py의 /flow는 이
    추정치를 실제 완료된 Rental 이동 이력과 합산해서 반환한다 - 표본이 적은 Rental만으로는
    보이지 않는 서울시 전체 이용 규모를 함께 보여주기 위해서다.

    계산 비용 때문에 FLOW_ESTIMATE_LOOKBACK(기본 최근 3일)로 조회 구간을 제한한다 -
    이 함수 docstring 위 상수 설명 참고."""
    since = datetime.now() - FLOW_ESTIMATE_LOOKBACK
    stmt = (
        select(
            RtBikeStatus.station_id, RtBikeStatus.created_at, RtBikeStatus.parked_bike_cnt,
            StationLoc.lat, StationLoc.lon,
        )
        .join(StationLoc, StationLoc.station_id == RtBikeStatus.station_id)
        .where(RtBikeStatus.created_at >= since)
        .order_by(RtBikeStatus.station_id, RtBikeStatus.created_at)
    )
    if district_name:
        stmt = stmt.where(StationLoc.district == district_name)
    rows = session.execute(stmt).all()

    snapshots_by_station: dict[str, list[tuple[datetime, int]]] = defaultdict(list)
    loc_by_station: dict[str, tuple[float, float]] = {}
    for station_id, created_at, parked_cnt, lat, lon in rows:
        snapshots_by_station[station_id].append((created_at, int(parked_cnt or 0)))
        if lat is not None and lon is not None:
            loc_by_station[station_id] = (float(lat), float(lon))

    bucket_deltas: dict[datetime, dict[str, int]] = defaultdict(dict)
    for station_id, snapshots in snapshots_by_station.items():
        for (t0, c0), (t1, c1) in zip(snapshots, snapshots[1:]):
            delta = snapshot_delta(t0, c0, t1, c1)
            if delta:
                bucket_deltas[_floor_to_bucket(t0)][station_id] = delta

    flow: dict[tuple[str, str], int] = defaultdict(int)
    for deltas in bucket_deltas.values():
        decreases = sorted(
            ([sid, -d] for sid, d in deltas.items() if d < 0 and sid in loc_by_station),
            key=lambda pair: pair[1], reverse=True,
        )
        increases = [[sid, d] for sid, d in deltas.items() if d > 0 and sid in loc_by_station]
        if not decreases or not increases:
            continue

        # 위경도를 이 버킷 대여소들 근처를 기준으로 한 평면 km 좌표로 바꿔 KD-tree에 태운다
        # (서울시 규모에선 이 근사가 실제 haversine 거리와 오차가 무시할 만큼 작다).
        lat0 = sum(loc_by_station[sid][0] for sid, _ in increases) / len(increases)
        cos_lat0 = math.cos(math.radians(lat0))

        def to_xy(lat: float, lon: float) -> tuple[float, float]:
            return (math.radians(lon) * cos_lat0 * _EARTH_RADIUS_KM, math.radians(lat) * _EARTH_RADIUS_KM)

        inc_coords = np.array([to_xy(*loc_by_station[sid]) for sid, _ in increases])
        tree = cKDTree(inc_coords)
        k = min(len(increases), 8)

        for from_id, remaining in decreases:
            fx, fy = to_xy(*loc_by_station[from_id])
            while remaining > 0:
                _, idxs = tree.query((fx, fy), k=k)
                idxs = np.atleast_1d(idxs)
                target = next(
                    (i for i in idxs if i < len(increases) and increases[i][1] > 0 and increases[i][0] != from_id),
                    None,
                )
                if target is None:
                    # 가까운 상위 k개가 전부 소진됐을 때만 타는 드문 폴백 경로 - 남은 후보 전체를 직접 훑는다.
                    target = next(
                        (i for i, c in enumerate(increases) if c[1] > 0 and c[0] != from_id), None
                    )
                if target is None:
                    break
                sid, amt = increases[target]
                take = min(remaining, amt)
                flow[(from_id, sid)] += take
                increases[target][1] -= take
                remaining -= take

    return dict(flow)
