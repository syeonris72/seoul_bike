# 컬럼 순서가 sklearn 모델이 학습 시 본 컬럼 순서와 정확히 일치해야 한다.
# baseline.ipynb에서 이 목록이 바뀌면 여기도 반드시 같이 바꿔야 한다 -
# 안 맞으면 크래시가 나는 게 아니라 조용히 잘못된 값으로 예측해버린다.

TARGET_COLUMNS = [
    "general_rent_cnt",
    "sprout_rent_cnt",
    "general_rtn_cnt",
    "sprout_rtn_cnt",
]

BASE_FEATURES = [
    "lat", "lon", "subway_cnt_300m", "edu_cnt_500m", "river_cnt_1km",
    "dist_subway", "dist_river", "temperature", "precipitation", "pm10",
    "flwpop_10s", "flwpop_20s", "flwpop_30s", "flwpop_40s", "flwpop_50s", "flwpop_60up",
    "lvgpop_10s", "lvgpop_20s", "lvgpop_30s", "lvgpop_40s", "lvgpop_50s", "lvgpop_60up",
    "day_of_week", "month", "hour",
]

V1_V4_FEATURES = [
    "hour_sin", "hour_cos", "month_sin", "month_cos", "is_rush_hour", "is_bad_weather",
    "flow_to_living_ratio", "infra_density_score", "subway_last_mile_synergy",
    "pop_spike_ratio", "population_dynamic_flux",
]

V3_FEATURES = ["is_riverside_park"]

V2_FEATURES = ["is_extreme_temp", "is_season_change", "is_long_weekend", "day_type"]

V5_FEATURES = ["is_biz_hour", "synergy_biz_weekday", "leisure_infra_cnt", "synergy_leisure_weekend"]

SHIFTS = [1, 2, 3, 24, 168]


def _build_ts_feature_cols() -> list[str]:
    cols = []
    for col in TARGET_COLUMNS:
        cols += [f"{col}_lag1h", f"{col}_lag24h", f"{col}_roll3h_mean",
                 f"{col}_lag168h", f"{col}_rolling_std_3h"]
    for col in TARGET_COLUMNS:
        cols += [f"{col}_roll24h_mean", f"{col}_roll24h_std"]
    return cols


TS_FEATURE_COLS = _build_ts_feature_cols()

INTERACTION_FEATURES = [
    "sprout_rtn_to_rent_ratio_1h", "general_rtn_to_rent_ratio_1h",
    "sprout_net_diff_1h", "general_net_diff_1h",
]

ENCODED_FEATURE_NAMES = [f"{target}_station_dow_hour_mean" for target in TARGET_COLUMNS]

FEATURE_COLUMNS = (
    BASE_FEATURES + V1_V4_FEATURES + V3_FEATURES + V2_FEATURES + V5_FEATURES
    + TS_FEATURE_COLS + INTERACTION_FEATURES + ENCODED_FEATURE_NAMES
)

RUSH_HOURS = {7, 8, 9, 18, 19, 20}
LATE_NIGHT_HOURS = {23, 0, 1}
SEASON_CHANGE_MONTHS = {3, 5, 9, 11}
PM10_BINS = [float("-inf"), 30, 80, 150, float("inf")]
PM10_LABELS = [1, 2, 3, 4]

MLFLOW_EXPERIMENT_NAME = "bike_demand_prediction_ensemble"
FINAL_TEST_STAGE_TAG = "final_test"
