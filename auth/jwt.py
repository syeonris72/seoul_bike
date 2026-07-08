import os
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status
from dotenv import load_dotenv

# ==========================================
# 환경 설정 및 보안 키 로드
# ==========================================
load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY", "seoul-bike-secret-key")

if not SECRET_KEY:
    raise ValueError("환경 변수에 SECRET_KEY 설정 X")

ALGORITHM = "HS256"  # JWT 서명 알고리즘 설정


# ==========================================
# Access Token 생성
# ==========================================
def create_access_token(user_id: int, role: str, expires_minutes: int = 60) -> str:
    """사용자 정보(user_id, role)를 포함한 JWT 생성"""
    now = datetime.now(timezone.utc)

    # 토큰 페이로드 구성
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ==========================================
# Access Token 검증 및 복호화
# ==========================================
def decode_access_token(token: str) -> dict:
    """토큰의 유효성을 검증하고 페이로드를 반환"""
    try:
        # 토큰 디코딩 및 검증
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject"
            )

        return {
            "user_id": int(user_id_str),
            "role": payload.get("role", "user"),
        }

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )