from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from urllib.parse import quote_plus
import os

load_dotenv()  # .env 파일 로드

DATABASE_URL = (
    f"mysql+pymysql://"
    f"{quote_plus(os.getenv('DB_USER', ''))}:{quote_plus(os.getenv('DB_PASSWORD', ''))}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT', '3306')}"
    f"/{os.getenv('DB_NAME')}?charset=utf8mb4"
)


# SQLAlchemy 엔진 생성 (DB_ECHO=true일 때만 SQL 로그 활성화, 기본은 비활성화)
engine = create_engine(DATABASE_URL, echo=os.getenv("DB_ECHO", "false").lower() == "true")

# 세션 팩토리 생성 (autocommit/flush 비활성화로 정밀 제어)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


def get_session():
    """DB 세션을 생성하고 안전하게 닫아주는 제너레이터 함수"""
    with SessionLocal() as session:
        yield session