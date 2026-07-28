import os
import sys
import requests
import calendar
from datetime import datetime
from dotenv import load_dotenv


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# `python -m data.collect_env_2024`처럼 패키지 경로로 실행하면 이 파일이 있는 data/
# 디렉터리가 sys.path에 자동으로 안 잡혀서 아래 `from common_utils import ...`가 깨진다.
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.append(_SCRIPT_DIR)

load_dotenv(os.path.join(BASE_DIR, '.env'), override=True)

from database.db_connection import SessionLocal
from models.models import HourlyTemp2024, HourlyAir2024, HourlySnow2024, HourlyPrecip2024, EnvMaster2024
from common_utils import init_db, engine, os

key = os.getenv("WEATHER_HUB_KEY")
YEAR = 2024
DISTRICT_CODES = {"영등포구": "418", "마포구": "411", "송파구": "403", "강서구": "404"}
TARGET_DISTRICTS = list(DISTRICT_CODES.keys())


def collect_temp():
    db = SessionLocal()
    print("\n\n========== 기온 데이터 수집 시작 ==========")
    url = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php"

    for month in range(1, 13):
        last_day = calendar.monthrange(YEAR, month)[1]
        params = {
            "tm1": f"{YEAR}{month:02d}010000",
            "tm2": f"{YEAR}{month:02d}{last_day:02d}2300",
            "stn": "108",
            "help": "1",
            "authKey": key,
        }

        response = requests.get(url, params=params, timeout=30)
        if response.status_code != 200:
            print(f"[{month}월] API 통신 실패: {response.status_code}")
            continue

        records = []
        tm_idx, stn_idx, ta_idx = 0, 1, -1

        for line in response.text.splitlines():
            line = line.strip()
            if not line:
                continue

            # 주석 라인에서 컬럼 헤더(YYMMDDHHMI, STN, TA 등)의 위치(인덱스) 파악
            if line.startswith("#"):
                if ("YYMMDDHHMI" in line or "TM" in line) and "STN" in line:
                    header_fields = [f.strip() for f in line.replace("#", "").split()]

                    tm_idx = header_fields.index(
                        "YYMMDDHHMI") if "YYMMDDHHMI" in header_fields else header_fields.index("TM")
                    stn_idx = header_fields.index("STN")

                    if "TA" in header_fields:
                        ta_idx = header_fields.index("TA")

                continue

            fields = line.split()
            try:
                date_str, stn_id = fields[tm_idx], fields[stn_idx]

                if ta_idx != -1 and ta_idx < len(fields):
                    ta_val = fields[ta_idx].strip()

                    # 기상청 결측치 처리 (-99, -9 등) 및 빈 값 스킵
                    if ta_val in ("-99", "-99.0", "-9", "-9.0", "-") or not ta_val:
                        continue
                    temp = float(ta_val)
                else:
                    continue

                # 서울(108) 데이터를 타겟 지역구 4곳에 복제
                if stn_id == "108":
                    dt = datetime.strptime(date_str, "%Y%m%d%H%M")
                    for district in TARGET_DISTRICTS:
                        records.append(HourlyTemp2024(measure_date=dt, region_name=district, temperature=temp))
            except (ValueError, IndexError):
                continue

        if records:
            try:
                db.bulk_save_objects(records)
                db.commit()
                print(f"[{month}월] 기온 데이터: {len(records)}건 적재 완료")
            except Exception as e:
                db.rollback()
                print(f"[{month}월] 기온 데이터 에러 발생: {e}")

    db.close()


def collect_precip():
    db = SessionLocal()
    print("\n\n========== 강수량 데이터 수집 시작 ==========")
    url = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php"

    for month in range(1, 13):
        last_day = calendar.monthrange(YEAR, month)[1]
        params = {
            "tm1": f"{YEAR}{month:02d}010000",
            "tm2": f"{YEAR}{month:02d}{last_day:02d}2300",
            "stn": "108",
            "help": "1",
            "authKey": key,
        }

        response = requests.get(url, params=params)
        if response.status_code != 200:
            print(f"[{month}월] API 통신 실패: {response.status_code}")
            continue

        records = []
        tm_idx, stn_idx, rn_idx = 0, 1, -1

        for line in response.text.splitlines():
            line = line.strip()
            if not line:
                continue

            # 주석 라인에서 컬럼 헤더(YYMMDDHHMI, STN 등)의 위치(인덱스) 파악
            if line.startswith("#"):
                if ("YYMMDDHHMI" in line or "TM" in line) and "STN" in line:
                    header_fields = [f.strip() for f in line.replace("#", "").split()]

                    tm_idx = header_fields.index(
                        "YYMMDDHHMI") if "YYMMDDHHMI" in header_fields else header_fields.index("TM")
                    stn_idx = header_fields.index("STN")

                    rn_column = next((col for col in ["RN"] if col in header_fields),
                                     None)
                    if rn_column:
                        rn_idx = header_fields.index(rn_column)

                continue

            fields = line.split()
            try:
                date_str, stn_id = fields[tm_idx], fields[stn_idx]

                if rn_idx != -1 and rn_idx < len(fields):
                    precip_val = fields[rn_idx].strip()
                    precipitation = float(precip_val) if (precip_val != "-" and precip_val and float(precip_val) >= 0) else 0.0
                else:
                    precipitation = 0.0

                # 서울(108) 데이터를 타겟 지역구 4곳에 복제
                if stn_id == "108":
                    dt = datetime.strptime(date_str, "%Y%m%d%H%M")
                    for district in TARGET_DISTRICTS:
                        records.append(HourlyPrecip2024(measure_date=dt, region_name=district, precipitation=precipitation))
            except (ValueError, IndexError):
                continue

        if records:
            try:
                db.bulk_save_objects(records)
                db.commit()
                print(f"[{month}월] 강수량 데이터: {len(records)}건")
            except Exception as e:
                db.rollback()
                print(f"[{month}월] 강수량 데이터 에러 발생: {e}")

    db.close()


