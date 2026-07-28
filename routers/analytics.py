from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.deps import get_current_user, require_role
from database.db_connection import get_session
from models.models import (
    Account,
    Dispatch,
    DemandPredictionForecast,
    Rental,
    RtAir,
    RtWeather,
    StationStock,
    StationLoc,
    DemandPredictionMaster2024,
)
from schema.response import (
    FeatureImportanceOut,
    FlowEdgeOut,
    HourlyPointOut,
    HourlyTempPointOut,
    ModelMonitoringOut,
    StockDistributionOut,
    TodaySummaryOut,
    WeatherSummaryOut,
    WeeklyPointOut,
)
from serving.analytics_utils import latest_available_date, total_rentals_on
from serving.deps import get_champion_models
from serving.district import district_name, district_id as district_id_of
from serving.feature_group import grouped_feature_importance
from serving.station_lookup import get_station_names
from serving.station_stock import classify_stock_level
from serving.env_history import fetch_daily_avg

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/hourly-demand", response_model=list[HourlyPointOut])
def hourly_demand(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[HourlyPointOut]:
    hour_expr = func.hour(DemandPredictionMaster2024.datetime_hr)
    stmt = select(hour_expr, func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt)).group_by(hour_expr)
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.where(DemandPredictionMaster2024.district == name)
    rows = session.execute(stmt).all()
    by_hour = {int(h): int(v or 0) for h, v in rows}
    return [HourlyPointOut(hour=h, value=by_hour.get(h, 0)) for h in range(24)]


