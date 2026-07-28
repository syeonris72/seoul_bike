"""
예측 모델의 FEATURE_COLUMNS(개별 피처 40여 개)는 그대로 보여주면 관리자 페이지에서
의미를 읽기 어렵다. 의미 단위 그룹으로 묶어 그룹별 기여도(%) 합계를 계산한다 -
admin-analytics.js의 "예측 모델 주요 변수 중요도" 차트가 쓰는 로직.
"""
from typing import Any

from serving.constant import FEATURE_COLUMNS, INTERACTION_FEATURES, TARGET_COLUMNS, TS_FEATURE_COLS

_ENCODED_FEATURES = {f"{t}_station_dow_hour_mean" for t in TARGET_COLUMNS}

_WEATHER_FEATURES = {"temperature", "precipitation", "pm10", "is_bad_weather", "is_extreme_temp", "is_season_change"}
_POPULATION_FEATURES = {
    "flwpop_10s", "flwpop_20s", "flwpop_30s", "flwpop_40s", "flwpop_50s", "flwpop_60up",
    "lvgpop_10s", "lvgpop_20s", "lvgpop_30s", "lvgpop_40s", "lvgpop_50s", "lvgpop_60up",
    "flow_to_living_ratio", "pop_spike_ratio", "population_dynamic_flux",
}
_INFRA_FEATURES = {
    "subway_cnt_300m", "edu_cnt_500m", "river_cnt_1km", "dist_subway", "dist_river",
    "infra_density_score", "subway_last_mile_synergy", "is_riverside_park",
    "leisure_infra_cnt", "synergy_leisure_weekend", "synergy_biz_weekday",
}
_CALENDAR_FEATURES = {
    "day_of_week", "month", "hour", "hour_sin", "hour_cos", "month_sin", "month_cos",
    "is_rush_hour", "is_biz_hour", "is_long_weekend", "day_type",
}
_LOCATION_FEATURES = {"lat", "lon"}

_GROUP_LABELS = {
    "lag": "과거 대여 이력 (Lag)",
    "weather": "날씨",
    "population": "유동/생활 인구",
    "infra": "입지 인프라",
    "calendar": "시간/달력",
    "location": "위치",
    "interaction": "상호작용 지표",
}


def _group_of(feature: str) -> str:
    if feature in TS_FEATURE_COLS:
        return "lag"
    if feature in INTERACTION_FEATURES or feature in _ENCODED_FEATURES:
        return "interaction"
    if feature in _WEATHER_FEATURES:
        return "weather"
    if feature in _POPULATION_FEATURES:
        return "population"
    if feature in _INFRA_FEATURES:
        return "infra"
    if feature in _CALENDAR_FEATURES:
        return "calendar"
    return "location"


def _average_importances(models: Any) -> list[float] | None:
    """
    여러 base 모델(예: ManualStackingRegressor.final_base_models_,
    VotingRegressor.estimators_)의 feature_importances_를 모아 평균낸다.
    LightGBM(split count)과 XGBoost(gain, 합=1로 정규화됨)처럼 스케일이 서로
    다를 수 있으므로, 평균 전에 모델별로 합이 1이 되도록 정규화해 동일한 비중을
    갖게 한다. 하나라도 못 찾거나 길이가 다르면 None(호출부에서 안전하게 처리).
    """
    per_model: list[list[float]] = []
    length: int | None = None
    for base_model in models:
        found = unwrap_feature_importances(base_model)
        if found is None:
            return None
        if length is None:
            length = len(found)
        elif len(found) != length:
            return None
        total = sum(found)
        if total <= 0:
            return None
        per_model.append([v / total for v in found])

    if not per_model or length is None:
        return None
    return [sum(vec[i] for vec in per_model) / len(per_model) for i in range(length)]


def unwrap_feature_importances(model: Any) -> list[float] | None:
    """
    TransformedTargetRegressor/Pipeline/GridSearchCV 등으로 감싸져 있을 수 있는
    sklearn 모델에서 feature_importances_를 재귀적으로 찾는다. 트리 기반이 아닌
    모델(선형/SVR 등)이면 그런 속성이 없으므로 None을 반환한다.

    ml/ensemble.ipynb의 ManualStackingRegressor(final_estimator_는 Ridge라
    feature_importances_가 없지만, final_base_models_에 담긴 LightGBM/XGBoost는
    있음)나 sklearn VotingRegressor(estimators_)처럼 base 모델 여러 개를 합친
    앙상블은 base 모델들의 feature_importances_를 정규화 후 평균내 대신 쓴다.
    """
    if hasattr(model, "feature_importances_"):
        return list(model.feature_importances_)
    if hasattr(model, "regressor_"):
        return unwrap_feature_importances(model.regressor_)
    if hasattr(model, "best_estimator_"):
        return unwrap_feature_importances(model.best_estimator_)
    if hasattr(model, "named_steps"):
        for step in reversed(list(model.named_steps.values())):
            found = unwrap_feature_importances(step)
            if found is not None:
                return found
    if hasattr(model, "final_base_models_"):
        found = _average_importances(model.final_base_models_.values())
        if found is not None:
            return found
    if hasattr(model, "estimators_"):
        found = _average_importances(model.estimators_)
        if found is not None:
            return found
    return None


def grouped_feature_importance(model: Any, top_n: int = 7) -> list[tuple[str, float]]:
    """(그룹 라벨, 기여도 %) 리스트를 기여도 내림차순으로 top_n개 반환한다.
    모델이 feature_importances_를 지원하지 않거나 길이가 FEATURE_COLUMNS와
    어긋나면(모델/피처 정의가 서로 안 맞는 사고 방지) 빈 리스트를 반환한다."""
    importances = unwrap_feature_importances(model)
    if importances is None or len(importances) != len(FEATURE_COLUMNS):
        return []

    totals: dict[str, float] = {}
    for feature, importance in zip(FEATURE_COLUMNS, importances):
        group = _group_of(feature)
        totals[group] = totals.get(group, 0.0) + float(importance)

    grand_total = sum(totals.values())
    if grand_total <= 0:
        return []

    percentages = [(_GROUP_LABELS[g], round(v / grand_total * 100, 1)) for g, v in totals.items()]
    percentages.sort(key=lambda x: x[1], reverse=True)
    return percentages[:top_n]
