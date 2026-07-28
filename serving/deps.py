from typing import Any

from fastapi import Request

from serving.target_encoding import TargetEncodingCache


def get_champion_models(request: Request) -> dict[str, Any]:
    """FastAPI startup(lifespan)에서 app.state에 캐싱해둔 타깃별 챔피언 모델을 반환한다."""
    return request.app.state.champion_models


def get_target_encoding_cache(request: Request) -> TargetEncodingCache:
    """FastAPI startup(lifespan)에서 app.state에 캐싱해둔 타깃 인코딩 캐시를 반환한다."""
    return request.app.state.target_encoding_cache
