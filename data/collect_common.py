import time
import requests
import xml.etree.ElementTree as ET
import pandas as pd
import numpy as np
import holidays as kr_holidays_lib
from sqlalchemy import select

import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from common_utils import init_db, get_session, engine, os, TARGET_DISTRICTS
from models.models import StationLoc, KoreaHolidays, RentHistory2024, DemandPredictionMaster2024

DISTRICT_GRID = {
    '강서구': (58, 126), '마포구': (59, 127), '송파구': (62, 126), '영등포구': (58, 126)
}


def collect_station_loc():
    key = os.getenv('STATION_LOC_KEY')
    base_url = f'http://openapi.seoul.go.kr:8088/{key}/xml/bikeStationMaster'
    rows, start = [], 1

    while True:
        try:
            res = requests.get(f'{base_url}/{start}/{start + 999}/', timeout=10)
            items = ET.fromstring(res.text).findall('row')

            if not items:
                break

            for row in items:
                rows.append({child.tag: child.text for child in row})

            start += 1000
            time.sleep(0.1)  # 서버 부하를 막기 위한 대기 시간
        except:
            break

    df = pd.DataFrame(rows).rename(
        columns={
            'RNTLS_ID': 'station_id',
            'ADDR1': 'address_1',
            'ADDR2': 'address_2',
            'LAT': 'lat',
            'LOT': 'lon'
        }
    )

    df['district'] = df['address_1'].apply(
        lambda x: str(x).split()[1] if pd.notnull(x) and len(str(x).split()) > 1 else np.nan
    )
    df['district'] = df['district'].apply(lambda x: str(x) if str(x).endswith('구') else np.nan)

    df = df[df['district'].isin(TARGET_DISTRICTS)]

    grid_df = pd.DataFrame.from_dict(DISTRICT_GRID, orient='index', columns=['grid_x', 'grid_y']).reset_index().rename(
        columns={'index': 'district'}
    )
    df = pd.merge(df, grid_df, on='district', how='left')

    with get_session() as db:
        inserted = 0
        for _, row in df.iterrows():
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


def collect_holidays():
    kr = kr_holidays_lib.KR(years=[2024])

    with get_session() as db:
        inserted, skipped = 0, 0

        for d, name in sorted(kr.items()):
            if db.scalar(select(KoreaHolidays).where(KoreaHolidays.holiday_date == d)):
                skipped += 1
            else:
                db.add(KoreaHolidays(holiday_date=d, holiday_name=name))
                inserted += 1

        db.commit()
        print(f"대한민국 공휴일 데이터: {inserted}건")


if __name__ == "__main__":
    init_db(engine, models=[StationLoc, KoreaHolidays, RentHistory2024, DemandPredictionMaster2024])
    collect_station_loc()
    collect_holidays()