from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.deps import require_role
from auth.password import hash_password, verify_password
from database.db_connection import get_session
from models.models import Account
from schema.request import ChangeLoginIdRequest, ChangePasswordRequest
from schema.response import AccountOut
from serving.district import district_name

router = APIRouter(prefix="/user", tags=["user"])


@router.patch("/login-id", response_model=AccountOut)
def change_login_id(
    req: ChangeLoginIdRequest,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("admin", "driver", "user")),
) -> AccountOut:
    existing = session.execute(
        select(Account).where(Account.login_id == req.new_login_id, Account.id != user.id)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "이미 사용 중인 아이디입니다.")

    user.login_id = req.new_login_id
    session.commit()
    session.refresh(user)
    return AccountOut(
        id=user.id, login_id=user.login_id, name=user.name, role=user.role,
        district_id=user.district_id, district_name=district_name(user.district_id),
        phone=user.phone, email=user.email, created_at=user.created_at,
    )


@router.patch("/password", status_code=204)
def change_password(
    req: ChangePasswordRequest,
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("admin", "driver", "user")),
) -> None:
    if not verify_password(req.current_password, user.password_hash):
        raise HTTPException(400, "현재 비밀번호가 일치하지 않습니다.")
    user.password_hash = hash_password(req.new_password)
    session.commit()


@router.delete("/me", status_code=204)
def withdraw(
    session: Session = Depends(get_session),
    user: Account = Depends(require_role("user")),
) -> None:
    user.is_active = False
    session.commit()
