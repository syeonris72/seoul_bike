"""
여러 라우터(station/admin/driver)에서 공용으로 쓰는 대여소 표시이름 조회.
rt_bike_status의 최신 실측 station_name(예: "홍대입구역 2번출구")이 있으면 그걸,
없으면 station_loc.address_1로 폴백한다.
"""
import re
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.models import RtBikeStatus, StationLoc

# rt_bike_status.station_name은 서울시 API가 내려주는 그대로라 대여소 번호가 앞에 붙어있다
# (예: "108. 서교동 사거리", "5504.아현교회" - 마침표 뒤 공백 유무도 들쭉날쭉). 화면에는 번호
# 없이 보여줘야 해서 여기서 한 번에 떼어낸다.
_ID_PREFIX_RE = re.compile(r"^\d+\.\s*")


def _strip_id_prefix(name: str) -> str:
    return _ID_PREFIX_RE.sub("", name, count=1)


def extract_neighborhood(address_1: str | None) -> str | None:
    """
    address_1(도로명/지번주소)의 3번째 토큰이 실제 행정동/법정동 이름일 때만
    (예: "서울특별시 강서구 마곡동 728-168" -> "마곡동") 문자열로 신뢰해서 뽑는다.
    도로명주소(예: "서울특별시 마포구 양화로 93")는 3번째 토큰이 도로명이라 동 정보가
    없으므로 None. station.admin_dong(카카오 역지오코딩 결과)이 없을 때의 최후 폴백용
    - 정상 경로는 resolve_neighborhood() 참고.
    """
    if not address_1:
        return None
    parts = address_1.split()
    if len(parts) < 3:
        return None
    token = parts[2]
    if token.endswith("동") or token.endswith("가"):
        return token
    return None


def resolve_neighborhood(station: StationLoc) -> str | None:
    """
    행정동 표시값의 진입점. station_loc.admin_dong(카카오 좌표->행정구역 API로 1회
    역지오코딩해둔 값, data/backfill_neighborhood.py)이 있으면 그걸 최우선으로 쓰고,
    아직 배치가 안 돌았거나 실패한 대여소만 address_1 파싱으로 근사한다.
    """
    if station.admin_dong:
        return station.admin_dong
    return extract_neighborhood(station.address_1)


# address_1/address_2, 심지어 rt_bike_status.station_name까지 "서울특별시", "서울시",
# 단독 "서울" 토큰이 섞여 들어오는 경우가 있다(예: "서울특별시 영등포구 문래로 121
# 서울특별시 남부교육지원청"처럼 실시간 API 원본 이름 자체에 중복 포함된 경우도 있음).
# 부분 문자열 치환(replace)은 "서울식물원", "서울도시가스"처럼 "서울"로 시작하는 진짜
# 고유명사까지 훼손하므로, 공백 기준 토큰이 정확히 시/도·자치구 이름과 일치할 때만 뗀다.
_CITY_TOKENS = {"서울특별시", "서울시", "서울"}
_DONG_LOT_RE = re.compile(r"^\S*(?:동|가)$")
_LOT_NUMBER_RE = re.compile(r"^\d+[\d-]*$")


def _strip_city_and_district(text: str, district: str | None) -> str:
    tokens = [t for t in text.split() if t not in _CITY_TOKENS and t != district]
    return " ".join(tokens)


def _looks_like_landmark(address_2: str | None) -> bool:
    """
    address_2는 대여소마다 제각각이라(실측: "기쁜우리복지관" 같은 진짜 랜드마크,
    "427"/"457-33" 같은 번지 숫자, 빈 값을 문자열화한 "None"이 뒤섞여 있음) 무조건
    신뢰할 순 없다. 숫자(-포함)만 있거나 "None"이면 랜드마크가 아니라고 판단한다.
    """
    if not address_2 or address_2 == "None":
        return False
    return not _LOT_NUMBER_RE.match(address_2)


def clean_fallback_name(address_1: str | None, address_2: str | None, district: str | None) -> str | None:
    """
    rt_bike_status에 실측 이름이 없어 주소를 그대로 대여소 이름으로 써야 할 때(전체의
    약 17%, 서비스가 종료됐거나 최근 추가돼 아직 실시간 API에 안 잡히는 대여소) 쓰는
    정리 함수. 우선순위:

    1) address_1에 "동 번지" 뒤에 설명이 붙어있으면 그 설명을 쓴다
       (예: "...도화동 1-402 경의선 숲길 커뮤니티센터" -> "경의선 숲길 커뮤니티센터")
    2) 1)이 없으면(설명 없이 번지로 끝나거나, 애초에 도로명주소라 동 자체가 없음)
       address_2가 진짜 랜드마크로 보이면 그걸 쓴다(역시 시/도·구 토큰은 떼고)
       (예: 도로명주소 "충민로 120" + address_2 "송파 글마루도서관" -> "송파 글마루도서관")
    3) 둘 다 없으면 시/도·자치구 이름만 뗀 주소 그대로("동 번지" 또는 "도로명 번지")
    """
    if not address_1:
        return None
    tokens = _strip_city_and_district(address_1, district).split()

    if len(tokens) >= 2 and _DONG_LOT_RE.match(tokens[0]) and _LOT_NUMBER_RE.match(tokens[1]):
        remainder = " ".join(tokens[2:]).strip()
        if remainder:
            return remainder
        if _looks_like_landmark(address_2):
            return _strip_city_and_district(address_2, district) or address_2
        return " ".join(tokens[:2])

    cleaned = " ".join(tokens).strip()
    if _looks_like_landmark(address_2):
        return _strip_city_and_district(address_2, district) or address_2
    return cleaned or address_1


def get_station_names(session: Session, station_ids: Iterable[str]) -> dict[str, str | None]:
    ids = list({sid for sid in station_ids if sid})
    if not ids:
        return {}

    rows = session.execute(
        select(StationLoc.station_id, StationLoc.address_1, StationLoc.address_2, StationLoc.district).where(
            StationLoc.station_id.in_(ids)
        )
    ).all()
    names: dict[str, str | None] = {
        station_id: clean_fallback_name(address_1, address_2, district)
        for station_id, address_1, address_2, district in rows
    }
    district_by_id = {station_id: district for station_id, _, _, district in rows}

    latest_ids = (
        select(RtBikeStatus.station_id, func.max(RtBikeStatus.id).label("max_id"))
        .where(RtBikeStatus.station_id.in_(ids))
        .group_by(RtBikeStatus.station_id)
        .subquery()
    )
    rt_names = session.execute(
        select(RtBikeStatus.station_id, RtBikeStatus.station_name)
        .join(latest_ids, RtBikeStatus.id == latest_ids.c.max_id)
    ).all()
    for station_id, station_name in rt_names:
        if station_name:
            # 대부분은 그대로도 깨끗하지만, ST-1992("서울특별시 남부교육지원청")처럼 서울시
            # 실시간 API 원본 이름 자체에 시/도 이름이 박혀 나오는 소수 케이스가 있어 같이 정리한다.
            cleaned = _strip_city_and_district(_strip_id_prefix(station_name), district_by_id.get(station_id))
            names[station_id] = cleaned or _strip_id_prefix(station_name)

    return names
