import os
import sys
import geopandas as gpd
from sqlalchemy import inspect, text
from sqlalchemy.dialects.mysql import LONGTEXT
import csv
import requests
import pandas as pd
import traceback
from dotenv import load_dotenv

load_dotenv()

# `python -m data.collect_infra`처럼 패키지 경로로 실행하면 이 파일이 있는 data/ 디렉터리가
# sys.path에 자동으로 안 잡혀서 아래 `from common_utils import ...`가 깨진다.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.append(_SCRIPT_DIR)

from common_utils import init_db, get_session, fetch_api_json, os, BASE_DIR, TARGET_DISTRICTS, engine
from models.models import InfraPark, InfraSchool, InfraUniv, InfraBusiness, InfraMaster

RIVER_PATH = os.path.join(BASE_DIR, "seoul_bike/data/infra_river_SHP/seoul_rivers_filtered.shp")
BUSINESS_PATH = os.path.join(BASE_DIR, "seoul_bike/data/infra_business.csv")


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


def save_full_refresh(df, table_name, dtype=None):
    """collect_river/collect_subway처럼 매 실행마다 전체를 최신 스냅샷으로 갈아끼우는
    테이블 저장 헬퍼. to_sql(if_exists='replace')는 매번 테이블을 DROP 후 DataFrame
    컬럼만으로 재생성해서, alembic 마이그레이션으로 잡아둔 id AUTO_INCREMENT PK나
    컬럼 타입/코멘트를 실행할 때마다 지워버린다. 테이블이 이미 있으면(=마이그레이션이
    적용된 정상 상태) TRUNCATE 후 append해서 스키마는 보존하고 데이터만 갈아끼우고,
    테이블이 아예 없는 최초 1회(부트스트랩)에만 replace로 pandas가 새로 만들게 둔다 -
    이후 alembic 마이그레이션이 그 raw 스키마를 정리한다."""
    if inspect(engine).has_table(table_name):
        # TRUNCATE는 MySQL/InnoDB에서 DDL로 취급되어 암묵적 커밋이 발생하므로 트랜잭션으로
        # 묶어도 롤백되지 않는다. to_sql이 실패해도 원복되도록 DELETE를 같은 커넥션/트랜잭션에서
        # 실행해 TRUNCATE+INSERT 전체를 원자적으로 만든다.
        with engine.begin() as conn:
            conn.execute(text(f"DELETE FROM {table_name}"))
            df.to_sql(name=table_name, con=conn, if_exists='append', index=False, dtype=dtype)
    else:
        df.to_sql(name=table_name, con=engine, if_exists='replace', index=False, dtype=dtype)


def collect_park():
    print("========== 공원 데이터 수집 시작 ==========")
    key = os.getenv("INFRA_PARK_KEY")
    data = fetch_api_json(f"http://openAPI.seoul.go.kr:8088/{key}/json/SearchParkInfoService/1/1000")

    if not data:
        return

    with get_session() as db:
        for item in data.get("SearchParkInfoService", {}).get("row", []):
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


def collect_school():
    print("========== 학교 데이터 수집 시작 ==========")
    key = os.getenv('INFRA_SCHOOL_KEY')
    url = 'https://api.odcloud.kr/api/15152021/v1/uddi:416a6bf2-1a0d-4a11-955a-955a221fdf2c'
    page = 1

    with get_session() as db:
        while True:
            data = fetch_api_json(url, {'serviceKey': key, 'page': page, 'perPage': 1000, 'returnType': 'JSON'})

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


def collect_river():
    try:
        if not os.path.exists(RIVER_PATH):
            print(f"[{RIVER_PATH}] 파일이 존재하지 않음")
            return

        print("========== 하천 데이터 수집 시작 ==========")
        seoul_rivers = gpd.read_file(RIVER_PATH, encoding='cp949')

        if seoul_rivers.crs != "EPSG:4326":
            seoul_rivers = seoul_rivers.to_crs("EPSG:4326")

        seoul_rivers['geom_wkt'] = seoul_rivers.geometry.apply(lambda x: x.wkt if x is not None else None)

        # DB 모델(InfraRiver)의 컬럼명과 일치하도록 원본 SHP 필드명을 리네임
        seoul_rivers = seoul_rivers.rename(columns={
            'UFID': 'feature_id',
            'SCLS': 'river_class',
            'FMTA': 'manage_code',
        })

        df_to_save = seoul_rivers.drop(columns=['geometry'])

        for col in df_to_save.columns:
            if df_to_save[col].dtype == 'object':
                df_to_save[col] = df_to_save[col].astype(str)

        # MySQL 저장 (공간 데이터를 담는 geom_wkt는 무조건 LONGTEXT로 지정)
        save_full_refresh(df_to_save, 'infra_river', dtype={'geom_wkt': LONGTEXT})
        print("========== 하천 데이터 수집 종료 ==========")

    except Exception as e:
        print(f"\n하천 데이터 에러 발생: {e}")
        import traceback
        traceback.print_exc()


def collect_subway():
    try:
        print("========== 지하철 데이터 수집 시작 ==========")
        key = os.environ.get("INFRA_SUBWAY_KEY")

        if not key:
            print("에러: .env 파일에서 'INFRA_SUBWAY_KEY'를 찾을 수 없습니다.")
            return

        start_idx = 1
        end_idx = 1000
        all_data = []

        while True:
            url = f"http://openapi.seoul.go.kr:8088/{key}/json/subwayStationMaster/{start_idx}/{end_idx}/"
            response = requests.get(url)
            data = response.json()

            if "subwayStationMaster" in data:
                rows = data["subwayStationMaster"]["row"]
                all_data.extend(rows)

                total_count = data["subwayStationMaster"]["list_total_count"]

                if end_idx >= total_count:
                    break

                start_idx += 1000
                end_idx += 1000
            else:
                print(f"API 응답 에러 또는 데이터 없음: {data}")
                break

        if not all_data:
            print("수집된 데이터가 없습니다.")
            return

        df = pd.DataFrame(all_data)

        # DB 모델(InfraSubway)의 컬럼명과 일치하도록 소문자로 매핑
        df.rename(columns={
            'BLDN_ID': 'bldn_id',
            'BLDN_NM': 'bldn_nm',
            'ROUTE': 'route',
            'LAT': 'lat',
            'LOT': 'lot'
        }, inplace=True)

        df_to_save = df[['bldn_id', 'bldn_nm', 'route', 'lat', 'lot']]

        for col in df_to_save.columns:
            if df_to_save[col].dtype == 'object':
                df_to_save[col] = df_to_save[col].astype(str)

        # MySQL 저장 (실행 시마다 최신 데이터로 갈아끼우되, id PK 등 스키마는 보존)
        save_full_refresh(df_to_save, 'infra_subway')
        print(f"총 {len(df_to_save)}건의 지하철 역 위치 데이터 저장 완료")
        print("========== 지하철 데이터 수집 종료 ==========")

    except Exception as e:
        print(f"\n지하철 데이터 에러 발생: {e}")
        traceback.print_exc()


if __name__ == "__main__":
    init_db(engine, models=[InfraPark, InfraSchool, InfraUniv, InfraBusiness, InfraMaster])
    collect_park()
    collect_school()
    collect_univ()
    collect_business()
    collect_river()
    collect_subway()
    print("========== 인프라 데이터 수집 종료 ==========")