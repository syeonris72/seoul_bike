"""
개발/테스트용 역할별 계정 1세트 시딩 (admin 1, driver 4, user 1).
비밀번호가 전부 "1234"인 테스트용 계정이므로 운영 DB에서는 절대 실행하지 말 것.
실행: python -m data.seed_accounts
"""
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.password import hash_password
from database.db_connection import engine
from models.models import Account

SEED_ACCOUNTS = [
    {"login_id": "EMP-2024-0001", "password": "1234", "name": "김관제", "role": "admin", "district_id": None},
    {"login_id": "DRV-2024-0001", "password": "1234", "name": "김마포", "role": "driver", "district_id": 1},
    {"login_id": "DRV-2024-0002", "password": "1234", "name": "이강서", "role": "driver", "district_id": 2},
    {"login_id": "DRV-2024-0003", "password": "1234", "name": "박송파", "role": "driver", "district_id": 3},
    {"login_id": "DRV-2024-0004", "password": "1234", "name": "정영등포", "role": "driver", "district_id": 4},
    {"login_id": "user1234", "password": "1234", "name": "홍길동", "role": "user", "district_id": None},
]


def main() -> None:
    db_name = os.getenv("DB_NAME", "?")
    db_host = os.getenv("DB_HOST", "?")
    print(f"대상 DB: {db_host}/{db_name} (비밀번호 '1234'짜리 테스트 계정을 시딩합니다)")
    answer = input(f"계속하려면 DB 이름({db_name})을 그대로 입력하세요: ")
    if answer != db_name:
        print("입력값이 일치하지 않아 취소되었습니다.")
        return

    with Session(engine) as session:
        created = 0
        for spec in SEED_ACCOUNTS:
            existing = session.execute(
                select(Account).where(Account.login_id == spec["login_id"])
            ).scalar_one_or_none()
            if existing:
                continue
            session.add(Account(
                login_id=spec["login_id"],
                password_hash=hash_password(spec["password"]),
                name=spec["name"],
                role=spec["role"],
                district_id=spec["district_id"],
            ))
            created += 1
        session.commit()
        print(f"계정 시딩 완료: {created}개 생성")


if __name__ == "__main__":
    main()
