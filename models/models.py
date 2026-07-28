from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Float, Numeric, DateTime, Date, Text, Boolean, func, ForeignKey, UniqueConstraint, Index, CheckConstraint
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column
from database.orm import Base
from typing import Optional


class RentHistory2024(Base):
    __tablename__ = "rent_history_2024"
    datetime_hr = Column(DateTime, primary_key=True, comment="기준 시간 (1시간 단위)")
    station_id = Column(String(50), primary_key=True, comment="대여소 ID")
    general_rent_cnt = Column(Integer, default=0, comment="일반자전거 대여 건수")
    sprout_rent_cnt = Column(Integer, default=0, comment="새싹자전거 대여 건수")
    general_rtn_cnt = Column(Integer, default=0, comment="일반자전거 반납 건수")
    sprout_rtn_cnt = Column(Integer, default=0, comment="새싹자전거 반납 건수")
    total_use_min = Column(Integer, default=0, comment="총 사용 시간(분)")
    avg_use_min = Column(Float, default=0.0, comment="평균 사용 시간(분)")
    rent_male_cnt = Column(Integer, default=0, comment="대여 남성 건수")
    rent_female_cnt = Column(Integer, default=0, comment="대여 여성 건수")
    rent_gender_unk_cnt = Column(Integer, default=0, comment="대여 성별 미상 건수")
    rtn_male_cnt = Column(Integer, default=0, comment="반납 남성 건수")
    rtn_female_cnt = Column(Integer, default=0, comment="반납 여성 건수")
    rtn_gender_unk_cnt = Column(Integer, default=0, comment="반납 성별 미상 건수")
    rent_age_10_cnt = Column(Integer, default=0, comment="대여 10대(이하) 건수")
    rent_age_20_cnt = Column(Integer, default=0, comment="대여 20대 건수")
    rent_age_30_cnt = Column(Integer, default=0, comment="대여 30대 건수")
    rent_age_40_cnt = Column(Integer, default=0, comment="대여 40대 건수")
    rent_age_50_cnt = Column(Integer, default=0, comment="대여 50대 건수")
    rent_age_60_cnt = Column(Integer, default=0, comment="대여 60대 이상 건수")
    rent_age_unk_cnt = Column(Integer, default=0, comment="대여 연령 미상 건수")
    rtn_age_10_cnt = Column(Integer, default=0, comment="반납 10대(이하) 건수")
    rtn_age_20_cnt = Column(Integer, default=0, comment="반납 20대 건수")
    rtn_age_30_cnt = Column(Integer, default=0, comment="반납 30대 건수")
    rtn_age_40_cnt = Column(Integer, default=0, comment="반납 40대 건수")
    rtn_age_50_cnt = Column(Integer, default=0, comment="반납 50대 건수")
    rtn_age_60_cnt = Column(Integer, default=0, comment="반납 60대 이상 건수")
    rtn_age_unk_cnt = Column(Integer, default=0, comment="반납 연령 미상 건수")


class RentHistory2023(Base):
    __tablename__ = "rent_history_2023"
    datetime_hr = Column(DateTime, primary_key=True, comment="기준 시간 (1시간 단위)")
    station_id = Column(String(50), primary_key=True, comment="대여소 ID")
    general_rent_cnt = Column(Integer, default=0, comment="일반자전거 대여 건수")
    sprout_rent_cnt = Column(Integer, default=0, comment="새싹자전거 대여 건수")
    general_rtn_cnt = Column(Integer, default=0, comment="일반자전거 반납 건수")
    sprout_rtn_cnt = Column(Integer, default=0, comment="새싹자전거 반납 건수")
    total_use_min = Column(Integer, default=0, comment="총 사용 시간(분)")
    avg_use_min = Column(Float, default=0.0, comment="평균 사용 시간(분)")
    rent_male_cnt = Column(Integer, default=0, comment="대여 남성 건수")
    rent_female_cnt = Column(Integer, default=0, comment="대여 여성 건수")
    rent_gender_unk_cnt = Column(Integer, default=0, comment="대여 성별 미상 건수")
    rtn_male_cnt = Column(Integer, default=0, comment="반납 남성 건수")
    rtn_female_cnt = Column(Integer, default=0, comment="반납 여성 건수")
    rtn_gender_unk_cnt = Column(Integer, default=0, comment="반납 성별 미상 건수")
    rent_age_10_cnt = Column(Integer, default=0, comment="대여 10대(이하) 건수")
    rent_age_20_cnt = Column(Integer, default=0, comment="대여 20대 건수")
    rent_age_30_cnt = Column(Integer, default=0, comment="대여 30대 건수")
    rent_age_40_cnt = Column(Integer, default=0, comment="대여 40대 건수")
    rent_age_50_cnt = Column(Integer, default=0, comment="대여 50대 건수")
    rent_age_60_cnt = Column(Integer, default=0, comment="대여 60대 이상 건수")
    rent_age_unk_cnt = Column(Integer, default=0, comment="대여 연령 미상 건수")
    rtn_age_10_cnt = Column(Integer, default=0, comment="반납 10대(이하) 건수")
    rtn_age_20_cnt = Column(Integer, default=0, comment="반납 20대 건수")
    rtn_age_30_cnt = Column(Integer, default=0, comment="반납 30대 건수")
    rtn_age_40_cnt = Column(Integer, default=0, comment="반납 40대 건수")
    rtn_age_50_cnt = Column(Integer, default=0, comment="반납 50대 건수")
    rtn_age_60_cnt = Column(Integer, default=0, comment="반납 60대 이상 건수")
    rtn_age_unk_cnt = Column(Integer, default=0, comment="반납 연령 미상 건수")