def collect_air():
    db = SessionLocal()
    print("\n========== 미세먼지 데이터 수집 시작 ==========")
    url = "https://apihub.kma.go.kr/api/typ01/url/kma_pm10.php"

    for month in range(1, 13):
        last_day = calendar.monthrange(YEAR, month)[1]
        params = {
            "tm1": f"{YEAR}{month:02d}010000",
            "tm2": f"{YEAR}{month:02d}{last_day:02d}2300",
            "stn": "0",
            "authKey": key
        }

        response = requests.get(url, params=params)
        if response.status_code != 200:
            print(f"[{month}월] API 통신 실패: {response.status_code}")
            continue

        records = []
        for line in response.text.splitlines():
            line = line.strip()

            if not line or line.startswith('#'):
                continue

            fields = line.split(',')

            if len(fields) < 3:
                continue

            try:
                date_str, stn_id, pm10_val = fields[0].strip(), fields[1].strip(), fields[2].strip()

                if not pm10_val or pm10_val in ("-99", "-99.0"):
                    pm10 = None
                else:
                    pm10 = float(pm10_val) if float(pm10_val) >= 0 else None

                # 서울(108) 관측소 데이터를 타겟 지역구 4곳에 동일하게 복제하여 적용
                if stn_id == "108":
                    dt = datetime.strptime(date_str, "%Y%m%d%H%M")
                    for district in TARGET_DISTRICTS:
                        records.append(HourlyAir2024(measure_date=dt, region_name=district, pm10=pm10, pm25=None))
            except (ValueError, IndexError):
                continue

        if records:
            try:
                db.bulk_save_objects(records)
                db.commit()
                print(f"[{month}월] 미세먼지 데이터: {len(records)}건")
            except Exception as e:
                db.rollback()
                print(f"[{month}월] 미세먼지 데이터 에러 발생: {e}")

    db.close()


def collect_snow():
    db = SessionLocal()
    print("\n\n========== 적설량 데이터 수집 시작 ==========")
    url = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php"

    for month in range(1, 13):
        last_day = calendar.monthrange(YEAR, month)[1]
        params = {
            "tm1": f"{YEAR}{month:02d}010000",
            "tm2": f"{YEAR}{month:02d}{last_day:02d}2300",
            "stn": "108",
            "help": "1",
            "authKey": key,
        }

        response = requests.get(url, params=params)
        if response.status_code != 200:
            print(f"[{month}월] API 통신 실패: {response.status_code}")
            continue

        records = []
        tm_idx, stn_idx, sd_idx = 0, 1, -1

        for line in response.text.splitlines():
            line = line.strip()
            if not line:
                continue

            # 주석 라인에서 컬럼 헤더(YYMMDDHHMI, STN 등)의 위치(인덱스) 파악
            if line.startswith("#"):
                if ("YYMMDDHHMI" in line or "TM" in line) and "STN" in line:
                    header_fields = [f.strip() for f in line.replace("#", "").split()]

                    tm_idx = header_fields.index(
                        "YYMMDDHHMI") if "YYMMDDHHMI" in header_fields else header_fields.index("TM")
                    stn_idx = header_fields.index("STN")

                    sd_column = next((col for col in ["SD_TOT", "SD_DAY", "SD", "SD_HR3"] if col in header_fields),
                                     None)
                    if sd_column:
                        sd_idx = header_fields.index(sd_column)

                continue

            fields = line.split()
            try:
                date_str, stn_id = fields[tm_idx], fields[stn_idx]

                if sd_idx != -1 and sd_idx < len(fields):
                    snow_val = fields[sd_idx].strip()
                    snowfall = float(snow_val) if (snow_val != "-" and snow_val and float(snow_val) >= 0) else 0.0
                else:
                    snowfall = 0.0

                # 서울(108) 데이터를 타겟 지역구 4곳에 복제
                if stn_id == "108":
                    dt = datetime.strptime(date_str, "%Y%m%d%H%M")
                    for district in TARGET_DISTRICTS:
                        records.append(HourlySnow2024(measure_date=dt, region_name=district, snowfall=snowfall))
            except (ValueError, IndexError):
                continue

        if records:
            try:
                db.bulk_save_objects(records)
                db.commit()
                print(f"[{month}월] 적설량 데이터: {len(records)}건")
            except Exception as e:
                db.rollback()
                print(f"[{month}월] 적설량 데이터 에러 발생: {e}")

    db.close()


if __name__ == "__main__":
    init_db(engine, models=[HourlyTemp2024, HourlyAir2024, HourlySnow2024, HourlyPrecip2024, EnvMaster2024])
    collect_temp()
    collect_precip()
    collect_air()
    collect_snow()
    print("\n========== 환경 데이터 수집 종료 ==========")