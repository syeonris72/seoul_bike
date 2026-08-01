from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

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
)
from schema.response import (
    CarbonSummaryOut,
    DispatchEfficiencyOut,
    DistrictRankingPointOut,
    FeatureImportanceOut,
    FlowEdgeOut,
    HourlyPointOut,
    ModelMonitoringOut,
    StockDistributionOut,
    TodaySummaryOut,
    WeatherSummaryOut,
    WeeklyPointOut,
)
from serving.district import DISTRICTS
from serving.deps import get_champion_models
from serving.district import district_name, district_id as district_id_of
from serving.feature_group import grouped_feature_importance
from serving.rt_flow import estimated_flow_edges, estimated_rentals
from serving.station_lookup import get_station_names
from serving.station_stock import classify_stock_level, hourly_net_outflow_by_station
from serving.env_history import fetch_daily_avg

router = APIRouter(prefix="/analytics", tags=["analytics"])

_KST = ZoneInfo("Asia/Seoul")


@router.get("/hourly-demand", response_model=list[HourlyPointOut])
def hourly_demand(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[HourlyPointOut]:
    """rt_bike_status(30분 간격 실시간 거치대 스냅샷) 순감소분 기반 추정 대여량을 시(hour)별로
    합산한다 (기간 제한 없이 수집 시작 이후 전체). 앱 자체 트랜잭션(Rental)은 서비스 초기라
    표본이 거의 없어, 계속 쌓이는 이 실시간 스냅샷이 실제 이용 패턴을 보여줄 수 있는 사실상
    유일한 소스다 (serving/rt_flow.py의 estimated_rentals 참고)."""
    name = district_name(district_id) if district_id else None
    by_hour: dict[int, int] = defaultdict(int)
    for _station_id, t0, cnt in estimated_rentals(session, name):
        by_hour[t0.hour] += cnt
    return [HourlyPointOut(hour=h, value=by_hour.get(h, 0)) for h in range(24)]


@router.get("/weekly-demand", response_model=list[WeeklyPointOut])
def weekly_demand(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[WeeklyPointOut]:
    """rt_bike_status 기반 추정 대여량을 요일별로 합산한다. datetime.weekday()는
    0=월요일~6=일요일이라 기존 day_of_week 규약과 그대로 맞는다."""
    name = district_name(district_id) if district_id else None
    by_dow: dict[int, int] = defaultdict(int)
    for _station_id, t0, cnt in estimated_rentals(session, name):
        by_dow[t0.weekday()] += cnt
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
    net_outflow_by_id = hourly_net_outflow_by_station(session)

    counts = {"과포화": 0, "고갈": 0, "부족": 0, "적정": 0}
    for inv, _district in rows:
        total = inv.general_bike_cnt + inv.sprout_bike_cnt
        level = classify_stock_level(total, inv.capacity, net_outflow_by_id.get(inv.station_id, 0.0))
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
    """'금일'을 서버 OS 타임존이 아니라 항상 서울 시각(KST) 기준으로 고정한다
    (serving/demand_prediction_forecast.py의 _KST와 동일한 이유)."""
    name = district_name(district_id) if district_id else None
    today = datetime.now(_KST).date()
    day_start = datetime.combine(today, datetime.min.time())
    day_end = day_start + timedelta(days=1)

    # rt_bike_status 순감소분 기반 추정치 - Rental(앱 자체 트랜잭션)은 서비스 초기라
    # 표본이 거의 없어 "금일 총 대여량"이 사실상 항상 0으로 보이는 문제가 있었다.
    rentals = sum(cnt for _sid, _t0, cnt in estimated_rentals(session, name, start=day_start, end=day_end))

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
    net_outflow_by_id = hourly_net_outflow_by_station(session)
    full_count = sum(
        1
        for inv in inv_rows
        if classify_stock_level(
            inv.general_bike_cnt + inv.sprout_bike_cnt, inv.capacity, net_outflow_by_id.get(inv.station_id, 0.0)
        )
        == "과포화"
    )

    return TodaySummaryOut(
        today_rentals=rentals,
        urgent_dispatch_count=urgent_count,
        full_station_count=full_count,
        as_of_label=today.isoformat(),
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
    대여소 쌍 간 이동 흐름 = (1) 완료된 실제 대여(Rental.rent_station_id ->
    return_station_id, 정확한 실측치) + (2) rt_bike_status 순감소/순증가역을 같은 수집
    버킷 안에서 최근접 거리로 짝지은 근사 추정치(serving/rt_flow.py의
    estimated_flow_edges)를 station 쌍 단위로 합산한 값이다.

    서울시 공공 API(bikeList)는 대여소별 재고 스냅샷만 제공하고 자전거 개별 이동 경로
    (출발-도착 쌍)는 주지 않으므로, (2)는 실제 이동 경로가 아니라 "비슷한 시각에 감소한
    역과 증가한 역을 가깝다는 이유로 엮은" 통계적 추정일 뿐이다 - Rental만으로는 표본이
    적어 보이지 않는 서울시 전체 이용 규모를 함께 보여주기 위한 근사치다. 같은 대여소로
    반납한 건(이동이 아님)은 두 소스 모두 집계에서 제외한다.
    """
    name = district_name(district_id) if district_id else None

    flow_counts: dict[tuple[str, str], int] = defaultdict(int)
    for (from_id, to_id), cnt in estimated_flow_edges(session, name).items():
        flow_counts[(from_id, to_id)] += cnt

    rental_stmt = (
        select(Rental.rent_station_id, Rental.return_station_id, func.count())
        .where(
            Rental.status == "완료",
            Rental.return_station_id.is_not(None),
            Rental.rent_station_id != Rental.return_station_id,
        )
        .group_by(Rental.rent_station_id, Rental.return_station_id)
    )
    if name:
        rental_stmt = rental_stmt.join(StationLoc, StationLoc.station_id == Rental.rent_station_id).where(
            StationLoc.district == name
        )
    for from_id, to_id, cnt in session.execute(rental_stmt).all():
        flow_counts[(from_id, to_id)] += int(cnt)

    top = sorted(flow_counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]

    station_ids = {sid for pair, _cnt in top for sid in pair}
    names = get_station_names(session, station_ids)
    districts_by_station = dict(
        session.execute(
            select(StationLoc.station_id, StationLoc.district).where(StationLoc.station_id.in_(station_ids))
        ).all()
    ) if station_ids else {}

    return [
        FlowEdgeOut(
            from_station_id=from_id,
            from_station_name=names.get(from_id),
            to_station_id=to_id,
            to_station_name=names.get(to_id),
            district_id=district_id_of(districts_by_station.get(from_id)),
            flow=cnt,
        )
        for (from_id, to_id), cnt in top
    ]


@router.get("/weather-index", response_model=list[HourlyPointOut])
def weather_index(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[HourlyPointOut]:
    """
    기온/강수량/미세먼지를 하나의 '자전거 타기 좋은 날씨 지수'(0~100)로 합성한다.
    실시간 관측 테이블(RtWeather/RtAir, KMA 초단기실황 수집분)을 시(hour)별로 평균낸 값을
    쓴다 - district 필터는 serving/env.py의 get_target_hour_weather와 동일하게 region_name을
    자치구명으로 취급해 조회한다.
    - 기온: 22도(체감상 자전거 타기 좋은 기준)에서 최고점, 멀어질수록 4점/도 감점
    - 강수: 비/눈이 있으면 mm당 20점 감점 (0mm면 만점)
    - 미세먼지: pm10 수치에 비례해 감점
    가중치(기온 40% : 강수 35% : 미세먼지 25%)는 자전거 이용 결정에 기온이 가장
    크게 작용한다는 도메인 가정에 따른 근사치이며, 정교한 회귀식이 아니다.
    """
    name = district_name(district_id) if district_id else None

    w_hour_expr = func.hour(RtWeather.measure_date)
    w_stmt = select(w_hour_expr, func.avg(RtWeather.temperature), func.avg(RtWeather.precipitation)).group_by(w_hour_expr)
    if name:
        w_stmt = w_stmt.where(RtWeather.region_name == name)

    a_hour_expr = func.hour(RtAir.measure_date)
    a_stmt = select(a_hour_expr, func.avg(RtAir.pm10)).group_by(a_hour_expr)
    if name:
        a_stmt = a_stmt.where(RtAir.region_name == name)

    temp_rain_by_hour = {int(h): (float(t or 0.0), float(r or 0.0)) for h, t, r in session.execute(w_stmt).all()}
    pm10_by_hour = {int(h): float(p or 0.0) for h, p in session.execute(a_stmt).all()}

    by_hour: dict[int, int] = {}
    for h in range(24):
        temp, rain = temp_rain_by_hour.get(h, (0.0, 0.0))
        pm10 = pm10_by_hour.get(h, 0.0)
        temp_score = max(0.0, 100.0 - abs(temp - 22.0) * 4.0)
        rain_score = 100.0 if rain <= 0 else max(0.0, 100.0 - rain * 20.0)
        pm10_score = max(0.0, min(100.0, 100.0 - pm10 * 0.5))
        index = temp_score * 0.4 + rain_score * 0.35 + pm10_score * 0.25
        by_hour[h] = round(index)

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
    '전일(달력 기준 어제) 실제 vs 챔피언 모델 예측' 시간대별 비교를 그대로 읽는다. '실제'는
    rt_bike_status(30분 간격 실시간 거치대 스냅샷)의 순감소량 기반 추정치라 진짜 실시간
    이력이지만, 배치 실행 시점까지 rt_bike_status가 얼마나 쌓였느냐에 따라 일부 시간대가
    비어 있을 수 있다. 요청 시점에 모델을 돌리지 않으므로 항상 즉시 응답한다 (배치 자체가
    무거운 이유는 해당 모듈의 docstring 참고). 배치가 아직 한 번도 안 돌았으면(서버 기동 직후
    등) 404.
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


@router.get("/carbon-summary", response_model=CarbonSummaryOut)
def carbon_summary(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> CarbonSummaryOut:
    """
    완료된 실제 대여(Rental) 트랜잭션 기준 누적 탄소 절감량/이동거리/평균 이용시간.
    station.py에서 반납 시점에 계산해 저장해 둔 carbon_reduction/distance_km/duration_min을 그대로 합산한다.
    """
    stmt = select(
        func.sum(Rental.carbon_reduction),
        func.sum(Rental.distance_km),
        func.avg(Rental.duration_min),
        func.count(),
    ).where(Rental.status == "완료")
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.join(StationLoc, StationLoc.station_id == Rental.rent_station_id).where(StationLoc.district == name)
    total_carbon, total_distance, avg_duration, cnt = session.execute(stmt).one()

    return CarbonSummaryOut(
        total_carbon_reduction_kg=round(float(total_carbon or 0.0), 2),
        total_distance_km=round(float(total_distance or 0.0), 1),
        avg_duration_min=round(float(avg_duration or 0.0), 1),
        completed_rental_cnt=int(cnt or 0),
    )


@router.get("/dispatch-efficiency", response_model=DispatchEfficiencyOut)
def dispatch_efficiency(
    district_id: int | None = None,
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> DispatchEfficiencyOut:
    """
    배차 지시서의 처리 효율 지표. 평균 처리 시간은 완료 건의 (dropoff_completed_at -
    ordered_at)을 분 단위로 계산한다. MySQL TIMESTAMPDIFF 단위 파라미터 바인딩
    이슈를 피하기 위해 두 시각을 그대로 읽어 파이썬에서 차이를 계산한다.
    """
    stmt = select(Dispatch)
    name = district_name(district_id) if district_id else None
    if name:
        stmt = stmt.join(StationLoc, StationLoc.station_id == Dispatch.from_station_id).where(StationLoc.district == name)
    dispatches = session.execute(stmt).scalars().all()

    completed = [d for d in dispatches if d.status == "완료"]
    durations = [
        (d.dropoff_completed_at - d.ordered_at).total_seconds() / 60.0
        for d in completed
        if d.dropoff_completed_at is not None
    ]
    avg_completion_min = round(sum(durations) / len(durations), 1) if durations else None

    return DispatchEfficiencyOut(
        avg_completion_min=avg_completion_min,
        emergency_cnt=sum(1 for d in dispatches if d.is_emergency),
        normal_cnt=sum(1 for d in dispatches if not d.is_emergency),
        completed_cnt=len(completed),
        pending_cnt=sum(1 for d in dispatches if d.status != "완료"),
    )


@router.get("/district-ranking", response_model=list[DistrictRankingPointOut])
def district_ranking(
    session: Session = Depends(get_session),
    _admin: Account = Depends(require_role("admin")),
) -> list[DistrictRankingPointOut]:
    """자치구별 rt_bike_status 기반 추정 대여량 랭킹 (전체 자치구 뷰에서 구간 비교용)."""
    events = estimated_rentals(session)
    station_ids = {sid for sid, _t0, _cnt in events}
    districts_by_station = dict(
        session.execute(
            select(StationLoc.station_id, StationLoc.district).where(StationLoc.station_id.in_(station_ids))
        ).all()
    ) if station_ids else {}

    by_name: dict[str, int] = defaultdict(int)
    for station_id, _t0, cnt in events:
        d = districts_by_station.get(station_id)
        if d:
            by_name[d] += cnt

    points = [
        DistrictRankingPointOut(district_id=d["id"], district_name=d["name"], value=by_name.get(d["name"], 0))
        for d in DISTRICTS
    ]
    return sorted(points, key=lambda p: p.value, reverse=True)