class StationLoc(Base):
    __tablename__ = "station_loc"
    station_id: Mapped[str] = mapped_column(String(50), primary_key=True, comment="대여소ID")
    address_1: Mapped[str | None] = mapped_column(String(255), comment="주소1")
    address_2: Mapped[str | None] = mapped_column(String(255), comment="주소2")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="위도")
    lon: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="경도")
    district: Mapped[str | None] = mapped_column(String(50), comment="자치구")
    admin_dong: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
        comment="행정동 - 카카오 좌표->행정구역 API(coord2regioncode)로 역지오코딩한 1회성 배치 결과 (data/backfill_neighborhood.py)",
    )
    grid_x: Mapped[int | None] = mapped_column(Integer, comment="기상청격자X")
    grid_y: Mapped[int | None] = mapped_column(Integer, comment="기상청격자Y")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="데이터수집일시")


class RtBikeStatus(Base):
    __tablename__ = "rt_bike_status"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    station_id: Mapped[str] = mapped_column(String(50), index=True, comment="대여소ID")
    rack_tot_cnt: Mapped[int | None] = mapped_column(Integer, comment="거치대개수")
    station_name: Mapped[str | None] = mapped_column(String(255), comment="대여소명")
    parked_bike_cnt: Mapped[int | None] = mapped_column(Integer, comment="자전거주차총건수")
    shared_rate: Mapped[float | None] = mapped_column(Float, comment="거치율")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="위도")
    lon: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="경도")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="데이터수집일시")


