from collections import defaultdict
from datetime import datetime, timedelta

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.models import DemandPredictionMaster2024, RtBikeStatus
from serving.constant import TARGET_COLUMNS
from serving.rt_flow import MAX_SNAPSHOT_GAP, snapshot_delta

_MAX_LOOKBACK_HOURS = 169  # lag168h + 여유 1시간(roll24h_mean 등에서 T-24h..T-1h 커버)


# 타깃 lag/rolling 계산에 쓰는 컬럼 + 인구 트렌드(pop_spike_ratio/population_dynamic_flux)
# 계산에 쓰는 flwpop_tot/lvgpop_tot까지 한 번의 range 쿼리로 같이 가져온다.
_WINDOW_EXTRA_COLUMNS = ["flwpop_tot", "lvgpop_tot"]

# demand_prediction_master_2024는 2024년치뿐이라 그 이후 날짜(실시간 예측 대상)는 항상
# 비어 lag/rolling 피처가 전부 0이 됐다 - 모델이 가장 크게 의존하는 피처 그룹(전체 중요도의
# 약 40%, admin-analytics.js "예측 모델 주요 변수 중요도" 참고)이 라이브에서 통째로
# 죽어있던 것. rt_bike_status(30분 간격 실시간 거치대 스냅샷)의 순증감으로 근사치를 만들어
# 이 구간을 채운다 - routers/predict.py의 실시간 다음 시간 예측과 이 모듈을 함께 쓰는
# serving/demand_prediction_forecast.py 양쪽 다 자동으로 혜택을 받는다.
#
# 알려진 한계: rt_bike_status는 자전거 종류(일반/새싹)나 대여/반납을 구분하지 않고 총
# 거치대수만 준다. 감소분은 순대여, 증가분은 순반납(또는 배차 투입)으로 보고, 일반/새싹
# 배분은 2024년 전체 평균 비율로 근사한다(대여소별 실제 비율과는 오차가 있을 수 있음).
_rent_rtn_split_cache: dict[str, float] | None = None


def _rent_rtn_split_ratios(session: Session) -> dict[str, float]:
    global _rent_rtn_split_cache
    if _rent_rtn_split_cache is not None:
        return _rent_rtn_split_cache

    g_rent, s_rent, g_rtn, s_rtn = session.execute(
        select(
            func.sum(DemandPredictionMaster2024.general_rent_cnt),
            func.sum(DemandPredictionMaster2024.sprout_rent_cnt),
            func.sum(DemandPredictionMaster2024.general_rtn_cnt),
            func.sum(DemandPredictionMaster2024.sprout_rtn_cnt),
        )
    ).one()
    g_rent, s_rent, g_rtn, s_rtn = (float(v or 0.0) for v in (g_rent, s_rent, g_rtn, s_rtn))
    rent_total = g_rent + s_rent
    rtn_total = g_rtn + s_rtn

    _rent_rtn_split_cache = {
        "general_rent_cnt": (g_rent / rent_total) if rent_total else 0.5,
        "sprout_rent_cnt": (s_rent / rent_total) if rent_total else 0.5,
        "general_rtn_cnt": (g_rtn / rtn_total) if rtn_total else 0.5,
        "sprout_rtn_cnt": (s_rtn / rtn_total) if rtn_total else 0.5,
    }
    return _rent_rtn_split_cache


def _live_rent_rtn_window(
    session: Session, station_id: str, window_start: datetime, window_end: datetime
) -> pd.DataFrame:
    """[window_start, window_end] 구간을 rt_bike_status 스냅샷 순증감으로 채운
    TARGET_COLUMNS 형태의 시간별 DataFrame. 2024 이력이 없는 실시간 구간에서만
    의미 있는 값을 반환하고, 그 외에는 빈 DataFrame."""
    # window_end 버킷(시 단위)에 속하는 t0는 원시각 기준 window_end+59분까지 나올 수 있고,
    # 그 델타를 구할 t1은 그보다 늦은 시각이어야 한다. 다만 target_dt(=window_end+1h) 이후
    # 시점은 예측 시점에서 아직 모르는 미래이므로 절대 넘어서면 안 된다(backtest leakage
    # 방지) - MAX_SNAPSHOT_GAP만큼 더 여유를 주는 대신 target_dt에서 딱 끊는다.
    target_dt = window_end + timedelta(hours=1)
    rows = session.execute(
        select(RtBikeStatus.created_at, RtBikeStatus.parked_bike_cnt)
        .where(
            RtBikeStatus.station_id == station_id,
            RtBikeStatus.created_at >= window_start - MAX_SNAPSHOT_GAP,
            RtBikeStatus.created_at <= target_dt,
        )
        .order_by(RtBikeStatus.created_at)
    ).all()

    by_hour: dict[datetime, dict[str, int]] = defaultdict(lambda: {"rent": 0, "rtn": 0})
    for (t0, c0), (t1, c1) in zip(rows, rows[1:]):
        # window 경계 판단은 t0 원시각이 아니라 t0가 속한 시간 버킷 기준이어야 한다 - 그렇지
        # 않으면 예: t0=01:09가 버킷상 01:00(=window_end)에 귀속돼야 하는데도 원시각이
        # window_end(01:00:00)보다 늦다는 이유로 걸러져 lag1h 버킷이 통째로 비게 된다.
        bucket = t0.replace(minute=0, second=0, microsecond=0)
        if bucket < window_start or bucket > window_end:
            continue
        delta = snapshot_delta(t0, c0, t1, c1)
        if delta is None:
            continue
        if delta < 0:
            by_hour[bucket]["rent"] += -delta
        elif delta > 0:
            by_hour[bucket]["rtn"] += delta

    if not by_hour:
        return pd.DataFrame()

    ratios = _rent_rtn_split_ratios(session)
    data = {
        bucket: {
            "general_rent_cnt": v["rent"] * ratios["general_rent_cnt"],
            "sprout_rent_cnt": v["rent"] * ratios["sprout_rent_cnt"],
            "general_rtn_cnt": v["rtn"] * ratios["general_rtn_cnt"],
            "sprout_rtn_cnt": v["rtn"] * ratios["sprout_rtn_cnt"],
        }
        for bucket, v in by_hour.items()
    }
    df = pd.DataFrame.from_dict(data, orient="index")
    df.index.name = "datetime_hr"
    return df.sort_index()


