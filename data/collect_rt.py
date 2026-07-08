import time
from datetime import datetime, timedelta
from urllib.parse import unquote

# ==========================================
# 모듈 임포트 및 초기 환경 설정
# ==========================================
from common_utils import init_db, get_session, fetch_api_json, os, TARGET_DISTRICTS
from models.models import RtWeather, RtAir, RtBikeStatus, StationLoc

# ==========================================
# 초기 환경 설정
# ==========================================
DISTRICT_GRID = {
    '영등포구': ('58', '126'),
    '마포구': ('59', '127'),
    '송파구': ('62', '126'),
    '강서구': ('58', '126')
}


# ==========================================
# 실시간 날씨 데이터 수집
# ==========================================
def collect_rt_weather():
    print("\n========== 실시간 날씨 데이터 수집 시작 ==========")
    key = unquote(os.getenv("ASOS_WEATHER_KEY", ""))
    now = datetime.now()

    # 40분 이전이면 이전 시간 데이터로 기준 변경
    if now.minute < 40:
        now -= timedelta(hours=1)

    with get_session() as db:
        for dist, (nx, ny) in RT_WEATHER_GRIDS.items():
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


# ==========================================
# 실시간 미세먼지 데이터 수집
# ==========================================
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

                # 타겟 지역구만 필터링
                if name not in TARGET_DISTRICTS:
                    continue

                db.add(RtAir(
                    measure_date=datetime.strptime(item['dataTime'], '%Y-%m-%d %H:%M'),
                    region_name=name,
                    pm10=float(item['pm10Value'] if item['pm10Value'] and item['pm10Value'] != '-' else 0.0),
                    pm25=float(item['pm25Value'] if item['pm25Value'] and item['pm25Value'] != '-' else 0.0)
                ))
            db.commit()
    print("========== 실시간 미세먼지 데이터 수집 종료 ==========")


# ==========================================
# 실시간 자전거 상태 데이터 수집
# ==========================================
def collect_rt_bike():
    print("\n========== 실시간 자전거 상태 데이터 수집 시작 ==========")
    key = os.getenv("RT_BIKE_STATUS_KEY", "")
    start, end = 1, 1000

    with get_session() as db:
        # 타겟 지역구 내 대여소 ID 목록 추출
        valid_ids = {s[0] for s in
                     db.query(StationLoc.station_id).filter(StationLoc.district.in_(TARGET_DISTRICTS)).all()}

        while True:
            # API 1000건 단위 페이징 호출
            data = fetch_api_json(f'http://openapi.seoul.go.kr:8088/{key}/json/bikeList/{start}/{end}/')

            # 더 이상 데이터가 없으면 반복 종료
            if not data or 'rentBikeStatus' not in data:
                break

            for row in data['rentBikeStatus']['row']:
                # 추출한 타겟 대여소 ID에 포함되는 경우에만 적재
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


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    init_db()  # DB 연결 및 초기화
    collect_rt_weather()  # 실시간 날씨 데이터 적재
    collect_rt_air()  # 실시간 미세먼지 데이터 적재
    collect_rt_bike()  # 실시간 자전거 상태 데이터 적재
    print("\n========== 실시간 데이터 수집 종료 ==========")