class DemandPredictionMaster2024(Base):
    __tablename__ = "demand_prediction_master_2024"
    datetime_hr: Mapped[datetime] = mapped_column(DateTime, primary_key=True, comment="기준 시간 (1시간 단위)")
    station_id: Mapped[str] = mapped_column(String(50), primary_key=True, comment="대여소 ID")
    general_rent_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="일반자전거 대여 건수")
    sprout_rent_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="새싹자전거 대여 건수")
    general_rtn_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="일반자전거 반납 건수")
    sprout_rtn_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="새싹자전거 반납 건수")
    total_use_min: Mapped[int | None] = mapped_column(Integer, default=0, comment="총 사용 시간(분)")
    avg_use_min: Mapped[float | None] = mapped_column(Float, default=0.0, comment="평균 사용 시간(분)")
    rent_male_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 남성 건수")
    rent_female_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 여성 건수")
    rent_gender_unk_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 성별 미상 건수")
    rent_age_10_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 10대(이하) 건수")
    rent_age_20_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 20대 건수")
    rent_age_30_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 30대 건수")
    rent_age_40_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 40대 건수")
    rent_age_50_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 50대 건수")
    rent_age_60_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 60대 이상 건수")
    rent_age_unk_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="대여 연령 미상 건수")
    rtn_male_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 남성 건수")
    rtn_female_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 여성 건수")
    rtn_gender_unk_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 성별 미상 건수")
    rtn_age_10_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 10대(이하) 건수")
    rtn_age_20_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 20대 건수")
    rtn_age_30_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 30대 건수")
    rtn_age_40_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 40대 건수")
    rtn_age_50_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 50대 건수")
    rtn_age_60_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 60대 이상 건수")
    rtn_age_unk_cnt: Mapped[int | None] = mapped_column(Integer, default=0, comment="반납 연령 미상 건수")
    district: Mapped[str | None] = mapped_column(String(50), index=True, comment="자치구")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="위도")
    lon: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="경도")
    subway_cnt_300m: Mapped[int | None] = mapped_column(Integer, default=0, comment="300m 내 지하철역 수")
    biz_cnt_300m: Mapped[int | None] = mapped_column(Integer, default=0, comment="300m 내 직장 수")
    edu_cnt_500m: Mapped[int | None] = mapped_column(Integer, default=0, comment="500m 내 교육시설 수")
    park_cnt_500m: Mapped[int | None] = mapped_column(Integer, default=0, comment="500m 내 공원 수")
    river_cnt_1km: Mapped[int | None] = mapped_column(Integer, default=0, comment="1km 내 하천 수")
    dist_subway: Mapped[float | None] = mapped_column(Float, comment="가장 가까운 지하철역까지 거리(m)")
    dist_river: Mapped[float | None] = mapped_column(Float, comment="가장 가까운 하천까지 거리(m)")
    temperature: Mapped[float | None] = mapped_column(Float, comment="기온(℃)")
    precipitation: Mapped[float | None] = mapped_column(Float, comment="강수량(mm)")
    snowfall: Mapped[float | None] = mapped_column(Float, comment="적설량(cm)")
    pm10: Mapped[float | None] = mapped_column(Float, comment="미세먼지(PM10)")
    flwpop_tot: Mapped[float | None] = mapped_column(Float, comment="총유동인구")
    flwpop_10s: Mapped[float | None] = mapped_column(Float, comment="10대 유동인구")
    flwpop_20s: Mapped[float | None] = mapped_column(Float, comment="20대 유동인구")
    flwpop_30s: Mapped[float | None] = mapped_column(Float, comment="30대 유동인구")
    flwpop_40s: Mapped[float | None] = mapped_column(Float, comment="40대 유동인구")
    flwpop_50s: Mapped[float | None] = mapped_column(Float, comment="50대 유동인구")
    flwpop_60up: Mapped[float | None] = mapped_column(Float, comment="60대 이상 유동인구")
    lvgpop_tot: Mapped[float | None] = mapped_column(Float, comment="총생활인구")
    lvgpop_10s: Mapped[float | None] = mapped_column(Float, comment="10대 생활인구")
    lvgpop_20s: Mapped[float | None] = mapped_column(Float, comment="20대 생활인구")
    lvgpop_30s: Mapped[float | None] = mapped_column(Float, comment="30대 생활인구")
    lvgpop_40s: Mapped[float | None] = mapped_column(Float, comment="40대 생활인구")
    lvgpop_50s: Mapped[float | None] = mapped_column(Float, comment="50대 생활인구")
    lvgpop_60up: Mapped[float | None] = mapped_column(Float, comment="60대 이상 생활인구")
    is_holiday: Mapped[bool | None] = mapped_column(Boolean, default=False, comment="공휴일 여부")
    day_of_week: Mapped[int | None] = mapped_column(Integer, comment="요일(0=월요일, 6=일요일)")
    is_weekend: Mapped[bool | None] = mapped_column(Boolean, default=False, comment="주말 여부")

    # PK가 (datetime_hr, station_id) 순서라 station_id 단독/선두 필터(예: serving/rent_history.py의
    # fetch_station_window)는 PRIMARY 인덱스를 효율적으로 못 타 datetime_hr 구간 전체를
    # 스캔한 뒤 station_id로 걸러낸다. (station_id, datetime_hr) 복합 인덱스로 그 경로를 커버한다.
    __table_args__ = (
        Index("ix_demand_prediction_master_2024_station_dt", "station_id", "datetime_hr"),
    )


class HourlyAir2024(Base):
    __tablename__ = 'hourly_air_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    pm10: Mapped[float | None] = mapped_column(Float, comment="미세먼지(PM10)")
    pm25: Mapped[float | None] = mapped_column(Float, comment="초미세먼지(PM2.5)")


