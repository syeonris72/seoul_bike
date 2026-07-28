"""
station_loc 정비 스크립트 모음 (전부 1회성):

1) fix_coords() / backfill_admin_dong_for(): 좌표가 (0,0)으로 잘못 기록된 대여소를
   고친다. 원본 데이터 결함으로 좌표가 (0,0)인 대여소들은 ml/baseline.ipynb의 피처
   엔지니어링 단계("대여소 위치 좌표 보정" 셀)에서 이미 한 번 수작업으로 보정한 적이
   있다 - 다만 그건 학습용 DataFrame만 고쳤을 뿐 DB station_loc은 그대로였다. 그 값을
   그대로 station_loc에 반영하고, 좌표가 생겼으니 이어서 그 대여소들만
   data/backfill_neighborhood.py의 역지오코딩을 다시 돌려 admin_dong까지 채운다.

2) dedupe_and_clean_stations(): 대여소명이 겹치는 중복 대여소는 거치 자전거가 있는
   쪽으로 합치고, 빈 쪽은 삭제한다 (주소만 겹치는 경우는 대상에서 제외 - 국회/
   LG사이언스파크처럼 한 주소에 여러 개의 독립적인 실제 거치대가 있는 경우가 대부분이라
   잘못 합치면 운영 중인 대여소가 사라진다). 실측 이름이 한 번도 기록된 적 없고
   (rt_bike_status.station_name 전무) 거치 자전거도 0대인 대여소는 삭제한다.

   station_loc을 지우기 전에 FK로 물려있는 station_stock/infra_master 행을 먼저
   지운다. rent_history_2023/2024, demand_prediction_master_2024는 station_loc에
   FK로 연결되어 있지 않고(스키마상 plain 컬럼) 과거 실측 이력이라 삭제 대상에서
   제외 - 정류장이 없어져도 학습 데이터로는 유효하다. 실행 전 대상 행을 JSON으로
   백업한다(data/backups/).

실행: python -m data.fix_station_loc
"""
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from data.backfill_neighborhood import _reverse_geocode_dong
from database.db_connection import engine
from models.models import StationLoc, StationStock, RtBikeStatus, InfraMaster
from serving.station_lookup import get_station_names


# ml/baseline.ipynb "대여소 위치 좌표 보정" 셀의 HARDCODED_COORDS를 그대로 옮겨왔다.
# baseline.ipynb 쪽 값이 바뀌면 여기도 같이 바꿔야 한다.
HARDCODED_COORDS: dict[str, tuple[float, float]] = {
    "ST-1066": (37.55290, 126.83650), "ST-1068": (37.54897, 126.84852),
    "ST-1073": (37.50325, 127.12782), "ST-1074": (37.49830, 127.13454),
    "ST-1090": (37.48083, 127.12933), "ST-1091": (37.50743, 127.10123),
    "ST-1255": (37.56847, 126.84803), "ST-1318": (37.53424, 126.89736),
    "ST-1412": (37.50383, 127.13876), "ST-1415": (37.48161, 127.14361),
    "ST-2":    (37.55088, 126.91039), "ST-415":  (37.51980, 126.88937),
    "ST-423":  (37.52784, 126.92873), "ST-989":  (37.54955, 126.91071),
}


def fix_coords() -> list[str]:
    """좌표가 (0,0)이거나 비어있는 대여소만 HARDCODED_COORDS로 덮어쓴다.
    (이미 유효한 좌표가 들어있는 station_id는 건드리지 않는다 - 이 딕셔너리에
    있다는 이유만으로 정상 데이터를 덮어쓰면 안 된다.)
    반환값: 실제로 갱신된 station_id 목록."""
    updated: list[str] = []
    with Session(engine) as session:
        stations = session.execute(
            select(StationLoc).where(StationLoc.station_id.in_(HARDCODED_COORDS.keys()))
        ).scalars().all()
        for station in stations:
            lat = float(station.lat) if station.lat is not None else 0.0
            lon = float(station.lon) if station.lon is not None else 0.0
            if lat != 0.0 and lon != 0.0:
                continue  # 이미 정상 좌표가 있으면 건드리지 않는다
            new_lat, new_lon = HARDCODED_COORDS[station.station_id]
            station.lat = new_lat
            station.lon = new_lon
            updated.append(station.station_id)
        session.commit()
    return updated


def backfill_admin_dong_for(station_ids: list[str]) -> None:
    """좌표를 막 채운 대여소들만 골라서 admin_dong 역지오코딩을 돌린다
    (backfill_neighborhood.backfill() 전체를 다시 돌리면 이미 채워진 대여소까지
    불필요하게 카카오 API를 다시 호출하게 된다)."""
    if not station_ids:
        print("좌표를 새로 채운 대여소가 없어 역지오코딩을 건너뜁니다.")
        return
    with Session(engine) as session:
        stations = session.execute(
            select(StationLoc).where(StationLoc.station_id.in_(station_ids))
        ).scalars().all()
        updated, failed = 0, 0
        for station in stations:
            try:
                dong = _reverse_geocode_dong(float(station.lat), float(station.lon))
                if dong:
                    station.admin_dong = dong
                    updated += 1
                else:
                    failed += 1
                    print(f"  [{station.station_id}] 역지오코딩 결과 없음")
            except Exception as e:
                failed += 1
                print(f"  [{station.station_id}] 실패: {e}")
        session.commit()
        print(f"admin_dong 역지오코딩 완료: 성공 {updated}건, 실패 {failed}건")


