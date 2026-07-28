"""
실시간 날씨/미세먼지/자전거 거치 현황(rt_weather/rt_air/rt_bike_status)을 주기적으로
수집하는 백그라운드 스케줄러.

station_stock(우리 앱이 실제로 관리하는 대여/반납 재고)는 여기서 건드리지 않는다 —
그건 앱 자체의 대여/반납/배차 트랜잭션으로만 바뀌어야 한다. 실시간 API 총대수로 주기적으로
덮어쓰면 방금 일어난 대여/반납이 되돌아가 버리므로, 이 스케줄러는 rt_* 로그 테이블만 계속
쌓는다 (수요예측 서빙의 날씨 폴백, 헤더 날씨 위젯의 "오늘 vs 어제" 비교 등에 쓰인다).
"""
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _run_rt_collection() -> None:
    from data.collect_rt import collect_rt_air, collect_rt_bike, collect_rt_weather

    for name, fn in [("weather", collect_rt_weather), ("air", collect_rt_air), ("bike", collect_rt_bike)]:
        try:
            fn()
        except Exception:
            logger.exception("실시간 %s 수집 실패", name)


def start_scheduler(
    champion_models: dict[str, Any] | None = None,
    target_encoding_cache: Any | None = None,
) -> BackgroundScheduler:
    """
    champion_models/target_encoding_cache는 main.py lifespan에서 로드된 것을 그대로
    넘겨받는다 (요청 없이 백그라운드에서 도는 배치라 FastAPI Depends를 못 쓴다).
    둘 다 주어졌을 때만 모델 모니터링 backfill 잡을 등록한다.
    """
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    interval_minutes = int(os.getenv("RT_COLLECT_INTERVAL_MINUTES", "30"))
    _scheduler = BackgroundScheduler(timezone="Asia/Seoul")
    _scheduler.add_job(
        _run_rt_collection,
        "interval",
        minutes=interval_minutes,
        id="rt_collection",
        next_run_time=datetime.now() + timedelta(seconds=60),  # 기동 직후 무거운 모델 로딩과 안 겹치게 살짝 지연
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    if champion_models is not None and target_encoding_cache is not None:
        from serving.demand_prediction_forecast import run_model_monitoring_backfill

        _scheduler.add_job(
            run_model_monitoring_backfill,
            "cron",
            args=[champion_models, target_encoding_cache],
            hour=1, minute=10,  # 전일 데이터가 확정된 새벽에 실행
            id="model_monitoring_backfill",
            next_run_time=datetime.now() + timedelta(seconds=90),  # 기동 직후 1회도 바로 채워 첫 배포 때 빈 화면 방지
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )

    _scheduler.start()
    logger.info("실시간 데이터 수집 스케줄러 시작 (%d분 간격)", interval_minutes)
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
