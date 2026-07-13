import os
import sys
import requests
from dotenv import load_dotenv
from sqlalchemy import text

# ==========================================
# 프로젝트 경로 및 환경변수 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 시스템 경로에 프로젝트 최상위 경로가 없다면 추가
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# 환경변수 로드
load_dotenv(os.path.join(BASE_DIR, '.env'))


# ==========================================
# 데이터베이스 모듈 임포트
# ==========================================
from database.db_connection import SessionLocal, engine
from database.orm import Base


# ==========================================
# 전역 기준 데이터 설정
# ==========================================
TARGET_DISTRICTS = ["영등포구", "마포구", "송파구", "강서구"]


# ==========================================
# 데이터베이스 유틸리티 함수
# ==========================================
def init_db(engine, models=None):
    """
    지정된 모델 리스트만 테이블 생성하거나, 리스트가 없으면 전체 생성합니다.
    """
    if models:
        # 특정 테이블만 생성
        for model in models:
            model.__table__.create(engine, checkfirst=True)
            print(f"테이블 생성 완료: {model.__tablename__}")
    else:
        # 전체 생성
        Base.metadata.create_all(bind=engine)
        print("모든 테이블 생성 완료")


def get_session():
    """데이터베이스 세션 객체 반환"""
    return SessionLocal()


def verify_db(engine):
    """
    데이터베이스 연결 상태만 확인합니다.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("DB 연결 확인 성공")
    except Exception as e:
        print(f"DB 연결 실패: {e}")


# ==========================================
# API 통신 공통 유틸리티 함수
# ==========================================
def fetch_api_json(url, params=None):
    """
    API 호출 후 JSON 파싱 데이터 반환
    """
    try:
        res = requests.get(url, params=params, timeout=15)
        res.raise_for_status()

        return res.json()

    except Exception as e:
        print(f"API 에러 발생: {e}")
        return None