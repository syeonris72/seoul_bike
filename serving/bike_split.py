"""
실시간 열린데이터광장 API(rt_bike_status)는 대여소별 '총 거치 자전거 수'만 주고
일반/새싹 구분을 제공하지 않는다. 반면 대여 이력 API(tbCycleRentData, BIKE_SE_CD
필드)는 건별로 일반/새싹을 구분해서 주고, 그 집계가 이미 rent_history_2023/2024에
있다. 그래서 대여소별 "일반:새싹 활동 비율"을 이력에서 계산해, 실시간 총대수를 그
비율로 분할한다 — 실측 실시간 값은 아니지만 순수 추정(전부 일반 취급)보다 훨씬
근거 있는 근사치다.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

# 활동 이력이 전혀 없는 대여소(신규 등)에 쓰는 기본값 — 서울 전체 일반:새싹 평균 비율에 가깝게 잡는다.
_DEFAULT_GENERAL_RATIO = 0.9

_RATIO_QUERY = text("""
    SELECT station_id,
           SUM(general_rent_cnt + general_rtn_cnt) AS general_activity,
           SUM(sprout_rent_cnt + sprout_rtn_cnt) AS sprout_activity
    FROM (
        SELECT station_id, general_rent_cnt, general_rtn_cnt, sprout_rent_cnt, sprout_rtn_cnt FROM rent_history_2024
        UNION ALL
        SELECT station_id, general_rent_cnt, general_rtn_cnt, sprout_rent_cnt, sprout_rtn_cnt FROM rent_history_2023
    ) t
    GROUP BY station_id
""")


def compute_general_ratio(session: Session) -> dict[str, float]:
    """station_id -> 일반자전거 비율(0~1). rent_history의 일반/새싹 활동량 기준."""
    rows = session.execute(_RATIO_QUERY).all()
    ratios: dict[str, float] = {}
    for station_id, general_activity, sprout_activity in rows:
        total = float(general_activity or 0) + float(sprout_activity or 0)
        ratios[station_id] = (float(general_activity or 0) / total) if total > 0 else _DEFAULT_GENERAL_RATIO
    return ratios


def split_general_sprout(total: int, ratio: float) -> tuple[int, int]:
    """총대수를 비율에 따라 (일반, 새싹)으로 분할. 반올림 오차는 일반 쪽에서 흡수."""
    general = max(0, min(total, round(total * ratio)))
    return general, total - general
