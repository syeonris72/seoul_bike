from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database.db_connection import engine
from routers.admin import router as admin_router
from routers.analytics import router as analytics_router
from routers.auth import router as auth_router
from routers.config import router as config_router
from routers.driver import router as driver_router
from routers.predict import router as predict_router
from routers.station import router as station_router
from routers.user import router as user_router
from serving.mlflow_setup import configure_mlflow_environment
from serving.mlflow_model_load import load_champion_models
from serving.scheduler import start_scheduler, stop_scheduler
from serving.target_encoding import TargetEncodingCache


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_mlflow_environment()
    app.state.champion_models = load_champion_models()
    app.state.target_encoding_cache = TargetEncodingCache.build(engine)
    start_scheduler(app.state.champion_models, app.state.target_encoding_cache)
    yield
    stop_scheduler()


app = FastAPI(title="서울자전거 따릉이 수요예측 API", lifespan=lifespan)

# 프론트엔드(static/)가 별도 오리진에서 서빙되므로 로컬 개발 단계에서는 전체 허용.
# 운영 배포 시에는 allow_origins를 실제 프론트엔드 도메인으로 좁혀야 한다.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(config_router)
app.include_router(predict_router)
app.include_router(station_router)
app.include_router(user_router)
app.include_router(admin_router)
app.include_router(driver_router)
app.include_router(analytics_router)

app.mount("/static", StaticFiles(directory="static"), name="static")
