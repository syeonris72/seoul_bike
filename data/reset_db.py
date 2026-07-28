import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)


from database.db_connection import engine
from sqlalchemy import MetaData  # Base 대신 MetaData 임포트


if __name__ == "__main__":
    db_name = os.getenv("DB_NAME", "?")
    db_host = os.getenv("DB_HOST", "?")
    print(f"[경고] 대상 DB: {db_host}/{db_name} 의 전체 테이블을 삭제합니다. 되돌릴 수 없습니다.")
    confirm = input(f"계속하려면 DB 이름({db_name})을 그대로 입력하세요: ").strip()
    if confirm == db_name:
        meta = MetaData()
        meta.reflect(bind=engine)
        meta.drop_all(bind=engine)

        print("========== 전체 테이블 강제 삭제 완료 ==========")
    else:
        print("\n========== 입력값 불일치로 작업 취소 완료 ==========")