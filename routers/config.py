import os

from fastapi import APIRouter

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/kakao-js-key")
def kakao_js_key() -> dict:
    """
    카카오맵 JS SDK는 <script src=".../sdk.js?appkey=..."> 형태로 브라우저에서 직접 로드해야
    해서 이 키는 어차피 클라이언트에 노출된다(카카오 콘솔에서 도메인 화이트리스트로 보호).
    프론트가 .env를 읽을 수 없으니 이 엔드포인트로 한 번 내려준다.
    """
    return {"key": os.getenv("KAKAO_JAVASCRIPT_API_KEY", "")}