class RtAir(Base):
    __tablename__ = 'rt_air'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    pm10: Mapped[float | None] = mapped_column(Float, comment="미세먼지(PM10)")
    pm25: Mapped[float | None] = mapped_column(Float, comment="초미세먼지(PM2.5)")


class HourlyTemp2024(Base):
    __tablename__ = 'hourly_temp_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    temperature: Mapped[float | None] = mapped_column(Float, comment="기온(℃)")


class HourlyPrecip2024(Base):
    __tablename__ = 'hourly_precip_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    precipitation: Mapped[float | None] = mapped_column(Float, comment="강수량(mm)")


class HourlySnow2024(Base):
    __tablename__ = 'hourly_snow_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    snowfall: Mapped[float | None] = mapped_column(Float, comment="적설량(cm)")


class RtWeather(Base):
    __tablename__ = 'rt_weather'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    temperature: Mapped[float | None] = mapped_column(Float, comment="기온(℃)")
    precipitation: Mapped[float | None] = mapped_column(Float, comment="강수량(mm)")
    humidity: Mapped[float | None] = mapped_column(Float, comment="습도(%)")


class EnvMaster2024(Base):
    __tablename__ = 'env_master_2024'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    pm10: Mapped[float | None] = mapped_column(Float, comment="미세먼지(PM10)")
    temperature: Mapped[float | None] = mapped_column(Float, comment="기온(℃)")
    precipitation: Mapped[float | None] = mapped_column(Float, comment="강수량(mm)")
    snowfall: Mapped[float | None] = mapped_column(Float, comment="적설량(cm)")


class PopFlow2024(Base):
    __tablename__ = "pop_flow_2024"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    stdr_yyqu_cd: Mapped[str | None] = mapped_column(String(50), comment="기준년분기코드")
    signgu_cd: Mapped[str | None] = mapped_column(String(50), comment="자치구코드")
    signgu_cd_nm: Mapped[str | None] = mapped_column(String(50), comment="자치구명")

    tot_flpop_co: Mapped[float | None] = mapped_column(Float, comment="총유동인구수")
    ml_flpop_co: Mapped[float | None] = mapped_column(Float, comment="남성유동인구수")
    fml_flpop_co: Mapped[float | None] = mapped_column(Float, comment="여성유동인구수")

    agrde_10_flpop_co: Mapped[float | None] = mapped_column(Float, comment="10대유동인구")
    agrde_20_flpop_co: Mapped[float | None] = mapped_column(Float, comment="20대유동인구")
    agrde_30_flpop_co: Mapped[float | None] = mapped_column(Float, comment="30대유동인구")
    agrde_40_flpop_co: Mapped[float | None] = mapped_column(Float, comment="40대유동인구")
    agrde_50_flpop_co: Mapped[float | None] = mapped_column(Float, comment="50대유동인구")
    agrde_60_above_flpop_co: Mapped[float | None] = mapped_column(Float, comment="60대이상유동인구")

    tmzon_00_06_flpop_co: Mapped[float | None] = mapped_column(Float, comment="00~06시유동인구")
    tmzon_06_11_flpop_co: Mapped[float | None] = mapped_column(Float, comment="06~11시유동인구")
    tmzon_11_14_flpop_co: Mapped[float | None] = mapped_column(Float, comment="11~14시유동인구")
    tmzon_14_17_flpop_co: Mapped[float | None] = mapped_column(Float, comment="14~17시유동인구")
    tmzon_17_21_flpop_co: Mapped[float | None] = mapped_column(Float, comment="17~21시유동인구")
    tmzon_21_24_flpop_co: Mapped[float | None] = mapped_column(Float, comment="21~24시유동인구")

    mon_flpop_co: Mapped[float | None] = mapped_column(Float, comment="월요일유동인구")
    tues_flpop_co: Mapped[float | None] = mapped_column(Float, comment="화요일유동인구")
    wed_flpop_co: Mapped[float | None] = mapped_column(Float, comment="수요일유동인구")
    thur_flpop_co: Mapped[float | None] = mapped_column(Float, comment="목요일유동인구")
    fri_flpop_co: Mapped[float | None] = mapped_column(Float, comment="금요일유동인구")
    sat_flpop_co: Mapped[float | None] = mapped_column(Float, comment="토요일유동인구")
    sun_flpop_co: Mapped[float | None] = mapped_column(Float, comment="일요일유동인구")