def fix_station_coords_and_backfill() -> None:
    updated = fix_coords()
    print(f"좌표 보정 완료: {len(updated)}개 대여소 갱신 ({', '.join(updated) if updated else '없음'})")
    backfill_admin_dong_for(updated)


def _row_to_dict(row):
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        else:
            try:
                json.dumps(val)
            except TypeError:
                val = str(val)
        d[col.name] = val
    return d


def dedupe_and_clean_stations() -> None:
    with Session(engine) as session:
        stations = session.execute(select(StationLoc)).scalars().all()
        ids = [s.station_id for s in stations]

        inv_rows = session.execute(
            select(StationStock.station_id, StationStock.general_bike_cnt, StationStock.sprout_bike_cnt)
        ).all()
        bike_cnt = {sid: (g or 0) + (s or 0) for sid, g, s in inv_rows}

        has_real_name_rows = session.execute(
            select(RtBikeStatus.station_id).where(RtBikeStatus.station_name.isnot(None)).distinct()
        ).all()
        has_real_name = {sid for (sid,) in has_real_name_rows}

        names = get_station_names(session, ids)

        # 1) 이름 중복 -> 자전거 있는 쪽만 남김
        by_name = defaultdict(list)
        for s in stations:
            nm = names.get(s.station_id)
            if nm:
                by_name[nm].append(s.station_id)

        name_dup_delete_ids = []
        for nm, sids in by_name.items():
            if len(sids) <= 1:
                continue
            with_bikes = [sid for sid in sids if bike_cnt.get(sid, 0) > 0]
            if len(with_bikes) == 1:
                # 자전거 있는 곳 1곳만 남기고 나머지 삭제
                keeper = with_bikes[0]
                name_dup_delete_ids.extend(sid for sid in sids if sid != keeper)
            elif len(with_bikes) == 0:
                # 전부 0대면 판단 보류(2번 로직에서 이름 없는 경우만 자연 정리됨)
                continue
            else:
                # 여러 곳이 자전거를 보유 -> 진짜 같은 곳인지 불확실, 건드리지 않음
                print(f"[SKIP] 이름 '{nm}' 중복 그룹에 자전거 보유 대여소가 여럿({with_bikes}) - 자동 병합 보류")
                continue

        # 2) 이름 없음 + 자전거 0대 -> 삭제
        no_name_zero_bikes_ids = [
            s.station_id for s in stations
            if s.station_id not in has_real_name and bike_cnt.get(s.station_id, 0) == 0
        ]

        delete_ids = sorted(set(name_dup_delete_ids) | set(no_name_zero_bikes_ids))
        print(f"이름 중복 정리 대상: {len(name_dup_delete_ids)}개 {name_dup_delete_ids}")
        print(f"이름없음+0대 삭제 대상: {len(no_name_zero_bikes_ids)}개")
        print(f"총 삭제 대상 station_loc 행: {len(delete_ids)}개")

        if not delete_ids:
            print("삭제 대상이 없습니다. 종료합니다.")
            return

        backup_dir = os.path.join(BASE_DIR, "data", "backups")
        os.makedirs(backup_dir, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f"station_cleanup_backup_{ts}.json")

        backup_data = {"deleted_station_ids": delete_ids, "tables": {}}

        loc_rows = session.execute(select(StationLoc).where(StationLoc.station_id.in_(delete_ids))).scalars().all()
        backup_data["tables"]["station_loc"] = [_row_to_dict(r) for r in loc_rows]

        inv_del_rows = session.execute(
            select(StationStock).where(StationStock.station_id.in_(delete_ids))
        ).scalars().all()
        backup_data["tables"]["station_stock"] = [_row_to_dict(r) for r in inv_del_rows]

        infra_del_rows = session.execute(
            select(InfraMaster).where(InfraMaster.station_id.in_(delete_ids))
        ).scalars().all()
        backup_data["tables"]["infra_master"] = [_row_to_dict(r) for r in infra_del_rows]

        rt_del_rows = session.execute(
            select(RtBikeStatus).where(RtBikeStatus.station_id.in_(delete_ids))
        ).scalars().all()
        backup_data["tables"]["rt_bike_status"] = [_row_to_dict(r) for r in rt_del_rows]

        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
        print(f"백업 완료: {backup_path}")
        print(f"  station_loc {len(backup_data['tables']['station_loc'])}행, "
              f"station_stock {len(backup_data['tables']['station_stock'])}행, "
              f"infra_master {len(backup_data['tables']['infra_master'])}행, "
              f"rt_bike_status {len(backup_data['tables']['rt_bike_status'])}행")

        # 삭제 순서: inventory/infra/rt_bike_status -> station_loc (FK 제약 때문에 이 순서를 지켜야 한다)
        session.execute(delete(StationStock).where(StationStock.station_id.in_(delete_ids)))
        session.execute(delete(InfraMaster).where(InfraMaster.station_id.in_(delete_ids)))
        session.execute(delete(RtBikeStatus).where(RtBikeStatus.station_id.in_(delete_ids)))
        result = session.execute(delete(StationLoc).where(StationLoc.station_id.in_(delete_ids)))
        session.commit()
        print(f"station_loc {result.rowcount}행 삭제 완료 (rent_history/demand_prediction_master 과거 이력은 보존)")


def main() -> None:
    fix_station_coords_and_backfill()
    dedupe_and_clean_stations()


if __name__ == "__main__":
    main()
