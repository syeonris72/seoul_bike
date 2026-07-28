from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.deps import get_current_user
from auth.jwt import create_access_token
from auth.password import hash_password, verify_password
from database.db_connection import get_session
from models.models import Account
from schema.request import LoginRequest, SignupRequest
from schema.response import AccountOut, TokenResponse
from serving.district import district_name

router = APIRouter(prefix="/auth", tags=["auth"])


def _account_out(account: Account) -> AccountOut:
    return AccountOut(
        id=account.id,
        login_id=account.login_id,
        name=account.name,
        role=account.role,
        district_id=account.district_id,
        district_name=district_name(account.district_id),
        phone=account.phone,
        email=account.email,
        created_at=account.created_at,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    account = session.execute(
        select(Account).where(
            Account.login_id == req.login_id,
            Account.role == req.role,
            Account.is_active.is_(True),
        )
    ).scalar_one_or_none()

    if account is None or not verify_password(req.password, account.password_hash):
        raise HTTPException(401, "아이디, 비밀번호 또는 접속 권한이 일치하지 않습니다.")

    token = create_access_token(account.id, account.role)
    return TokenResponse(
        access_token=token,
        user_id=account.id,
        role=account.role,
        name=account.name,
        district_id=account.district_id,
        district_name=district_name(account.district_id),
    )


@router.post("/signup", response_model=AccountOut)
def signup(req: SignupRequest, session: Session = Depends(get_session)) -> AccountOut:
    existing = session.execute(
        select(Account).where(Account.login_id == req.login_id)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(409, "이미 사용 중인 아이디입니다.")

    account = Account(
        login_id=req.login_id,
        password_hash=hash_password(req.password),
        name=req.name,
        role="user",
        email=req.email,
    )
    session.add(account)
    session.commit()
    session.refresh(account)
    return _account_out(account)


@router.get("/me", response_model=AccountOut)
def me(user: Account = Depends(get_current_user)) -> AccountOut:
    return _account_out(user)