class PopLiving2024(Base):
    __tablename__ = "pop_living_2024"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    stdr_de_id: Mapped[str] = mapped_column(String(20), comment="기준일ID")
    tmzon_pd_se: Mapped[str] = mapped_column(String(20), comment="시간대구분")
    adstrd_code_se: Mapped[str] = mapped_column(String(20), comment="자치구코드")
    tot_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="총생활인구수")

    male_f0t9_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자0세~9세")
    male_f10t14_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자10세~14세")
    male_f15t19_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자15세~19세")
    male_f20t24_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자20세~24세")
    male_f25t29_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자25세~29세")
    male_f30t34_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자30세~34세")
    male_f35t39_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자35세~39세")
    male_f40t44_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자40세~44세")
    male_f45t49_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자45세~49세")
    male_f50t54_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자50세~54세")
    male_f55t59_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자55세~59세")
    male_f60t64_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자60세~64세")
    male_f65t69_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자65세~69세")
    male_f70t74_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="남자70세이상")

    female_f0t9_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자0세~9세")
    female_f10t14_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자10세~14세")
    female_f15t19_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자15세~19세")
    female_f20t24_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자20세~24세")
    female_f25t29_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자25세~29세")
    female_f30t34_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자30세~34세")
    female_f35t39_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자35세~39세")
    female_f40t44_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자40세~44세")
    female_f45t49_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자45세~49세")
    female_f50t54_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자50세~54세")
    female_f55t59_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자55세~59세")
    female_f60t64_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자60세~64세")
    female_f65t69_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자65세~69세")
    female_f70t74_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="여자70세이상")


class PopMaster2024(Base):
    __tablename__ = 'pop_master_2024'
    datetime = Column(DateTime, primary_key=True, comment="기준일시")
    district_name = Column(String(50), primary_key=True, comment="자치구명")
    flwpop_tot = Column(Float, comment="총유동인구")
    flwpop_10s = Column(Float, comment="10대 유동인구")
    flwpop_20s = Column(Float, comment="20대 유동인구")
    flwpop_30s = Column(Float, comment="30대 유동인구")
    flwpop_40s = Column(Float, comment="40대 유동인구")
    flwpop_50s = Column(Float, comment="50대 유동인구")
    flwpop_60up = Column(Float, comment="60대 이상 유동인구")
    lvgpop_tot = Column(Float, comment="총생활인구")
    lvgpop_10s = Column(Float, comment="10대 생활인구")
    lvgpop_20s = Column(Float, comment="20대 생활인구")
    lvgpop_30s = Column(Float, comment="30대 생활인구")
    lvgpop_40s = Column(Float, comment="40대 생활인구")
    lvgpop_50s = Column(Float, comment="50대 생활인구")
    lvgpop_60up = Column(Float, comment="60대 이상 생활인구")


class InfraPark(Base):
    __tablename__ = "infra_park"
    sn: Mapped[int] = mapped_column(Integer, primary_key=True, comment="연번(공원번호)")
    park_nm: Mapped[str | None] = mapped_column(String(255), comment="공원명")
    park_otln: Mapped[str | None] = mapped_column(Text, comment="공원개요")
    area: Mapped[str | None] = mapped_column(Text, comment="면적")
    open_ymd: Mapped[str | None] = mapped_column(String(50), comment="개원일")
    main_fclt: Mapped[str | None] = mapped_column(Text, comment="주요시설")
    main_plnt: Mapped[str | None] = mapped_column(Text, comment="주요식물")
    gd_doc: Mapped[str | None] = mapped_column(Text, comment="안내도")
    vst_road: Mapped[str | None] = mapped_column(Text, comment="오시는길")
    utztn_ref: Mapped[str | None] = mapped_column(Text, comment="이용참고사항")
    img: Mapped[str | None] = mapped_column(Text, comment="이미지")
    rgn: Mapped[str | None] = mapped_column(String(100), comment="지역")
    park_addr: Mapped[str | None] = mapped_column(String(1000), comment="공원주소")
    mng_dept: Mapped[str | None] = mapped_column(String(255), comment="관리부서")
    telno: Mapped[str | None] = mapped_column(String(50), comment="전화번호")
    xcrd_g: Mapped[float | None] = mapped_column(Float, comment="X좌표(GRS80TM)")
    ycrd_g: Mapped[float | None] = mapped_column(Float, comment="Y좌표(GRS80TM)")
    xcrd: Mapped[float | None] = mapped_column(Float, comment="X좌표(WGS84)")
    ycrd: Mapped[float | None] = mapped_column(Float, comment="Y좌표(WGS84)")
    url: Mapped[str | None] = mapped_column(Text, comment="바로가기URL")


