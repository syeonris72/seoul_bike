import time
from datetime import datetime, timedelta
from urllib.parse import unquote

# `python -m data.collect_rt`처럼 패키지 경로로 실행하면 이 파일이 있는 data/ 디렉터리가
# sys.path에 자동으로 안 잡혀서 아래 `from common_utils import ...`가 깨진다. 직접 실행
# (`python data/collect_rt.py`)과 모듈 실행 둘 다 되도록 이 디렉터리를 미리 등록해 둔다.
import os as _os
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))

from common_utils import init_db, get_session, fetch_api_json, os, TARGET_DISTRICTS, engine
from models.models import RtWeather, RtAir, RtBikeStatus, StationLoc

DISTRICT_GRID = {
    '영등포구': ('58', '126'),
    '마포구': ('59', '127'),
    '송파구': ('62', '126'),
    '강서구': ('58', '126')
}


def _parse_air_korea_datetime(raw: str) -> datetime:
    """AirKorea는 자정 관측치를 다음날 00:00이 아니라 그날 '24:00'으로 표기한다.
    strptime의 %H는 0~23만 허용해서 그대로 파싱하면 ValueError가 나고, 이 함수는
    for 루프 안에서 호출되므로 그 시각 하나 때문에 배치 전체(그 시각의 모든 지역구)가
    커밋되지 못하고 유실된다."""
    date_part, time_part = raw.split(' ')
    if time_part == '24:00':
        return datetime.strptime(date_part, '%Y-%m-%d') + timedelta(days=1)
    return datetime.strptime(raw, '%Y-%m-%d %H:%M')


def collect_rt_weather():
    print("\n========== 실시간 날씨 데이터 수집 시작 ==========")
    key = unquote(os.getenv("ASOS_WEATHER_KEY", ""))
    now = datetime.now()

    # 40분 이전이면 이전 시간 데이터로 기준 변경
    if now.minute < 40:
        now -= timedelta(hours=1)

    with get_session() as db:
        for dist, (nx, ny) in DISTRICT_GRID.items():
            params = {
                'serviceKey': key,
                'pageNo': '1',
                'numOfRows': '100',
                'dataType': 'JSON',
                'base_date': now.strftime('%Y%m%d'),
                'base_time': now.strftime('%H00'),
                'nx': nx,
                'ny': ny
            }
            data = fetch_api_json('http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst', params)

            if not data:
                continue

            items = data.get('response', {}).get('body', {}).get('items', {}).get('item', [])
            weather = {}

            for i in items:
                if i['category'] == 'T1H':
                    weather['temperature'] = float(i['obsrValue'])
                elif i['category'] == 'RN1':
                    weather['precipitation'] = float(i['obsrValue'])
                elif i['category'] == 'REH':
                    weather['humidity'] = float(i['obsrValue'])

            db.add(RtWeather(
                measure_date=now,
                region_name=dist,
                temperature=weather.get('temperature', 0.0),
                precipitation=weather.get('precipitation', 0.0),
                humidity=weather.get('humidity', 0.0)
            ))

        db.commit()
    print("========== 실시간 날씨 데이터 수집 종료 ==========")


def collect_rt_air():
    print("\n========== 실시간 미세먼지 데이터 수집 시작 ==========")
    key = unquote(os.getenv("AIR_KOREA_KEY", ""))
    params = {
        'serviceKey': key,
        'returnType': 'json',
        'numOfRows': '50',
        'pageNo': '1',
        'sidoName': '서울',
        'ver': '1.0'
    }
    data = fetch_api_json('http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty', params)

    if data:
        with get_session() as db:
            for item in data.get('response', {}).get('body', {}).get('items', []):
                name = item['stationName'].strip()

                if name not in TARGET_DISTRICTS:
                    continue

                db.add(RtAir(
                    measure_date=_parse_air_korea_datetime(item['dataTime']),
                    region_name=name,
                    pm10=float(item['pm10Value'] if item['pm10Value'] and item['pm10Value'] != '-' else 0.0),
                    pm25=float(item['pm25Value'] if item['pm25Value'] and item['pm25Value'] != '-' else 0.0)
                ))
            db.commit()
    print("========== 실시간 미세먼지 데이터 수집 종료 ==========")


def collect_rt_bike():
    print("\n========== 실시간 자전거 상태 데이터 수집 시작 ==========")
    key = os.getenv("RT_BIKE_STATUS_KEY", "")
    start, end = 1, 1000

    with get_session() as db:
        valid_ids = {s[0] for s in
                     db.query(StationLoc.station_id).filter(StationLoc.district.in_(TARGET_DISTRICTS)).all()}

        while True:
            data = fetch_api_json(f'http://openapi.seoul.go.kr:8088/{key}/json/bikeList/{start}/{end}/')

            if not data or 'rentBikeStatus' not in data:
                break

            for row in data['rentBikeStatus']['row']:
                if row.get("stationId") in valid_ids:
                    db.add(RtBikeStatus(
                        station_id=row.get("stationId"),
                        rack_tot_cnt=int(row.get("rackTotCnt", 0)),
                        station_name=row.get("stationName"),
                        parked_bike_cnt=int(row.get("parkingBikeTotCnt", 0)),
                        shared_rate=float(row.get("shared", 0)),
                        lat=float(row.get("stationLatitude", 0)),
                        lon=float(row.get("stationLongitude", 0))
                    ))

            start += 1000
            end += 1000
            time.sleep(0.1)  # 서버 부하 방지용 짧은 대기

        db.commit()
    print("========== 실시간 자전거 상태 데이터 수집 종료 ==========")


if __name__ == "__main__":
    init_db(engine, models=[RtWeather, RtAir, RtBikeStatus, StationLoc])
    collect_rt_weather()
    collect_rt_air()
    collect_rt_bike()
    print("\n========== 실시간 데이터 수집 종료 ==========")