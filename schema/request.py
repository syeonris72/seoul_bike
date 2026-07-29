import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    login_id: str
    password: str
    role: Literal["admin", "driver", "user"]


class SignupRequest(BaseModel):
    login_id: str
    password: str
    password_confirm: str
    name: str
    email: EmailStr

    @field_validator("password")
    @classmethod
    def password_meets_policy(cls, v):
        if not (8 <= len(v) <= 16):
            raise ValueError("password must be 8-16 characters long")
        if not re.search(r"[A-Za-z]", v):
            raise ValueError("password must contain a letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("password must contain a number")
        if not re.search(r"[^A-Za-z0-9]", v):
            raise ValueError("password must contain a special character")
        return v

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("passwords do not match")
        return v


class ChangeLoginIdRequest(BaseModel):
    new_login_id: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class RentalCreateRequest(BaseModel):
    station_id: str
    bike_id: str
    bike_type: Literal["general", "sprout"]


class ReturnRequest(BaseModel):
    return_station_id: str
    bike_id: str


class ReportCreateRequest(BaseModel):
    bike_id: str
    station_id: str
    issue: str


class FavoriteCreateRequest(BaseModel):
    station_id: str


class DispatchCreateRequest(BaseModel):
    from_station_id: str
    to_station_id: str
    general_qty: int = Field(default=0, ge=0)
    sprout_qty: int = Field(default=0, ge=0)
    driver_id: int | None = None
    is_emergency: bool = False


class ReportDispatchCreateRequest(BaseModel):
    station_id: str
    driver_id: int | None = None


class DispatchStatusUpdateRequest(BaseModel):
    action: Literal["start", "complete"]


class ReportStatusUpdateRequest(BaseModel):
    status: Literal["수리대기", "해결완료"]
