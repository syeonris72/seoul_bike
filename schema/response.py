from datetime import datetime

from pydantic import BaseModel


class PredictionResponse(BaseModel):
    """다음 1시간 수요 예측 응답. 4개 값 모두 model.predict()가 이미 log1p 역변환까지
    끝낸(TransformedTargetRegressor) 최종 대여/반납 건수다."""

    station_id: str
    target_datetime: datetime
    general_rent_cnt: int
    sprout_rent_cnt: int
    general_rtn_cnt: int
    sprout_rtn_cnt: int


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    role: str
    name: str
    district_id: int | None = None
    district_name: str | None = None


class AccountOut(BaseModel):
    id: int
    login_id: str
    name: str
    role: str
    district_id: int | None
    district_name: str | None
    phone: str | None
    email: str | None
    created_at: datetime


class DistrictOut(BaseModel):
    id: int
    name: str
    total_bikes: int


class StationOut(BaseModel):
    station_id: str
    name: str
    district_id: int | None
    district_name: str | None
    neighborhood_name: str | None
    lat: float | None
    lon: float | None
    map_x: float
    map_y: float
    capacity: int
    general_bike_cnt: int
    sprout_bike_cnt: int
    broken_bike_cnt: int
    total_bikes: int
    stock_level: str


class StationDetailOut(StationOut):
    address: str | None


class RentalOut(BaseModel):
    id: int
    user_id: int
    bike_id: str
    bike_type: str
    rent_station_id: str
    rent_station_name: str | None
    return_station_id: str | None
    return_station_name: str | None
    status: str
    rent_time: datetime
    return_time: datetime | None
    distance_km: float | None
    duration_min: int | None
    carbon_reduction: float | None


class ReportOut(BaseModel):
    id: int
    bike_id: str
    station_id: str
    station_name: str | None
    reported_by: int
    issue: str
    status: str
    reported_at: datetime
    dispatch_status: str | None
    driver_name: str | None


class DispatchOut(BaseModel):
    id: int
    from_station_id: str
    from_station_name: str | None
    to_station_id: str
    to_station_name: str | None
    general_qty: int
    sprout_qty: int
    driver_id: int | None
    driver_name: str | None
    ordered_by: int
    ordered_at: datetime
    pickup_completed_at: datetime | None
    dropoff_completed_at: datetime | None
    status: str
    is_emergency: bool
    order_type: str
    report_id: int | None


class FavoriteOut(BaseModel):
    id: int
    station_id: str
    station_name: str | None
    general_bike_cnt: int
    sprout_bike_cnt: int
    capacity: int


class WeatherSummaryOut(BaseModel):
    today_temp: float | None
    today_rain: float | None
    today_pm10: float | None
    diff_temp: float | None
    diff_rain: float | None
    diff_pm10: float | None
    measured_label: str | None


class HourlyPointOut(BaseModel):
    hour: int
    value: int


class HourlyTempPointOut(BaseModel):
    hour: int
    avg_temp: float | None


class WeeklyPointOut(BaseModel):
    day_of_week: int
    value: int


class StockDistributionOut(BaseModel):
    normal: int
    warning: int
    danger: int
    full: int


class TodaySummaryOut(BaseModel):
    today_rentals: int
    urgent_dispatch_count: int
    full_station_count: int
    as_of_label: str


class FlowEdgeOut(BaseModel):
    from_station_id: str
    from_station_name: str | None
    to_station_id: str
    to_station_name: str | None
    district_id: int | None
    flow: int


class FeatureImportanceOut(BaseModel):
    label: str
    value: float


class ModelMonitoringOut(BaseModel):
    as_of_label: str
    actual: list[HourlyPointOut]
    predicted: list[HourlyPointOut]
    sample_station_cnt: int


class PublicSummaryOut(BaseModel):
    station_count: int
    total_bikes: int
    today_rentals: int
    as_of_label: str


class GenderBreakdownOut(BaseModel):
    male: int
    female: int
    unknown: int


class AgeBreakdownOut(BaseModel):
    age_10: int
    age_20: int
    age_30: int
    age_40: int
    age_50: int
    age_60: int
    unknown: int


class DemographicsOut(BaseModel):
    gender: GenderBreakdownOut
    age: AgeBreakdownOut


class CarbonSummaryOut(BaseModel):
    total_carbon_reduction_kg: float
    total_distance_km: float
    avg_duration_min: float
    completed_rental_cnt: int


class DispatchEfficiencyOut(BaseModel):
    avg_completion_min: float | None
    emergency_cnt: int
    normal_cnt: int
    completed_cnt: int
    pending_cnt: int


class DistrictRankingPointOut(BaseModel):
    district_id: int
    district_name: str
    value: int
