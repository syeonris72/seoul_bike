import datetime
from datetime import timedelta
import requests
import xml.etree.ElementTree as ET
from sqlalchemy import text

# ==========================================
# 모듈 임포트 및 초기 환경 설정
# ==========================================
from common_utils import init_db, SessionLocal, fetch_api_json, os, engine, TARGET_DISTRICTS
from models.models import PopFlow2024, PopLiving2024
from database.orm import Base

# 자치구 코드
DISTRICT_CODES = ['11500', '11560', '11440', '11710']


# ==========================================
# 공통 유틸리티 함수
# ==========================================
def safe_float(val):
    """API 문자열 응답값을 실수(float) 형태로 안전하게 변환 (오류 시 0.0 반환)"""
    try:
        return float(val) if val else 0.0
    except:
        return 0.0


# ==========================================
# 유동인구 데이터 수집
# ==========================================
def collect_pop_flow():
    print("\n========== 유동인구 데이터 수집 시작 ==========")
    key = os.getenv("POP_FLOW_2024_KEY")
    base_url = f"http://openapi.seoul.go.kr:8088/{key}/xml/VwsmSignguFlpopW"

    # 전체 데이터 개수(total) 조회
    res = requests.get(f"{base_url}/1/1/").text
    total = int(ET.fromstring(res).findtext("list_total_count", "0"))

    # 기존 데이터 초기화 (Truncate)
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE pop_flow_2024"))
        conn.commit()

    db = SessionLocal()
    try:
        # 1000건씩 페이징 처리하여 수집
        for start in range(1, total + 1, 1000):
            res = requests.get(f"{base_url}/{start}/{min(start + 999, total)}/").text

            # XML 데이터 파싱 및 DB 모델 객체 생성
            for row in ET.fromstring(res).findall("row"):
                gu_name = row.findtext("SIGNGU_CD_NM", "")
                year_code = row.findtext("STDR_YYQU_CD", "")

                # 2024년 데이터 중 타겟 지역구만 필터링
                if year_code.startswith("2024") and gu_name in TARGET_DISTRICTS:
                    db.add(PopFlow2024(
                        stdr_yyqu_cd=year_code,
                        signgu_cd=row.findtext("SIGNGU_CD"),
                        signgu_cd_nm=gu_name,
                        tot_flpop_co=safe_float(row.findtext("TOT_FLPOP_CO")),
                        ml_flpop_co=safe_float(row.findtext("ML_FLPOP_CO")),
                        fml_flpop_co=safe_float(row.findtext("FML_FLPOP_CO")),
                        agrde_10_flpop_co=safe_float(row.findtext("AGRDE_10_FLPOP_CO")),
                        agrde_20_flpop_co=safe_float(row.findtext("AGRDE_20_FLPOP_CO")),
                        agrde_30_flpop_co=safe_float(row.findtext("AGRDE_30_FLPOP_CO")),
                        agrde_40_flpop_co=safe_float(row.findtext("AGRDE_40_FLPOP_CO")),
                        agrde_50_flpop_co=safe_float(row.findtext("AGRDE_50_FLPOP_CO")),
                        agrde_60_above_flpop_co=safe_float(row.findtext("AGRDE_60_ABOVE_FLPOP_CO")),
                        tmzon_00_06_flpop_co=safe_float(row.findtext("TMZON_00_06_FLPOP_CO")),
                        tmzon_06_11_flpop_co=safe_float(row.findtext("TMZON_06_11_FLPOP_CO")),
                        tmzon_11_14_flpop_co=safe_float(row.findtext("TMZON_11_14_FLPOP_CO")),
                        tmzon_14_17_flpop_co=safe_float(row.findtext("TMZON_14_17_FLPOP_CO")),
                        tmzon_17_21_flpop_co=safe_float(row.findtext("TMZON_17_21_FLPOP_CO")),
                        tmzon_21_24_flpop_co=safe_float(row.findtext("TMZON_21_24_FLPOP_CO")),
                        mon_flpop_co=safe_float(row.findtext("MON_FLPOP_CO")),
                        tues_flpop_co=safe_float(row.findtext("TUES_FLPOP_CO")),
                        wed_flpop_co=safe_float(row.findtext("WED_FLPOP_CO")),
                        thur_flpop_co=safe_float(row.findtext("THUR_FLPOP_CO")),
                        fri_flpop_co=safe_float(row.findtext("FRI_FLPOP_CO")),
                        sat_flpop_co=safe_float(row.findtext("SAT_FLPOP_CO")),
                        sun_flpop_co=safe_float(row.findtext("SUN_FLPOP_CO"))
                    ))
            db.commit()
    finally:
        db.close()
        print("========== 유동인구 데이터 수집 종료 ==========")


