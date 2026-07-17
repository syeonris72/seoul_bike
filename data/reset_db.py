import os
import sys

# ==========================================
# 프로젝트 경로 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)


# ==========================================
# 데이터베이스 모듈 임포트
# ==========================================
from database.db_connection import engine
from sqlalchemy import MetaData  # Base 대신 MetaData 임포트


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    # 사용자 입력을 통한 삭제 여부 강력 재확인
    confirm = input("[경고] DataBase 전체 Table 강제 삭제 (y/n): ").strip().lower()

    if confirm == 'y':
        meta = MetaData()
        meta.reflect(bind=engine)
        meta.drop_all(bind=engine)

        print("========== 전체 테이블 강제 삭제 완료 ==========")
    else:
        print("\n========== 작업 취소 완료 ==========")