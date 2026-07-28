import logging

import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Engine

from serving.constant import TARGET_COLUMNS

logger = logging.getLogger(__name__)

_QUERY = text(
    """
    SELECT datetime_hr, station_id, day_of_week,
           general_rent_cnt, sprout_rent_cnt, general_rtn_cnt, sprout_rtn_cnt
    FROM demand_prediction_master_2024
    WHERE datetime_hr >= :start_date
    """
)


class TargetEncodingCache:
    """
    ml/baseline.ipynb 셀 18의 타깃 인코딩 로직을 그대로 재현한 캐시.
    (station_id, day_of_week, hour) -> 타깃별 평균값을, 학습 데이터의 시간순 앞 60%
    구간만으로 계산한다 (미래 데이터 참조 방지 - baseline.ipynb와 동일).
    폴백 체인: (station_id, day_of_week, hour) 평균 -> (station_id, hour) 평균 -> 전체 평균.
    """

    def __init__(
        self,
        primary: dict[tuple[str, str, int, int], float],
        fallback: dict[tuple[str, str, int], float],
        overall: dict[str, float],
    ):
        self._primary = primary
        self._fallback = fallback
        self._overall = overall

    @classmethod
    def build(cls, engine: Engine) -> "TargetEncodingCache":
        df = pd.read_sql_query(_QUERY, engine, params={"start_date": "2024-01-01"})

        if df.empty:
            logger.warning("demand_prediction_master_2024에 데이터가 없어 타깃 인코딩 캐시가 비어있습니다.")
            return cls(primary={}, fallback={}, overall={t: 0.0 for t in TARGET_COLUMNS})

        df["datetime_hr"] = pd.to_datetime(df["datetime_hr"])
        df["hour"] = df["datetime_hr"].dt.hour

        # baseline.ipynb는 datetime_hr 단독 비고정(quicksort) 정렬을 쓰지만, 여기서는
        # (datetime_hr, station_id) 안정 정렬(mergesort)을 써서 재시작해도 재현 가능하게 한다.
        # 같은 시각에 걸친 station 경계에서 baseline.ipynb 원본과 미세하게 다를 수 있으나
        # (알려진 한계) 영향은 무시 가능한 수준이다.
        df_sorted = df.sort_values(["datetime_hr", "station_id"], kind="mergesort").reset_index(drop=True)

        n = len(df_sorted)
        train_end = int(n * 0.60)
        train_only_df = df_sorted.iloc[:train_end]

        primary: dict[tuple[str, str, int, int], float] = {}
        fallback: dict[tuple[str, str, int], float] = {}
        overall: dict[str, float] = {}

        for target in TARGET_COLUMNS:
            primary_means = train_only_df.groupby(["station_id", "day_of_week", "hour"])[target].mean()
            for (station_id, dow, hour), value in primary_means.items():
                primary[(target, station_id, int(dow), int(hour))] = float(value)

            fallback_means = train_only_df.groupby(["station_id", "hour"])[target].mean()
            for (station_id, hour), value in fallback_means.items():
                fallback[(target, station_id, int(hour))] = float(value)

            overall[target] = float(train_only_df[target].mean())

        logger.info(
            "[타깃 인코딩 캐시 구축 완료] 전체 %d행, 학습 구간 %d행, primary key %d개",
            n, train_end, len(primary),
        )
        return cls(primary=primary, fallback=fallback, overall=overall)

    def lookup(self, target: str, station_id: str, day_of_week: int, hour: int) -> float:
        key_primary = (target, station_id, day_of_week, hour)
        if key_primary in self._primary:
            return self._primary[key_primary]

        key_fallback = (target, station_id, hour)
        if key_fallback in self._fallback:
            return self._fallback[key_fallback]

        return self._overall.get(target, 0.0)
