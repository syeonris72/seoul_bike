"""
자치구는 DB 테이블이 아니라 고정 상수다 (station_loc.district에 실제로 존재하는
4개 자치구와 정확히 일치). id는 기존 프론트 목업(mock-data.js)과 동일하게 맞춰
프론트 전환 시 리넘버링이 필요 없게 한다.
"""

DISTRICTS = [
    {"id": 1, "name": "마포구"},
    {"id": 2, "name": "강서구"},
    {"id": 3, "name": "송파구"},
    {"id": 4, "name": "영등포구"},
]

_BY_ID = {d["id"]: d["name"] for d in DISTRICTS}
_BY_NAME = {d["name"]: d["id"] for d in DISTRICTS}


def district_name(did: int | None) -> str | None:
    return _BY_ID.get(did) if did else None


def district_id(name: str | None) -> int | None:
    return _BY_NAME.get(name) if name else None
