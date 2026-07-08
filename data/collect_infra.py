import os
import sys
import geopandas as gpd
from sqlalchemy.dialects.mysql import LONGTEXT
import csv

# ==========================================
# 모듈 임포트 및 초기 환경 설정
# ==========================================
from common_utils import init_db, get_session, fetch_api_json, os, BASE_DIR, TARGET_DISTRICTS
from models.models import InfraPark, InfraSchool, InfraUniv, InfraBusiness

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(BASE_DIR)

from database.db_connection import engine

# ==========================================
# 데이터 파일 경로 설정
# ==========================================
RIVER_PATH = os.path.join(BASE_DIR, "seoul_bike/data/infra_river_SHP/seoul_rivers_filtered.shp")
BUSINESS_PATH = os.path.join(BASE_DIR, "seoul_bike/data/infra_business.csv")


# ==========================================
# 공통 유틸리티 함수
# ==========================================
def check_target(text):
    """주소나 지역명에 수집 대상 구역(타겟 지구, 여의, 마곡)이 포함되어 있는지 확인"""
    if not text:
        return False
    return any(dist in text for dist in TARGET_DISTRICTS) or ("여의" in text) or ("마곡" in text)


def float_val(val):
    """API 문자열 응답값을 실수(float) 형태로 안전하게 변환 (오류 시 None 반환)"""
    try:
        return float(val) if val else None
    except:
        return None


# ==========================================
# 공원 데이터 수집
# ==========================================
def collect_park():
    print("========== 공원 데이터 수집 시작 ==========")
    key = os.getenv("INFRA_PARK_KEY")
    data = fetch_api_json(f"http://openAPI.seoul.go.kr:8088/{key}/json/SearchParkInfoService/1/1000")

    if not data:
        return

    with get_session() as db:
        for item in data.get("SearchParkInfoService", {}).get("row", []):
            # 대상 지역에 포함되는 공원만 적재
            if check_target(item.get("PARK_ADDR")) or check_target(item.get("RGN")):
                db.merge(InfraPark(
                    sn=int(item["SN"]),
                    park_nm=item.get("PARK_NM"),
                    park_otln=item.get("PARK_OTLN"),
                    area=item.get("AREA"),
                    open_ymd=item.get("OPEN_YMD"),
                    main_fclt=item.get("MAIN_FCLT"),
                    main_plnt=item.get("MAIN_PLNT"),
                    gd_doc=item.get("GD_DOC"),
                    vst_road=item.get("VST_ROAD"),
                    utztn_ref=item.get("UTZTN_REF"),
                    img=item.get("IMG"),
                    rgn=item.get("RGN"),
                    park_addr=item.get("PARK_ADDR"),
                    mng_dept=item.get("MNG_DEPT"),
                    telno=item.get("TELNO"),
                    xcrd_g=float_val(item.get("XCRD_G")),
                    ycrd_g=float_val(item.get("YCRD_G")),
                    xcrd=float_val(item.get("XCRD")),
                    ycrd=float_val(item.get("YCRD")),
                    url=item.get("URL")
                ))
        db.commit()


# ==========================================
# 학교 데이터 수집
# ==========================================
def collect_school():
    print("========== 학교 데이터 수집 시작 ==========")
    key = os.getenv('INFRA_SCHOOL_KEY')
    url = 'https://api.odcloud.kr/api/15152021/v1/uddi:416a6bf2-1a0d-4a11-955a-955a221fdf2c'
    page = 1

    with get_session() as db:
        while True:
            data = fetch_api_json(url, {'serviceKey': key, 'page': page, 'perPage': 1000, 'returnType': 'JSON'})

            # 더 이상 가져올 데이터가 없으면 종료
            if not data or not data.get('data'):
                break

            for row in data['data']:
                if check_target(row.get('자치구')) or check_target(row.get('주소')):
                    db.add(InfraSchool(
                        school_name=row.get('학교'),
                        school_level=row.get('학교급'),
                        address=row.get('주소'),
                        district_name=row.get('자치구'),
                        est_type=row.get('설립구분'),
                        city_name=row.get('시도'),
                        base_year=int(row.get('연도')) if row.get('연도') else None,
                        zip_code=str(row.get('우편번호', '')),
                        lat=float_val(row.get('위도')),
                        lon=float_val(row.get('경도'))
                    ))
            page += 1
        db.commit()