class InfraSchool(Base):
    __tablename__ = "infra_school"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    school_name: Mapped[str | None] = mapped_column(String(100), comment="학교명")
    school_level: Mapped[str | None] = mapped_column(String(50), comment="학교급")
    address: Mapped[str | None] = mapped_column(String(255), comment="주소")
    district_name: Mapped[str | None] = mapped_column(String(50), comment="자치구")
    est_type: Mapped[str | None] = mapped_column(String(20), comment="설립구분")
    city_name: Mapped[str | None] = mapped_column(String(20), comment="시도")
    base_year: Mapped[int | None] = mapped_column(Integer, comment="연도")
    zip_code: Mapped[str | None] = mapped_column(String(20), comment="우편번호")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="위도")
    lon: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="경도")


class InfraUniv(Base):
    __tablename__ = 'infra_univ'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    univ_name: Mapped[str] = mapped_column(String(100), comment="대학교명")
    address: Mapped[str | None] = mapped_column(String(255), comment="주소")
    latitude: Mapped[float | None] = mapped_column(Float, comment="위도(Y좌표)")
    longitude: Mapped[float | None] = mapped_column(Float, comment="경도(X좌표)")


class InfraBusiness(Base):
    __tablename__ = "infra_business"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    reg_no: Mapped[str | None] = mapped_column(String(50), comment="등록번호")
    company_name: Mapped[str | None] = mapped_column(String(255), comment="상호")
    representative: Mapped[str | None] = mapped_column(String(100), comment="대표자")
    phone: Mapped[str | None] = mapped_column(String(50), comment="전화번호")
    fax: Mapped[str | None] = mapped_column(String(50), comment="팩스번호")
    address: Mapped[str | None] = mapped_column(Text, comment="주소")
    reg_date: Mapped[str | None] = mapped_column(String(50), comment="등록일자")
    base_date: Mapped[str | None] = mapped_column(String(50), comment="데이터기준일")


class InfraRiver(Base):
    __tablename__ = "infra_river"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    feature_id: Mapped[str] = mapped_column(String(100), nullable=True, comment="하천고유식별자(UFID)")
    river_class: Mapped[str] = mapped_column(String(50), nullable=True, comment="하천분류(SCLS)")
    manage_code: Mapped[str] = mapped_column(String(50), nullable=True, comment="관리코드(FMTA)")
    # 실측 최대 길이가 300만자를 넘어 TEXT(65,535자 한계)로는 부족해 LONGTEXT를 쓴다.
    geom_wkt: Mapped[str] = mapped_column(LONGTEXT, nullable=True, comment="지도공간데이터(WKT)")


class InfraSubway(Base):
    __tablename__ = "infra_subway"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    bldn_id: Mapped[str | None] = mapped_column(String(50), comment="역사_ID")
    bldn_nm: Mapped[str | None] = mapped_column(String(100), comment="역사명")
    route: Mapped[str | None] = mapped_column(String(50), comment="호선")
    lat: Mapped[str | None] = mapped_column(String(50), comment="위도")
    lot: Mapped[str | None] = mapped_column(String(50), comment="경도")


class InfraMaster(Base):
    __tablename__ = 'infra_master'
    station_id: Mapped[str] = mapped_column(
        String(50),
        ForeignKey('station_loc.station_id'),
        primary_key=True
    )
    subway_cnt_300m: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    biz_cnt_300m: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    edu_cnt_500m: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    park_cnt_500m: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    river_cnt_1km: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    dist_subway: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dist_river: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class KoreaHolidays(Base):
    __tablename__ = "korea_holidays"
    holiday_date: Mapped[date] = mapped_column(Date, primary_key=True, comment="공휴일날짜")
    holiday_name: Mapped[str] = mapped_column(String(50), nullable=False, comment="공휴일명칭")