def fetch_station_window(session: Session, station_id: str, target_dt: datetime) -> pd.DataFrame:
    """
    target_dt(예측 대상 시각) 기준 T-169h ~ T-1h 구간의 실제 대여/반납 값과
    인구(flwpop_tot/lvgpop_tot)를 단일 range 쿼리로 가져온다. lag1h~lag168h,
    roll24h_mean/std, pop_spike_ratio/population_dynamic_flux 전부 이 한 번의
    조회 결과로 커버할 수 있다 (포인트 쿼리 여러 번보다 효율적).

    demand_prediction_master_2024의 PK가 (datetime_hr, station_id) 순서라 station_id
    선두 필터는 PRIMARY를 효율적으로 못 타 datetime_hr 구간 전체(~18만 행)를 스캔했었다.
    (station_id, datetime_hr) 복합 인덱스(ix_demand_prediction_master_2024_station_dt,
    alembic 리비전 42f65d0ce08d)를 추가해 해결 - 스캔 행 수 179708 -> 150, 평균 74.8ms ->
    4.3ms로 개선 확인.
    """
    window_start = target_dt - timedelta(hours=_MAX_LOOKBACK_HOURS)
    window_end = target_dt - timedelta(hours=1)

    all_columns = TARGET_COLUMNS + _WINDOW_EXTRA_COLUMNS
    columns = [DemandPredictionMaster2024.datetime_hr] + [
        getattr(DemandPredictionMaster2024, col) for col in all_columns
    ]
    rows = session.execute(
        select(*columns)
        .where(DemandPredictionMaster2024.station_id == station_id)
        .where(DemandPredictionMaster2024.datetime_hr.between(window_start, window_end))
        .order_by(DemandPredictionMaster2024.datetime_hr)
    ).all()

    df = pd.DataFrame(rows, columns=["datetime_hr"] + all_columns)
    if not df.empty:
        df["datetime_hr"] = pd.to_datetime(df["datetime_hr"])
        df = df.set_index("datetime_hr")

    # 2024 이력에 없는 실시간 구간(target_dt가 2024 이후)은 rt_bike_status 기반 라이브
    # 추정치로 보강한다 - 위 모듈 docstring 참고. 인구(flwpop_tot/lvgpop_tot)는 실시간
    # 소스가 없어 NaN으로 두고(extract_population_trend가 결측을 0으로 처리), lag/rolling
    # 피처만 살린다.
    live_df = _live_rent_rtn_window(session, station_id, window_start, window_end)
    if not live_df.empty:
        for col in _WINDOW_EXTRA_COLUMNS:
            live_df[col] = float("nan")
        live_only = live_df.loc[~live_df.index.isin(df.index)] if not df.empty else live_df
        df = pd.concat([df, live_only]).sort_index() if not df.empty else live_only.sort_index()

    return df


