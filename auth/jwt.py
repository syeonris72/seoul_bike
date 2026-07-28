import os
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, status
from dotenv import load_dotenv

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise ValueError("환경 변수에 SECRET_KEY 설정 X")

ALGORITHM = "HS256"


def create_access_token(user_id: int, role: str, expires_minutes: int = 60) -> str:
    """사용자 정보(user_id, role)를 포함한 JWT 생성"""
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """토큰의 유효성을 검증하고 페이로드를 반환"""
    try:
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