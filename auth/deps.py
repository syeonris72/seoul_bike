from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.jwt import decode_access_token
from database.db_connection import get_session
from models.models import Account


def get_current_user(request: Request, session: Session = Depends(get_session)) -> Account:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    payload = decode_access_token(auth_header.removeprefix("Bearer ").strip())

    account = session.execute(
        select(Account).where(Account.id == payload["user_id"], Account.is_active.is_(True))
    ).scalar_one_or_none()
    if account is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found or deactivated")
    return account


def require_role(*roles: str):
    def _checker(user: Account = Depends(get_current_user)) -> Account:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user
    return _checker