def extract_lag_and_rolling(window_df: pd.DataFrame, target_dt: datetime) -> dict[str, float]:
    """
    baseline.ipynb 셀 15의 lag/rolling 계산 순서를 그대로 재현한다:
    1) lag1h/2h/3h/24h/168h를 포인트 조회하고, 없으면 0으로 채운다 (fillna(0)과 동일).
    2) 이미 0으로 채워진 lag1h/2h/3h 세 값으로 roll3h_mean/rolling_std_3h(ddof=1)을 계산한다
       (baseline.ipynb에서도 fillna(0)이 먼저 일어난 뒤 이 값들로 계산됨).
    3) roll24h_mean/std는 T-24h..T-1h 구간에 실제로 존재하는 행들의 평균/표준편차이고,
       없으면 0이다 (baseline.ipynb의 shift(1).rolling(24, min_periods=1)과 동일한 의도 -
       단, 행 기준이 아니라 달력 시간 기준이라는 차이는 "알려진 한계" 참고).
    """
    result: dict[str, float] = {}

    for col in TARGET_COLUMNS:
        lag_values = {}
        for h in (1, 2, 3, 24, 168):
            ts = target_dt - timedelta(hours=h)
            if not window_df.empty and ts in window_df.index:
                lag_values[h] = float(window_df.loc[ts, col])
            else:
                lag_values[h] = 0.0

        result[f"{col}_lag1h"] = lag_values[1]
        result[f"{col}_lag24h"] = lag_values[24]
        result[f"{col}_lag168h"] = lag_values[168]

        lag123 = pd.Series([lag_values[1], lag_values[2], lag_values[3]])
        result[f"{col}_roll3h_mean"] = float(lag123.mean())
        result[f"{col}_rolling_std_3h"] = float(lag123.std())  # pandas 기본 ddof=1

        window_start_24h = target_dt - timedelta(hours=24)
        window_end_24h = target_dt - timedelta(hours=1)
        if not window_df.empty:
            roll24_series = window_df.loc[window_start_24h:window_end_24h, col]
        else:
            roll24_series = pd.Series(dtype=float)

        result[f"{col}_roll24h_mean"] = float(roll24_series.mean()) if len(roll24_series) > 0 else 0.0
        result[f"{col}_roll24h_std"] = float(roll24_series.std()) if len(roll24_series) > 1 else 0.0

    # fillna(0) 대응: rolling_std_3h/roll24h_std 등에서 std() 결과가 NaN일 수 있는 경우
    # (모두 0인 경우 std=0이라 문제없지만, 값이 하나뿐이라 std()가 NaN을 반환하는 경우) 방어.
    for key, value in list(result.items()):
        if pd.isna(value):
            result[key] = 0.0

    return result


def extract_population_trend(
    window_df: pd.DataFrame, target_dt: datetime, flwpop_now: float, lvgpop_now: float
) -> dict[str, float]:
    """
    baseline.ipynb 셀 15의 pop_spike_ratio / population_dynamic_flux를 재현한다.
    flwpop_now/lvgpop_now는 target_dt 시점 인구의 근사치(feature.py에서 해당 station의
    가장 최근 실측값으로 대체한 값)이고, window_df는 T-169h~T-1h의 실측 이력이다.

    - daily_avg_flwpop: T-24h..T-1h 구간 flwpop_tot의 평균 (shift(1).rolling(24)와 동일한 의도)
    - pop_spike_ratio = flwpop_now / daily_avg_flwpop (inf/-inf/nan -> 0)
    - population_dynamic_flux = lvgpop_now - lvgpop_tot(T-1h) (T-1h 값이 없으면 0,
      diff().fillna(0)의 "이전 값 없음" 케이스와 동일하게 처리)
    """
    window_start_24h = target_dt - timedelta(hours=24)
    window_end_24h = target_dt - timedelta(hours=1)

    if not window_df.empty:
        flwpop_series = window_df.loc[window_start_24h:window_end_24h, "flwpop_tot"]
    else:
        flwpop_series = pd.Series(dtype=float)

    daily_avg_flwpop = float(flwpop_series.mean()) if len(flwpop_series) > 0 else float("nan")
    if daily_avg_flwpop in (0.0,) or pd.isna(daily_avg_flwpop):
        pop_spike_ratio = 0.0
    else:
        ratio = flwpop_now / daily_avg_flwpop
        pop_spike_ratio = 0.0 if not pd.notna(ratio) or ratio in (float("inf"), float("-inf")) else float(ratio)

    ts_minus_1h = target_dt - timedelta(hours=1)
    if not window_df.empty and ts_minus_1h in window_df.index:
        lvgpop_prev = float(window_df.loc[ts_minus_1h, "lvgpop_tot"])
        population_dynamic_flux = lvgpop_now - lvgpop_prev
    else:
        population_dynamic_flux = 0.0

    return {
        "pop_spike_ratio": pop_spike_ratio,
        "population_dynamic_flux": population_dynamic_flux,
    }


def compute_interaction_features(lag_values: dict[str, float]) -> dict[str, float]:
    """
    baseline.ipynb 셀 15의 타깃 간 상관관계 피처. lag1h 값들로만 계산한다.
    lag_values는 extract_lag_and_rolling()이 반환한 dict를 그대로 받는다
    (예: lag_values["sprout_rtn_cnt_lag1h"]).
    """
    sprout_rent_lag1h = lag_values["sprout_rent_cnt_lag1h"]
    sprout_rtn_lag1h = lag_values["sprout_rtn_cnt_lag1h"]
    general_rent_lag1h = lag_values["general_rent_cnt_lag1h"]
    general_rtn_lag1h = lag_values["general_rtn_cnt_lag1h"]

    return {
        "sprout_rtn_to_rent_ratio_1h": sprout_rtn_lag1h / (sprout_rent_lag1h + 1),
        "general_rtn_to_rent_ratio_1h": general_rtn_lag1h / (general_rent_lag1h + 1),
        "sprout_net_diff_1h": sprout_rtn_lag1h - sprout_rent_lag1h,
        "general_net_diff_1h": general_rtn_lag1h - general_rent_lag1h,
    }