# ==========================================
# 대학교 데이터 수집
# ==========================================
def collect_univ():
    print("========== 대학교 데이터 수집 시작 ==========")
    key = os.getenv('INFRA_UNIV_KEY')
    data = fetch_api_json(f"http://openapi.seoul.go.kr:8088/{key}/json/SebcCollegeInfoKor/1/100/")

    if not data:
        return

    with get_session() as db:
        for item in data.get('SebcCollegeInfoKor', {}).get('row', []):
            if check_target(item.get('ADD_KOR')):
                db.add(InfraUniv(
                    univ_name=item.get('NAME_KOR', '').strip(),
                    address=item.get('ADD_KOR', ''),
                    latitude=float_val(item.get('LAT')),
                    longitude=float_val(item.get('LNG'))
                ))
        db.commit()


# ==========================================
# 직장 데이터 수집
# ==========================================
def collect_business():
    print("========== 직장 데이터 수집 시작 ==========")
    if not os.path.exists(BUSINESS_PATH):
        print(f"[{BUSINESS_PATH}] 파일이 존재하지 않음")
        return

    with get_session() as db:
        with open(BUSINESS_PATH, mode="r", encoding="utf-8-sig") as file:
            businesses_to_insert = []

            for row in csv.DictReader(file):
                if check_target(row.get("주소")):
                    businesses_to_insert.append(InfraBusiness(
                        reg_no=row.get("등록번호"),
                        company_name=row.get("상호"),
                        representative=row.get("대표자"),
                        phone=row.get("전화번호"),
                        fax=row.get("팩스번호"),
                        address=row.get("주소"),
                        reg_date=row.get("등록일자"),
                        base_date=row.get("데이터기준일")
                    ))

            db.add_all(businesses_to_insert)
        db.commit()
    print(f"직장 데이터: {len(businesses_to_insert)}건")


# ==========================================
# 하천 데이터(SHP)
# ==========================================
def collect_river():
    try:
        if not os.path.exists(RIVER_PATH):
            print(f"[{RIVER_PATH}] 파일이 존재하지 않음")
            return

        print("========== 하천 데이터 수집 시작 ==========")
        seoul_rivers = gpd.read_file(RIVER_PATH, encoding='cp949')

        # 좌표계 확인 및 통일 (EPSG:4326)
        if seoul_rivers.crs != "EPSG:4326":
            seoul_rivers = seoul_rivers.to_crs("EPSG:4326")

        # Geometry 객체를 텍스트(WKT)로 변환하여 문자열로 저장할 수 있게 함
        seoul_rivers['geom_wkt'] = seoul_rivers.geometry.apply(lambda x: x.wkt if x is not None else None)

        # 원본 geometry 컬럼 삭제 (데이터베이스 호환성을 위해)
        df_to_save = seoul_rivers.drop(columns=['geometry'])

        # 데이터 저장 오류 방지를 위해 텍스트(object)를 확실한 문자열(str)로 변환
        for col in df_to_save.columns:
            if df_to_save[col].dtype == 'object':
                df_to_save[col] = df_to_save[col].astype(str)

        # MySQL 저장 (공간 데이터를 담는 geom_wkt는 무조건 LONGTEXT로 지정)
        df_to_save.to_sql(
            name='infra_river',
            con=engine,
            if_exists='replace',
            index=False,
            dtype={'geom_wkt': LONGTEXT}
        )
        print("========== 하천 데이터 수집 종료 ==========")

    except Exception as e:
        print(f"\n하천 데이터 에러 발생: {e}")
        import traceback
        traceback.print_exc()


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    init_db()  # DB 연결 및 초기화
    collect_park()  # 공원 데이터 적재
    collect_school()  # 학교 데이터 적재
    collect_univ()  # 대학교 데이터 적재
    collect_business()  # 직장 데이터 적재
    collect_river()  # 하천 SHP 데이터 적재
    print("========== 인프라 데이터 수집 종료 ==========")