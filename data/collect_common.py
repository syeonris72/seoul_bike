import time
import requests
import xml.etree.ElementTree as ET
import pandas as pd
import numpy as np
import holidays as kr_holidays_lib
from sqlalchemy import select
from common_utils import init_db, get_session, engine, os, TARGET_DISTRICTS
from models.models import StationLoc, KoreaHolidays

# ==========================================
# 초기 환경 설정
# ==========================================
DISTRICT_GRID = {
    '강서구': (58, 126), '마포구': (59, 127), '송파구': (62, 126), '영등포구': (58, 126)
}


# ==========================================
# 따릉이 대여소 위치 데이터 수집
# ==========================================
def collect_station_loc():
    key = os.getenv('STATION_LOC_KEY')
    base_url = f'http://openapi.seoul.go.kr:8088/{key}/xml/bikeStationMaster'
    rows, start = [], 1

    # API를 통해 대여소 정보 수집 (1000건씩 페이징 처리)
    while True:
        try:
            res = requests.get(f'{base_url}/{start}/{start + 999}/', timeout=10)
            items = ET.fromstring(res.text).findall('row')

            # 더 이상 가져올 데이터가 없으면 반복 종료
            if not items:
                break

            # XML 데이터를 딕셔너리로 변환하여 리스트에 추가
            for row in items:
                rows.append({child.tag: child.text for child in row})

            start += 1000
            time.sleep(0.1)  # 서버 부하를 막기 위한 대기 시간
        except:
            break

    # 수집된 데이터를 데이터프레임으로 변환 및 컬럼명 직관적으로 변경
    df = pd.DataFrame(rows).rename(
        columns={
            'RNTLS_ID': 'station_id',
            'ADDR1': 'address_1',
            'ADDR2': 'address_2',
            'LAT': 'lat',
            'LOT': 'lon'
        }
    )

    # 주소 문자열에서 '구' 단위 정보만 추출하여 새로운 컬럼(district)에 저장
    df['district'] = df['address_1'].apply(
        lambda x: str(x).split()[1] if pd.notnull(x) and len(str(x).split()) > 1 else np.nan
    )
    df['district'] = df['district'].apply(lambda x: str(x) if str(x).endswith('구') else np.nan)

    # 대상 지역(TARGET_DISTRICTS)에 해당하는 데이터만 남기기
    df = df[df['district'].isin(TARGET_DISTRICTS)]

    # 각 지역구에 맞는 격자 좌표(X, Y) 정보 병합
    grid_df = pd.DataFrame.from_dict(DISTRICT_GRID, orient='index', columns=['grid_x', 'grid_y']).reset_index().rename(
        columns={'index': 'district'}
    )
    df = pd.merge(df, grid_df, on='district', how='left')

    # DB에 데이터 적재 (중복 검사 포함)
    with get_session() as db:
        inserted = 0
        for _, row in df.iterrows():
            # DB에 동일한 station_id가 없을 때만 데이터 추가
            if not db.scalar(select(StationLoc).where(StationLoc.station_id == str(row['station_id']))):
                db.add(StationLoc(
                    station_id=str(row['station_id']),
                    address_1=str(row['address_1']),
                    address_2=str(row['address_2']),
                    lat=float(row['lat']),
                    lon=float(row['lon']),
                    district=str(row['district']),
                    grid_x=int(row['grid_x']) if pd.notnull(row['grid_x']) else None,
                    grid_y=int(row['grid_y']) if pd.notnull(row['grid_y']) else None
                ))
                inserted += 1
        db.commit()

    print(f"대여소 위치 데이터: {inserted}건")


# ==========================================
# 한국 공휴일 데이터 수집
# ==========================================
def collect_holidays():
    # 2024년 기준 공휴일 라이브러리 객체 생성
    kr = kr_holidays_lib.KR(years=[2024])

    with get_session() as db:
        inserted, skipped = 0, 0

        # 날짜별로 정렬하여 순회하며 DB 적재
        for d, name in sorted(kr.items()):
            # 이미 등록된 공휴일은 건너뛰기
            if db.scalar(select(KoreaHolidays).where(KoreaHolidays.holiday_date == d)):
                skipped += 1
            else:
                db.add(KoreaHolidays(holiday_date=d, holiday_name=name))
                inserted += 1

        db.commit()
        print(f"대한민국 공휴일 데이터: {inserted}건")


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    init_db(engine, models=[StationLoc, KoreaHolidays])  # DB 초기화
    collect_station_loc()  # 따릉이 대여소 위치 적재
    collect_holidays()  # 공휴일 데이터 적재