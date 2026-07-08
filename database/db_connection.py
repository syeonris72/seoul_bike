from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# ==========================================
# 환경 설정 및 DB 연결 URL 구성
# ==========================================
load_dotenv()  # .env 파일 로드

DATABASE_URL = (
    f"mysql+pymysql://"
    f"{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}"
    f"@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT', '3306')}"
    f"/{os.getenv('DB_NAME')}?charset=utf8mb4"
)


# ==========================================
# 엔진 생성 및 세션 팩토리 설정
# ==========================================
# SQLAlchemy 엔진 생성 (echo=True로 SQL 로그 활성화)
engine = create_engine(DATABASE_URL, echo=True)

# 세션 팩토리 생성 (autocommit/flush 비활성화로 정밀 제어)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ==========================================
# 데이터베이스 세션 유틸리티
# ==========================================
def get_session():
    """DB 세션을 생성하고 안전하게 닫아주는 제너레이터 함수"""
    with SessionLocal() as session:
        yield session