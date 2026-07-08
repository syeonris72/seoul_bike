import os
import sys
import requests
import io
import calendar
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# ==========================================
# 모듈 임포트 및 초기 환경 설정
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

load_dotenv(os.path.join(BASE_DIR, '.env'), override=True)

from database.db_connection import SessionLocal
from models.models import HourlyTemp, HourlyAir, HourlySnow, HourlyPrecip
from common_utils import init_db

# API 키 및 자치구 설정
key = os.getenv("WEATHER_HUB_KEY")
YEAR = 2024
DISTRICT_CODES = {"영등포구": "418", "마포구": "411", "송파구": "403", "강서구": "404"}
TARGET_DISTRICTS = list(DISTRICT_CODES.keys())


# ==========================================
# 기온 데이터 수집
# ==========================================
def collect_temp():
    db = SessionLocal()
    print("\n========== 기온 데이터 수집 시작 ==========")

    # 각 자치구별로 1월부터 12월까지 순회하며 데이터 수집
    for dist, stn_id in DISTRICT_CODES.items():
        print(f"========== [{dist}] 기온 데이터 수집 시작 ==========")
        for month in range(1, 13):
            # 해당 월의 마지막 일자 계산
            days = calendar.monthrange(YEAR, month)[1]
            tm1, tm2 = f"{YEAR}{month:02d}01", f"{YEAR}{month:02d}{days}"

            # 기상청 기온 API URL 생성
            url = f"https://apihub.kma.go.kr/api/typ01/url/sts_ta.php?tm1={tm1}&tm2={tm2}&stn_id={stn_id}&help=1&disp=1&authKey={key}"

            try:
                # API 호출 및 응답 데이터를 데이터프레임으로 변환
                res = requests.get(url, timeout=30)
                df = pd.read_csv(io.StringIO(res.text), comment='#', sep=r'\s+', header=None)

                # 행 단위로 순회하며 DB 모델 객체 생성
                for _, row in df.iterrows():
                    try:
                        tm_val = str(int(row.iloc[0]))
                        dt = datetime.strptime(tm_val, '%Y%m%d')
                        temp = float(row.iloc[5])
                        db.add(HourlyTemp(measure_date=dt, region_name=dist, temperature=temp))
                    except:
                        continue

                # 월별 데이터 적재 후 커밋
                db.commit()
            except Exception as e:
                print(f"========== [{dist}/{month}월] 기온 데이터 에러 발생: {e} ==========")

        print(f"========== [{dist}] 기온 데이터 적재 완료 ==========")

    db.close()


# ==========================================
# 강수량 데이터 수집
# ==========================================
def collect_precip():
    db = SessionLocal()
    print("\n========== 강수량 데이터 수집 시작 ==========")

    for dist, stn_id in DISTRICT_CODES.items():
        print(f"========== [{dist}] 강수량 데이터 수집 시작 ==========")
        for month in range(1, 13):
            days = calendar.monthrange(YEAR, month)[1]
            tm1, tm2 = f"{YEAR}{month:02d}01", f"{YEAR}{month:02d}{days}"

            # 기상청 강수량 API URL 생성
            url = f"https://apihub.kma.go.kr/api/typ01/url/sts_rn.php?tm1={tm1}&tm2={tm2}&stn_id={stn_id}&help=1&disp=1&authKey={key}"

            try:
                # API 호출 및 데이터 파싱
                res = requests.get(url, timeout=30)
                df = pd.read_csv(io.StringIO(res.text), comment='#', sep=r'\s+', header=None)

                # 빈 데이터프레임인 경우 건너뛰기
                if df is None or df.empty:
                    continue

                # DB 모델 객체 생성 및 무강수 예외 처리
                for _, row in df.iterrows():
                    try:
                        tm_val = str(int(row.iloc[0]))
                        dt = datetime.strptime(tm_val, '%Y%m%d')
                        rn_val = float(row.iloc[5])

                        # 음수 값은 무강수(0.0)로 처리
                        if rn_val < 0:
                            rn_val = 0.0

                        db.add(HourlyPrecip(measure_date=dt, region_name=dist, precipitation=rn_val))
                    except:
                        continue

                db.commit()
            except Exception as e:
                print(f"[{dist}/{month}월] 강수량 데이터 에러 발생: {e}")

        print(f"========== [{dist}] 강수량 데이터 적재 완료 ==========")

    db.close()


# ==========================================
# 미세먼지 데이터 수집
# ==========================================
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

        # API 호출
        response = requests.get(url, params=params)
        if response.status_code != 200:
            print(f"[{month}월] API 통신 실패: {response.status_code}")
            continue

        records = []
        # 텍스트 형태의 응답을 라인 단위로 읽어서 처리
        for line in response.text.splitlines():
            line = line.strip()

            # 빈 줄이거나 주석(#)인 경우 건너뛰기
            if not line or line.startswith('#'):
                continue

            fields = line.split(',')

            # 필드 개수가 부족한 불완전 데이터 건너뛰기
            if len(fields) < 3:
                continue

            try:
                date_str, stn_id, pm10_val = fields[0].strip(), fields[1].strip(), fields[2].strip()

                # 결측치 처리 (-99 등)
                if not pm10_val or pm10_val in ("-99", "-99.0"):
                    pm10 = None
                else:
                    pm10 = float(pm10_val) if float(pm10_val) >= 0 else None

                # 서울(108) 관측소 데이터를 타겟 지역구 4곳에 동일하게 복제하여 적용
                if stn_id == "108":
                    dt = datetime.strptime(date_str, "%Y%m%d%H%M")
                    for district in TARGET_DISTRICTS:
                        records.append(HourlyAir(measure_date=dt, region_name=district, pm10=pm10, pm25=None))
            except (ValueError, IndexError):
                continue

        # 일괄 저장 (Bulk Save) 적용
        if records:
            try:
                db.bulk_save_objects(records)
                db.commit()
                print(f"[{month}월] 미세먼지 데이터: {len(records)}건")
            except Exception as e:
                db.rollback()
                print(f"[{month}월] 미세먼지 데이터 에러 발생: {e}")

    db.close()


# ==========================================
# 적설량 데이터 수집
# ==========================================
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

        # API 호출
        response = requests.get(url, params=params)
        if response.status_code != 200:
            print(f"[{month}월] API 통신 실패: {response.status_code}")
            continue

        records = []
        tm_idx, stn_idx, sd_idx = 0, 1, -1

        # 텍스트 데이터 파싱 및 헤더 인덱스 동적 추출
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

                    # 적설량 관련 컬럼명 찾기
                    sd_column = next((col for col in ["SD_TOT", "SD_DAY", "SD", "SD_HR3"] if col in header_fields),
                                     None)
                    if sd_column:
                        sd_idx = header_fields.index(sd_column)

                continue

            # 실제 데이터 추출 및 변환
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
                        records.append(HourlySnow(measure_date=dt, region_name=district, snowfall=snowfall))
            except (ValueError, IndexError):
                continue

        # 일괄 저장 (Bulk Save) 적용
        if records:
            try:
                db.bulk_save_objects(records)
                db.commit()
                print(f"[{month}월] 적설량 데이터: {len(records)}건")
            except Exception as e:
                db.rollback()
                print(f"[{month}월] 적설량 데이터 에러 발생: {e}")

    db.close()


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    init_db() # DB 연결 및 초기화
    collect_temp() # 기온 데이터 적재
    collect_precip() # 강수량 데이터 적재
    collect_air() # 미세먼지 데이터 적재
    collect_snow() # 적설량 데이터 적재
    print("\n========== 환경 데이터 수집 종료 ==========")