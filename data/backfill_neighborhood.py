"""
station_loc.admin_dong(행정동) 1회성 역지오코딩 배치.

station_loc.address_2(서울시 오픈API 원본)는 실측해보면 랜드마크 설명/숫자/빈값이
뒤섞여 있어 행정동으로 못 쓴다. address_1(도로명/지번주소)에서 직접 파싱하는 방식
(serving/station_lookup.extract_neighborhood)은 지번주소(예: "...마곡동 728-168")인
대여소에만 통해서 전체의 약 28%만 커버한다.

나머지 대여소까지 100% 채우기 위해, 모든 대여소의 실제 좌표(lat/lon)를 카카오
좌표->행정구역 API(coord2regioncode)에 넣어 행정동(region_type=H)을 직접 역지오코딩한다.
결과는 station_loc.admin_dong에 저장해두고, 서빙 시점에는 이 컬럼만 읽는다
(요청마다 외부 API를 부르면 느리고 카카오 호출 한도에도 걸리기 때문).

실행: python -m data.backfill_neighborhood
"""
import os
import time

import requests
from dotenv import load_dotenv
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from database.db_connection import engine
from models.models import StationLoc

load_dotenv()

_KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "")
_GEOCODE_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json"
_REQUEST_INTERVAL_SEC = 0.1  # 카카오 로컬 API 호출 한도(초당 요청 수) 여유있게 지키기 위한 딜레이


def _ensure_column() -> None:
    """models.py에 컬럼을 추가했더라도 기존 station_loc 테이블엔 자동 반영 안 되므로
    (Base.metadata.create_all/checkfirst는 새 테이블만 만들고 기존 테이블은 안 건드림)
    여기서 직접 ALTER TABLE 한다. 이미 컬럼이 있으면 MySQL 에러를 잡아서 무시한다."""
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE station_loc ADD COLUMN admin_dong VARCHAR(50) NULL"))
            print("station_loc.admin_dong 컬럼 추가 완료")
        except OperationalError as e:
            if "Duplicate column name" in str(e):
                print("station_loc.admin_dong 컬럼이 이미 있어 건너뜁니다")
            else:
                raise


def _reverse_geocode_dong(lat: float, lon: float) -> str | None:
    resp = requests.get(
        _GEOCODE_URL,
        params={"x": lon, "y": lat},
        headers={"Authorization": f"KakaoAK {_KAKAO_REST_API_KEY}"},
        timeout=5,
    )
    resp.raise_for_status()
    documents = resp.json().get("documents", [])

    admin = next((d for d in documents if d.get("region_type") == "H"), None)
    if admin and admin.get("region_3depth_name"):
        return admin["region_3depth_name"]

    # 드물게 행정동(H) 결과가 없으면 법정동(B)이라도 (정확히 같은 개념은 아니지만 근사치로 유용)
    legal = next((d for d in documents if d.get("region_type") == "B"), None)
    if legal and legal.get("region_3depth_name"):
        return legal["region_3depth_name"]
    return None


def backfill(force: bool = False) -> None:
    if not _KAKAO_REST_API_KEY:
        raise RuntimeError("KAKAO_REST_API_KEY가 .env에 설정돼 있지 않습니다.")

    _ensure_column()

    with Session(engine) as session:
        stmt = select(StationLoc).where(StationLoc.lat.is_not(None), StationLoc.lon.is_not(None))
        if not force:
            stmt = stmt.where(StationLoc.admin_dong.is_(None))
        stations = session.execute(stmt).scalars().all()

        print(f"역지오코딩 대상: {len(stations)}개 대여소")
        updated, failed = 0, 0

        for i, station in enumerate(stations, start=1):
            try:
                dong = _reverse_geocode_dong(float(station.lat), float(station.lon))
                if dong:
                    station.admin_dong = dong
                    updated += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"  [{station.station_id}] 실패: {e}")
                failed += 1

            if i % 50 == 0:
                session.commit()
                print(f"  진행 {i}/{len(stations)} (성공 {updated}, 실패 {failed})")

            time.sleep(_REQUEST_INTERVAL_SEC)

        session.commit()
        print(f"완료: 성공 {updated}건, 실패 {failed}건")


if __name__ == "__main__":
    backfill()
