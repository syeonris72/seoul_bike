from datetime import datetime, date
from sqlalchemy import Integer, String, Float, Numeric, DateTime, Date, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from database.orm import Base

# ==========================================
# 자전거 데이터
# ==========================================

# 월별 대여 이력 테이블(2024)
class RentHistory(Base):
    __tablename__ = "rent_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    bike_id: Mapped[str | None] = mapped_column(String(50), index=True, comment="자전거ID")
    rent_dt: Mapped[datetime | None] = mapped_column(DateTime, index=True, comment="대여일시")
    rent_id: Mapped[str | None] = mapped_column(String(50), comment="대여소번호")
    rent_nm: Mapped[str | None] = mapped_column(String(255), comment="대여소명")
    rent_hold: Mapped[str | None] = mapped_column(String(50), comment="대여거치대")
    rtn_dt: Mapped[datetime | None] = mapped_column(DateTime, comment="반납일시")
    rtn_id: Mapped[str | None] = mapped_column(String(50), comment="반납대여소번호")
    rtn_nm: Mapped[str | None] = mapped_column(String(255), comment="반납대여소명")
    rtn_hold: Mapped[str | None] = mapped_column(String(50), comment="반납거치대")
    use_min: Mapped[int | None] = mapped_column(Integer, comment="사용(분)")
    use_dst: Mapped[float | None] = mapped_column(Float, comment="이용거리(M)")
    usr_cls_cd: Mapped[str | None] = mapped_column(String(50), comment="사용자종류")
    sex_cd: Mapped[str | None] = mapped_column(String(10), comment="성별")
    birth_year: Mapped[str | None] = mapped_column(String(4), comment="생년")
    rent_station_id: Mapped[str | None] = mapped_column(String(50), comment="대여대여소ID")
    return_station_id: Mapped[str | None] = mapped_column(String(50), comment="반납대여소ID")
    bike_se_cd: Mapped[str | None] = mapped_column(String(50), comment="자전거구분")


# 대여소 위치 테이블
class StationLoc(Base):
    __tablename__ = "station_loc"
    station_id: Mapped[str] = mapped_column(String(50), primary_key=True, comment="대여소ID")
    address_1: Mapped[str | None] = mapped_column(String(255), comment="주소1")
    address_2: Mapped[str | None] = mapped_column(String(255), comment="주소2")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="위도")
    lon: Mapped[float | None] = mapped_column(Numeric(10, 7), comment="경도")
    district: Mapped[str | None] = mapped_column(String(50), comment="자치구")
    grid_x: Mapped[int | None] = mapped_column(Integer, comment="기상청격자X")
    grid_y: Mapped[int | None] = mapped_column(Integer, comment="기상청격자Y")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), comment="데이터수집일시")


# 실시간 자전거 상태 테이블
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


# ==========================================
# 기상 및 대기 환경 데이터
# ==========================================

# 시간별 미세먼지 테이블(2024)
class HourlyAir(Base):
    __tablename__ = 'hourly_air_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    pm10: Mapped[float | None] = mapped_column(Float, comment="미세먼지(PM10)")
    pm25: Mapped[float | None] = mapped_column(Float, comment="초미세먼지(PM2.5)")


# 실시간 미세먼지 테이블
class RtAir(Base):
    __tablename__ = 'rt_air'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    pm10: Mapped[float | None] = mapped_column(Float, comment="미세먼지(PM10)")
    pm25: Mapped[float | None] = mapped_column(Float, comment="초미세먼지(PM2.5)")


# 일별 기온 테이블(2024)
class HourlyTemp(Base):
    __tablename__ = 'hourly_temp_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    temperature: Mapped[float | None] = mapped_column(Float, comment="기온(℃)")


# 일별 강수량 테이블(2024)
class HourlyPrecip(Base):
    __tablename__ = 'hourly_precip_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    precipitation: Mapped[float | None] = mapped_column(Float, comment="강수량(mm)")


# 일별 적설량 테이블
class HourlySnow(Base):
    __tablename__ = 'hourly_snow_2024'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    snowfall: Mapped[float | None] = mapped_column(Float, comment="적설량(cm)")


# 실시간 날씨 테이블
class RtWeather(Base):
    __tablename__ = 'rt_weather'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    measure_date: Mapped[datetime] = mapped_column(DateTime, comment="측정일시")
    region_name: Mapped[str] = mapped_column(String(50), comment="지역명")
    temperature: Mapped[float | None] = mapped_column(Float, comment="기온(℃)")
    precipitation: Mapped[float | None] = mapped_column(Float, comment="강수량(mm)")
    humidity: Mapped[float | None] = mapped_column(Float, comment="습도(%)")


# ==========================================
# 인구 데이터
# ==========================================

# 유동 인구 테이블
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


# 생활인구 테이블
class PopLiving2024(Base):
    __tablename__ = "pop_living_2024"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    stdr_de_id: Mapped[str] = mapped_column(String(20), comment="기준일ID")
    tmzon_pd_se: Mapped[str] = mapped_column(String(20), comment="시간대구분")
    adstrd_code_se: Mapped[str] = mapped_column(String(20), comment="자치구코드")
    tot_lvpop_co: Mapped[float | None] = mapped_column(Float, comment="총생활인구수")

    # 남성 연령대별 생활인구
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

    # 여성 연령대별 생활인구
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


# ==========================================
# 인프라 데이터
# ==========================================

# 공원 위치 테이블
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


# 초, 중, 고등학교 위치 테이블
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


# 대학교 위치 테이블
class InfraUniv(Base):
    __tablename__ = 'infra_univ'
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    univ_name: Mapped[str] = mapped_column(String(100), comment="대학교명")
    address: Mapped[str | None] = mapped_column(String(255), comment="주소")
    latitude: Mapped[float | None] = mapped_column(Float, comment="위도(Y좌표)")
    longitude: Mapped[float | None] = mapped_column(Float, comment="경도(X좌표)")


# 직장 위치 테이블
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


# 서울하천 데이터
class InfraRiver(Base):
    __tablename__ = "infra_river"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="고유ID")
    feature_id: Mapped[str] = mapped_column(String(100), nullable=True, comment="하천고유식별자(UFID)")
    river_class: Mapped[str] = mapped_column(String(50), nullable=True, comment="하천분류(SCLS)")
    manage_code: Mapped[str] = mapped_column(String(50), nullable=True, comment="관리코드(FMTA)")
    geom_wkt: Mapped[str] = mapped_column(Text, nullable=True, comment="지도공간데이터(WKT)")


# ==========================================
# 날짜 데이터
# ==========================================

# 한국 공휴일 데이터
class KoreaHolidays(Base):
    __tablename__ = "korea_holidays"
    holiday_date: Mapped[date] = mapped_column(Date, primary_key=True, comment="공휴일날짜")
    holiday_name: Mapped[str] = mapped_column(String(50), nullable=False, comment="공휴일명칭")