@router.get("/hourly-temperature", response_model=list[HourlyTempPointOut])
def hourly_temperature(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[HourlyTempPointOut]:
    hour_expr = func.hour(DemandPredictionMaster2024.datetime_hr)
    stmt = select(hour_expr, func.avg(DemandPredictionMaster2024.temperature)).group_by(hour_expr)
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.where(DemandPredictionMaster2024.district == name)
    rows = session.execute(stmt).all()
    by_hour = {int(h): (round(float(v), 1) if v is not None else None) for h, v in rows}
    return [HourlyTempPointOut(hour=h, avg_temp=by_hour.get(h)) for h in range(24)]


@router.get("/weekly-demand", response_model=list[WeeklyPointOut])
def weekly_demand(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[WeeklyPointOut]:
    stmt = select(
        DemandPredictionMaster2024.day_of_week,
        func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt),
    ).group_by(DemandPredictionMaster2024.day_of_week)
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.where(DemandPredictionMaster2024.district == name)
    rows = session.execute(stmt).all()
    by_dow = {int(d): int(v or 0) for d, v in rows}
    return [WeeklyPointOut(day_of_week=d, value=by_dow.get(d, 0)) for d in range(7)]


@router.get("/stock-distribution", response_model=StockDistributionOut)
def stock_distribution(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> StockDistributionOut:
    stmt = select(StationStock, StationLoc.district).join(StationLoc, StationLoc.station_id == StationStock.station_id)
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.where(StationLoc.district == name)
    rows = session.execute(stmt).all()

    counts = {"과포화": 0, "고갈": 0, "부족": 0, "적정": 0}
    for inv, _district in rows:
        total = inv.general_bike_cnt + inv.sprout_bike_cnt
        level = classify_stock_level(total, inv.capacity)
        counts[level] += 1

    return StockDistributionOut(
        normal=counts["적정"], warning=counts["부족"], danger=counts["고갈"], full=counts["과포화"],
    )


@router.get("/today-summary", response_model=TodaySummaryOut)
def today_summary(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> TodaySummaryOut:
    name = district_name(district_id) if district_id else None
    latest_date = latest_available_date(session)
    rentals = total_rentals_on(session, latest_date, name)

    urgent_stmt = select(func.count()).select_from(Dispatch).where(
        Dispatch.status != "완료", Dispatch.is_emergency.is_(True)
    )
    if name:
        urgent_stmt = urgent_stmt.join(StationLoc, StationLoc.station_id == Dispatch.from_station_id).where(
            StationLoc.district == name
        )
    urgent_count = session.execute(urgent_stmt).scalar_one()

    inv_stmt = select(StationStock).join(StationLoc, StationLoc.station_id == StationStock.station_id)
    if name:
        inv_stmt = inv_stmt.where(StationLoc.district == name)
    inv_rows = session.execute(inv_stmt).scalars().all()
    full_count = sum(
        1 for inv in inv_rows if classify_stock_level(inv.general_bike_cnt + inv.sprout_bike_cnt, inv.capacity) == "과포화"
    )

    return TodaySummaryOut(
        today_rentals=rentals,
        urgent_dispatch_count=urgent_count,
        full_station_count=full_count,
        as_of_label=latest_date.isoformat() if latest_date else "",
    )


@router.get("/weather-summary", response_model=WeatherSummaryOut)
def weather_summary(session: Session = Depends(get_session), _user: Account = Depends(get_current_user)) -> WeatherSummaryOut:
    weather_dates = session.execute(
        select(func.distinct(func.date(RtWeather.measure_date))).order_by(func.date(RtWeather.measure_date).desc())
    ).scalars().all()
    air_dates = session.execute(
        select(func.distinct(func.date(RtAir.measure_date))).order_by(func.date(RtAir.measure_date).desc())
    ).scalars().all()

    def _avg(model, col, target_date):
        if target_date is None:
            return None
        val = session.execute(
            select(func.avg(col)).where(func.date(model.measure_date) == target_date)
        ).scalar_one_or_none()
        return round(float(val), 1) if val is not None else None

    today_w, prev_w = (weather_dates[0], weather_dates[1] if len(weather_dates) > 1 else None) if weather_dates else (None, None)
    today_a, prev_a = (air_dates[0], air_dates[1] if len(air_dates) > 1 else None) if air_dates else (None, None)

    today_temp = _avg(RtWeather, RtWeather.temperature, today_w)
    today_rain = _avg(RtWeather, RtWeather.precipitation, today_w)
    today_pm10 = _avg(RtAir, RtAir.pm10, today_a)
    prev_temp = _avg(RtWeather, RtWeather.temperature, prev_w)
    prev_rain = _avg(RtWeather, RtWeather.precipitation, prev_w)
    prev_pm10 = _avg(RtAir, RtAir.pm10, prev_a)

    # rt_weather/rt_air는 collect_rt.py가 "오늘" 것만 계속 쌓는 실시간 테이블이라, 수집을
    # 막 시작한 서버는 어제 비교 대상이 DB 안에 통째로 없다(prev_w/prev_a가 None). 이 경우
    # 기상청 과거 관측 API로 어제 하루치를 직접 가져와 그 자리를 채운다.
    if prev_temp is None or prev_rain is None or prev_pm10 is None:
        yesterday_avg = fetch_daily_avg(date.today() - timedelta(days=1))
        if prev_temp is None:
            prev_temp = yesterday_avg["temp"]
        if prev_rain is None:
            prev_rain = yesterday_avg["rain"]
        if prev_pm10 is None:
            prev_pm10 = yesterday_avg["pm10"]

    # 기준 시각에 실제 관측 시(hour)까지 포함하도록, 날짜만 있는 today_w 대신 오늘 구간의
    # 가장 최근 measure_date(전체 datetime)를 우선 사용한다.
    latest_measured_at = session.execute(
        select(func.max(RtWeather.measure_date)).where(func.date(RtWeather.measure_date) == today_w)
    ).scalar_one_or_none() if today_w else None

    return WeatherSummaryOut(
        today_temp=today_temp,
        today_rain=today_rain,
        today_pm10=today_pm10,
        diff_temp=round(today_temp - prev_temp, 1) if today_temp is not None and prev_temp is not None else None,
        diff_rain=round(today_rain - prev_rain, 1) if today_rain is not None and prev_rain is not None else None,
        diff_pm10=round(today_pm10 - prev_pm10, 1) if today_pm10 is not None and prev_pm10 is not None else None,
        measured_label=(latest_measured_at or today_w).isoformat() if (latest_measured_at or today_w) else None,
    )


@router.get("/flow", response_model=list[FlowEdgeOut])
def flow_edges(
    district_id: int | None = None,
    limit: int = 30,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[FlowEdgeOut]:
    """
    실제 완료된 대여(Rental.rent_station_id -> return_station_id)를 대여소 쌍으로
    집계한 이동 흐름. 과거 CSV 이력(rent_history/demand_predict_master)에는 출발-도착
    쌍이 없어(대여소별 집계만 존재) 이 지표는 우리 앱 자체 이용 트랜잭션에서만 산출
    가능하다 - 서비스 초기에는 표본이 적어 흐름이 드문드문 보일 수 있다는 한계가 있다.
    같은 대여소로 반납한 건(이동이 아님)은 집계에서 제외한다.
    """
    stmt = (
        select(
            Rental.rent_station_id,
            Rental.return_station_id,
            func.count().label("flow"),
        )
        .where(
            Rental.status == "완료",
            Rental.return_station_id.is_not(None),
            Rental.rent_station_id != Rental.return_station_id,
        )
        .group_by(Rental.rent_station_id, Rental.return_station_id)
    )
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.join(StationLoc, StationLoc.station_id == Rental.rent_station_id).where(
            StationLoc.district == name
        )
    rows = session.execute(stmt.order_by(func.count().desc()).limit(limit)).all()

    station_ids = {sid for row in rows for sid in (row.rent_station_id, row.return_station_id)}
    names = get_station_names(session, station_ids)
    districts_by_station = dict(
        session.execute(
            select(StationLoc.station_id, StationLoc.district).where(StationLoc.station_id.in_(station_ids))
        ).all()
    ) if station_ids else {}

    return [
        FlowEdgeOut(
            from_station_id=row.rent_station_id,
            from_station_name=names.get(row.rent_station_id),
            to_station_id=row.return_station_id,
            to_station_name=names.get(row.return_station_id),
            district_id=district_id_of(districts_by_station.get(row.rent_station_id)),
            flow=int(row.flow),
        )
        for row in rows
    ]


@router.get("/foot-traffic-demand", response_model=list[HourlyPointOut])
def foot_traffic_demand(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[HourlyPointOut]:
    """
    챔피언 ML 모델의 실제 예측값이 아니라, 시간대별 유동인구 비중을 해당 범위의
    전체 실제 대여량에 곱한 규칙 기반 근사 수요선이다 (콤보 차트의 점선).
    '유동인구가 몰리는 시간대에 대여도 몰릴 것'이라는 가정을 시각화하는 지표.
    """
    hour_expr = func.hour(DemandPredictionMaster2024.datetime_hr)
    flwpop_stmt = select(hour_expr, func.avg(DemandPredictionMaster2024.flwpop_tot)).group_by(hour_expr)
    total_stmt = select(func.sum(DemandPredictionMaster2024.general_rent_cnt + DemandPredictionMaster2024.sprout_rent_cnt))
    name = district_name(district_id) if district_id else None
    if name:
        flwpop_stmt = flwpop_stmt.where(DemandPredictionMaster2024.district == name)
        total_stmt = total_stmt.where(DemandPredictionMaster2024.district == name)

    flwpop_by_hour = {int(h): float(v or 0.0) for h, v in session.execute(flwpop_stmt).all()}
    total_flwpop = sum(flwpop_by_hour.values()) or 1.0
    total_actual = int(session.execute(total_stmt).scalar_one_or_none() or 0)

    return [
        HourlyPointOut(hour=h, value=round(flwpop_by_hour.get(h, 0.0) / total_flwpop * total_actual))
        for h in range(24)
    ]


@router.get("/weather-index", response_model=list[HourlyPointOut])
def weather_index(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[HourlyPointOut]:
    """
    기온/강수량/미세먼지를 하나의 '자전거 타기 좋은 날씨 지수'(0~100)로 합성한다.
    - 기온: 22도(체감상 자전거 타기 좋은 기준)에서 최고점, 멀어질수록 4점/도 감점
    - 강수: 비/눈이 있으면 mm당 20점 감점 (0mm면 만점)
    - 미세먼지: pm10 수치에 비례해 감점
    가중치(기온 40% : 강수 35% : 미세먼지 25%)는 자전거 이용 결정에 기온이 가장
    크게 작용한다는 도메인 가정에 따른 근사치이며, 정교한 회귀식이 아니다.
    """
    hour_expr = func.hour(DemandPredictionMaster2024.datetime_hr)
    stmt = select(
        hour_expr,
        func.avg(DemandPredictionMaster2024.temperature),
        func.avg(DemandPredictionMaster2024.precipitation),
        func.avg(DemandPredictionMaster2024.pm10),
    ).group_by(hour_expr)
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.where(DemandPredictionMaster2024.district == name)

    by_hour: dict[int, int] = {}
    for h, temp, rain, pm10 in session.execute(stmt).all():
        temp = float(temp or 0.0)
        rain = float(rain or 0.0)
        pm10 = float(pm10 or 0.0)
        temp_score = max(0.0, 100.0 - abs(temp - 22.0) * 4.0)
        rain_score = 100.0 if rain <= 0 else max(0.0, 100.0 - rain * 20.0)
        pm10_score = max(0.0, min(100.0, 100.0 - pm10 * 0.5))
        index = temp_score * 0.4 + rain_score * 0.35 + pm10_score * 0.25
        by_hour[int(h)] = round(index)

    return [HourlyPointOut(hour=h, value=by_hour.get(h, 0)) for h in range(24)]


@router.get("/feature-importance", response_model=list[FeatureImportanceOut])
def feature_importance(
    target: str = "general_rent_cnt",
    models: dict = Depends(get_champion_models),
    _admin: Account = Depends(require_role("admin")),
) -> list[FeatureImportanceOut]:
    """
    챔피언 모델(app.state.champion_models, main.py lifespan에서 MLflow 로드)의
    feature_importances_를 의미 그룹(과거 이력/날씨/인구/인프라/달력/위치/상호작용)으로
    합산해 백분율로 반환한다. target 기본값은 대여량을 대표하는 general_rent_cnt.
    """
    model = models.get(target)
    if model is None:
        raise HTTPException(404, f"Unknown target: {target}")

    groups = grouped_feature_importance(model)
    if not groups:
        raise HTTPException(
            409, f"'{target}' 모델은 feature_importances_를 지원하지 않거나 FEATURE_COLUMNS와 길이가 맞지 않습니다."
        )
    return [FeatureImportanceOut(label=label, value=value) for label, value in groups]


@router.get("/model-monitoring", response_model=ModelMonitoringOut)
def model_monitoring(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> ModelMonitoringOut:
    """
    serving/demand_prediction_forecast.py의 야간 배치가 demand_prediction_forecast에 미리 채워둔
    '전일 실제 vs 챔피언 모델 예측' 시간대별 비교를 그대로 읽는다. 요청 시점에 모델을
    돌리지 않으므로 항상 즉시 응답한다 (배치 자체가 무거운 이유는 해당 모듈의 docstring 참고).
    배치가 아직 한 번도 안 돌았으면(서버 기동 직후 등) 404.
    """
    storage_district_id = district_id or 0
    latest = session.execute(select(func.max(DemandPredictionForecast.target_date))).scalar_one_or_none()
    if latest is None:
        raise HTTPException(404, "아직 계산된 모델 모니터링 데이터가 없습니다 (야간 배치가 아직 실행되지 않았습니다).")

    rows = session.execute(
        select(DemandPredictionForecast).where(
            DemandPredictionForecast.target_date == latest,
            DemandPredictionForecast.district_id == storage_district_id,
        )
    ).scalars().all()
    by_hour = {r.hour: r for r in rows}

    return ModelMonitoringOut(
        as_of_label=latest.isoformat(),
        actual=[HourlyPointOut(hour=h, value=by_hour[h].actual_total if h in by_hour else 0) for h in range(24)],
        predicted=[HourlyPointOut(hour=h, value=by_hour[h].predicted_total if h in by_hour else 0) for h in range(24)],
        sample_station_cnt=rows[0].sample_station_cnt if rows else 0,
    )