# ==========================================
# 생활인구 데이터 수집
# ==========================================
def collect_pop_living():
    print("\n========== 생활인구 데이터 수집 시작 ==========")
    key = os.getenv("POP_LIVING_2024_KEY")
    start_date = datetime.date(2024, 1, 1)
    end_date = datetime.date(2024, 12, 31)
    delta = end_date - start_date

    # 2024년 전체 날짜 리스트 생성
    dates = [start_date + timedelta(days=i) for i in range(delta.days + 1)]

    # 기존 데이터 초기화 (Truncate)
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE pop_living_2024"))
        conn.commit()

    db = SessionLocal()
    try:
        # 날짜별로 순회하며 API 통신
        for single_date in dates:
            date_str = single_date.strftime("%Y%m%d")
            base_url = f"http://openapi.seoul.go.kr:8088/{key}/json/SPOP_LOCAL_RESD_JACHI/1/1000/{date_str}"
            data = fetch_api_json(base_url)

            rows = data.get("SPOP_LOCAL_RESD_JACHI", {}).get("row", [])
            for item in rows:
                # 타겟 지역구 코드 필터링
                if item.get("ADSTRD_CODE_SE") in DISTRICT_CODES:
                    db.add(PopLiving2024(
                        stdr_de_id=item["STDR_DE_ID"],
                        tmzon_pd_se=item["TMZON_PD_SE"],
                        adstrd_code_se=item["ADSTRD_CODE_SE"],
                        tot_lvpop_co=safe_float(item.get("TOT_LVPOP_CO")),
                        male_f0t9_lvpop_co=safe_float(item.get("MALE_F0T9_LVPOP_CO")),
                        male_f10t14_lvpop_co=safe_float(item.get("MALE_F10T14_LVPOP_CO")),
                        male_f15t19_lvpop_co=safe_float(item.get("MALE_F15T19_LVPOP_CO")),
                        male_f20t24_lvpop_co=safe_float(item.get("MALE_F20T24_LVPOP_CO")),
                        male_f25t29_lvpop_co=safe_float(item.get("MALE_F25T29_LVPOP_CO")),
                        male_f30t34_lvpop_co=safe_float(item.get("MALE_F30T34_LVPOP_CO")),
                        male_f35t39_lvpop_co=safe_float(item.get("MALE_F35T39_LVPOP_CO")),
                        male_f40t44_lvpop_co=safe_float(item.get("MALE_F40T44_LVPOP_CO")),
                        male_f45t49_lvpop_co=safe_float(item.get("MALE_F45T49_LVPOP_CO")),
                        male_f50t54_lvpop_co=safe_float(item.get("MALE_F50T54_LVPOP_CO")),
                        male_f55t59_lvpop_co=safe_float(item.get("MALE_F55T59_LVPOP_CO")),
                        male_f60t64_lvpop_co=safe_float(item.get("MALE_F60T64_LVPOP_CO")),
                        male_f65t69_lvpop_co=safe_float(item.get("MALE_F65T69_LVPOP_CO")),
                        male_f70t74_lvpop_co=safe_float(item.get("MALE_F70T74_LVPOP_CO")),
                        female_f0t9_lvpop_co=safe_float(item.get("FEMALE_F0T9_LVPOP_CO")),
                        female_f10t14_lvpop_co=safe_float(item.get("FEMALE_F10T14_LVPOP_CO")),
                        female_f15t19_lvpop_co=safe_float(item.get("FEMALE_F15T19_LVPOP_CO")),
                        female_f20t24_lvpop_co=safe_float(item.get("FEMALE_F20T24_LVPOP_CO")),
                        female_f25t29_lvpop_co=safe_float(item.get("FEMALE_F25T29_LVPOP_CO")),
                        female_f30t34_lvpop_co=safe_float(item.get("FEMALE_F30T34_LVPOP_CO")),
                        female_f35t39_lvpop_co=safe_float(item.get("FEMALE_F35T39_LVPOP_CO")),
                        female_f40t44_lvpop_co=safe_float(item.get("FEMALE_F40T44_LVPOP_CO")),
                        female_f45t49_lvpop_co=safe_float(item.get("FEMALE_F45T49_LVPOP_CO")),
                        female_f50t54_lvpop_co=safe_float(item.get("FEMALE_F50T54_LVPOP_CO")),
                        female_f55t59_lvpop_co=safe_float(item.get("FEMALE_F55T59_LVPOP_CO")),
                        female_f60t64_lvpop_co=safe_float(item.get("FEMALE_F60T64_LVPOP_CO")),
                        female_f65t69_lvpop_co=safe_float(item.get("FEMALE_F65T69_LVPOP_CO")),
                        female_f70t74_lvpop_co=safe_float(item.get("FEMALE_F70T74_LVPOP_CO"))
                    ))
            db.commit()
    finally:
        db.close()
        print("========== 생활인구 데이터 수집 종료 ==========")


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    init_db(engine, models=[PopFlow2024, PopLiving2024]) # DB 연결 및 초기화
    collect_pop_flow()  # 유동인구 데이터 적재
    collect_pop_living()  # 생활인구 데이터 적재
    print("\n========== 인구 데이터 수집 종료 ==========")