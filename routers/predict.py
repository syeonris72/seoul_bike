from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.db_connection import get_session
from schema.response import PredictionResponse
from serving.deps import get_champion_models, get_target_encoding_cache
from serving.feature import StationNotFoundError, build_feature_row

router = APIRouter(prefix="/predict", tags=["predict"])


@router.get("/stations/{station_id}", response_model=PredictionResponse)
def predict_station_demand(
    station_id: str,
    session: Session = Depends(get_session),
    models: dict = Depends(get_champion_models),
    encoding_cache=Depends(get_target_encoding_cache),
) -> PredictionResponse:
    """
    station_id의 다음 1시간 수요(일반/새싹 대여·반납 건수)를 예측한다.

    동기(def) 함수로 둔다 - get_session이 블로킹 SQLAlchemy 세션을 yield하고
    model.predict()도 블로킹 CPU 작업이라, FastAPI가 스레드풀에서 돌리는
    동기 경로로 둬야 이벤트 루프가 막히지 않는다.
    """
    now = datetime.now(ZoneInfo("Asia/Seoul")).replace(tzinfo=None)
    target_dt = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)

    try:
        feature_row = build_feature_row(session, station_id, target_dt, encoding_cache)
    except StationNotFoundError:
        raise HTTPException(status_code=404, detail=f"Unknown station_id: {station_id}")

    predictions = {
        target: max(0, round(float(model.predict(feature_row)[0])))
        for target, model in models.items()
    }

    return PredictionResponse(station_id=station_id, target_datetime=target_dt, **predictions)