class Account(Base):
    __tablename__ = "account"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    login_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True, comment="로그인 아이디")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False, comment="비밀번호 해시")
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="이름")
    role: Mapped[str] = mapped_column(String(20), nullable=False, comment="admin|driver|user")
    district_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="기사 전용, 1~4 (serving/district.py)")
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, comment="전화번호")
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="이메일")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, comment="탈퇴 시 False (soft delete)")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="가입일시")

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'driver', 'user')", name="ck_account_role"),
    )


# 대여소별 실시간 재고 (우리 앱이 직접 관리하는 가변 재고 - rt_bike_status/station_loc은 참조용, 여기만 mutate)
class StationStock(Base):
    __tablename__ = "station_stock"
    station_id: Mapped[str] = mapped_column(String(50), ForeignKey("station_loc.station_id"), primary_key=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="거치대 수")
    general_bike_cnt: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="일반자전거 보유 수")
    sprout_bike_cnt: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="새싹자전거 보유 수")
    broken_bike_cnt: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="고장자전거 보유 수")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("general_bike_cnt >= 0", name="ck_station_stock_general_bike_cnt_nonneg"),
        CheckConstraint("sprout_bike_cnt >= 0", name="ck_station_stock_sprout_bike_cnt_nonneg"),
        CheckConstraint("broken_bike_cnt >= 0", name="ck_station_stock_broken_bike_cnt_nonneg"),
    )


class Rental(Base):
    __tablename__ = "rental"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("account.id"), nullable=False, index=True)
    bike_id: Mapped[str] = mapped_column(String(50), nullable=False, comment="자전거 식별자(QR 등)")
    bike_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="general|sprout")
    rent_station_id: Mapped[str] = mapped_column(String(50), ForeignKey("station_loc.station_id"), nullable=False)
    return_station_id: Mapped[Optional[str]] = mapped_column(String(50), ForeignKey("station_loc.station_id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="대여중", comment="대여중|완료")
    rent_time: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    return_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    duration_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    carbon_reduction: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class Report(Base):
    __tablename__ = "report"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bike_id: Mapped[str] = mapped_column(String(50), nullable=False)
    station_id: Mapped[str] = mapped_column(String(50), ForeignKey("station_loc.station_id"), nullable=False, index=True)
    reported_by: Mapped[int] = mapped_column(Integer, ForeignKey("account.id"), nullable=False)
    issue: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="수리대기", comment="수리대기|해결완료")
    reported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Dispatch(Base):
    __tablename__ = "dispatch"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_station_id: Mapped[str] = mapped_column(String(50), ForeignKey("station_loc.station_id"), nullable=False)
    to_station_id: Mapped[str] = mapped_column(String(50), ForeignKey("station_loc.station_id"), nullable=False)
    general_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sprout_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    driver_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("account.id"), nullable=True)
    ordered_by: Mapped[int] = mapped_column(Integer, ForeignKey("account.id"), nullable=False)
    ordered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    pickup_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    dropoff_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="대기", comment="대기|진행중|완료")
    is_emergency: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False, default="일반", comment="일반|고장수거")
    report_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("report.id"), nullable=True)

    __table_args__ = (
        CheckConstraint("general_qty >= 0", name="ck_dispatch_general_qty_nonneg"),
        CheckConstraint("sprout_qty >= 0", name="ck_dispatch_sprout_qty_nonneg"),
    )


# 전일 실제 대여량 vs 챔피언 모델 backtest 예측량 (야간 배치 결과 캐시)
class DemandPredictionForecast(Base):
    __tablename__ = "demand_prediction_forecast"
    target_date: Mapped[date] = mapped_column(Date, primary_key=True, comment="예측 대상 일자 (배치 실행 시점의 최신 확정일)")
    hour: Mapped[int] = mapped_column(Integer, primary_key=True, comment="0~23시")
    district_id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="1~4=자치구, 0=서울시 전체 (serving/district.py)")
    actual_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="실제 총 대여량(일반+새싹)")
    predicted_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="표본 대여소 backtest를 실제 대여량 비율로 스케일업한 예측 총 대여량")
    sample_station_cnt: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="backtest에 실제 사용된 표본 대여소 수")
    computed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), comment="배치 계산 시각")


class FavoriteStation(Base):
    __tablename__ = "favorite_station"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("account.id"), nullable=False, index=True)
    station_id: Mapped[str] = mapped_column(String(50), ForeignKey("station_loc.station_id"), nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "station_id", name="uq_favorite_user_station"),)