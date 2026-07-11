import time
import calendar
import pandas as pd
from datetime import datetime, timedelta

# ==========================================
# 모듈 임포트 및 초기 환경 설정
# ==========================================
from common_utils import init_db, get_session, fetch_api_json, os, engine, TARGET_DISTRICTS
from models.models import RentHistory, StationLoc


# ==========================================
# 대여 이력 데이터 수집 및 전처리 파이프라인
# ==========================================
def load_monthly_data(target_month: int):
    print(f"\n========== [{target_month}월] 데이터 수집 및 1시간 단위 요약 적재 시작 ==========")
    db = get_session()
    key = os.getenv("RENT_HISTORY_2024_KEY")

    # 1. 대상 지역(TARGET_DISTRICTS)에 속하는 대여소 ID 목록 추출
    target_stations = db.query(StationLoc.station_id).filter(StationLoc.district.in_(TARGET_DISTRICTS)).all()
    valid_ids = {s[0] for s in target_stations}

    start_date = datetime(2024, target_month, 1)
    end_date = datetime(2024, target_month, calendar.monthrange(2024, target_month)[1])
    current = start_date

    try:
        # 날짜별 반복
        while current <= end_date:
            date_str = current.strftime("%Y-%m-%d")
            daily_raw_data = []

            print(f"[{date_str}] API 데이터 수집 중...")

            for hour in range(24):
                start_idx = 1
                while True:
                    url = f"http://openapi.seoul.go.kr:8088/{key}/json/tbCycleRentData/{start_idx}/{start_idx + 999}/{date_str}/{hour}"
                    data = fetch_api_json(url)

                    if not data or "rentData" not in data:
                        break

                    rows = data["rentData"]["row"]
                    for item in rows:
                        r_station_id = item.get("RENT_STATION_ID")
                        rt_station_id = item.get("RETURN_STATION_ID")
                        r_nm = item.get("RENT_NM", "")
                        rt_nm = item.get("RTN_NM", "")

                        is_target = (
                                (r_station_id in valid_ids) or
                                (rt_station_id in valid_ids) or
                                ("여의" in r_nm) or ("마곡" in r_nm) or
                                ("여의" in rt_nm) or ("마곡" in rt_nm)
                        )

                        if is_target:
                            daily_raw_data.append(item)

                    if len(rows) < 1000:
                        break

                    start_idx += 1000
                    time.sleep(0.05)

            # ==========================================
            # 2. Pandas 1시간 단위 그룹화 및 집계
            # ==========================================
            if daily_raw_data:
                df = pd.DataFrame(daily_raw_data)

                # 날짜 및 숫자 데이터 타입 변환
                df['RENT_DT'] = pd.to_datetime(df['RENT_DT'], errors='coerce')
                df['RTN_DT'] = pd.to_datetime(df['RTN_DT'], errors='coerce')
                df['USE_MIN'] = pd.to_numeric(df['USE_MIN'], errors='coerce').fillna(0)

                # 성별 전처리 (대소문자 통일 및 공백 제거)
                df['SEX_CD'] = df['SEX_CD'].astype(str).str.upper().str.strip()

                # 나이 계산 (2024년 기준)
                df['AGE'] = 2024 - pd.to_numeric(df['BIRTH_YEAR'], errors='coerce')

                # 전체 공통 집계용 임시 칼럼 생성
                df['male'] = (df['SEX_CD'] == 'M').astype(int)
                df['female'] = (df['SEX_CD'] == 'F').astype(int)
                df['gender_unk'] = (~df['SEX_CD'].isin(['M', 'F'])).astype(int)

                df['age_10'] = (df['AGE'] < 20).astype(int)
                df['age_20'] = ((df['AGE'] >= 20) & (df['AGE'] < 30)).astype(int)
                df['age_30'] = ((df['AGE'] >= 30) & (df['AGE'] < 40)).astype(int)
                df['age_40'] = ((df['AGE'] >= 40) & (df['AGE'] < 50)).astype(int)
                df['age_50'] = ((df['AGE'] >= 50) & (df['AGE'] < 60)).astype(int)
                df['age_60'] = (df['AGE'] >= 60).astype(int)
                df['age_unk'] = (df['AGE'].isna()).astype(int)

                # --- [A. 대여 기준 집계] ---
                df_rent = df.dropna(subset=['RENT_DT', 'RENT_STATION_ID']).copy()
                df_rent['datetime_hr'] = df_rent['RENT_DT'].dt.floor('h')
                df_rent = df_rent[
                    df_rent['RENT_STATION_ID'].isin(valid_ids) | df_rent['RENT_NM'].str.contains('여의|마곡', na=False)]

                df_rent['general_rent_cnt'] = (df_rent['BIKE_SE_CD'] == '일반자전거').astype(int)
                df_rent['sprout_rent_cnt'] = (df_rent['BIKE_SE_CD'] == '새싹자전거').astype(int)

                rent_agg = df_rent.groupby(['datetime_hr', 'RENT_STATION_ID']).agg(
                    general_rent_cnt=('general_rent_cnt', 'sum'),
                    sprout_rent_cnt=('sprout_rent_cnt', 'sum'),
                    total_use_min=('USE_MIN', 'sum'),
                    avg_use_min=('USE_MIN', 'mean'),
                    rent_male_cnt=('male', 'sum'),
                    rent_female_cnt=('female', 'sum'),
                    rent_gender_unk_cnt=('gender_unk', 'sum'),
                    rent_age_10_cnt=('age_10', 'sum'),
                    rent_age_20_cnt=('age_20', 'sum'),
                    rent_age_30_cnt=('age_30', 'sum'),
                    rent_age_40_cnt=('age_40', 'sum'),
                    rent_age_50_cnt=('age_50', 'sum'),
                    rent_age_60_cnt=('age_60', 'sum'),
                    rent_age_unk_cnt=('age_unk', 'sum')
                ).reset_index().rename(columns={'RENT_STATION_ID': 'station_id'})

                # --- [B. 반납 기준 집계] ---
                df_rtn = df.dropna(subset=['RTN_DT', 'RETURN_STATION_ID']).copy()
                df_rtn['datetime_hr'] = df_rtn['RTN_DT'].dt.floor('h')
                df_rtn = df_rtn[
                    df_rtn['RETURN_STATION_ID'].isin(valid_ids) | df_rtn['RTN_NM'].str.contains('여의|마곡', na=False)]

                df_rtn['general_rtn_cnt'] = (df_rtn['BIKE_SE_CD'] == '일반자전거').astype(int)
                df_rtn['sprout_rtn_cnt'] = (df_rtn['BIKE_SE_CD'] == '새싹자전거').astype(int)

                rtn_agg = df_rtn.groupby(['datetime_hr', 'RETURN_STATION_ID']).agg(
                    general_rtn_cnt=('general_rtn_cnt', 'sum'),
                    sprout_rtn_cnt=('sprout_rtn_cnt', 'sum'),
                    rtn_male_cnt=('male', 'sum'),
                    rtn_female_cnt=('female', 'sum'),
                    rtn_gender_unk_cnt=('gender_unk', 'sum'),
                    rtn_age_10_cnt=('age_10', 'sum'),
                    rtn_age_20_cnt=('age_20', 'sum'),
                    rtn_age_30_cnt=('age_30', 'sum'),
                    rtn_age_40_cnt=('age_40', 'sum'),
                    rtn_age_50_cnt=('age_50', 'sum'),
                    rtn_age_60_cnt=('age_60', 'sum'),
                    rtn_age_unk_cnt=('age_unk', 'sum')
                ).reset_index().rename(columns={'RETURN_STATION_ID': 'station_id'})

                # --- [C. 대여/반납 데이터 Outer Join 병합] ---
                final_df = pd.merge(rent_agg, rtn_agg, on=['datetime_hr', 'station_id'], how='outer').fillna(0)

                # 결측치(0) 처리 과정에서 float로 바뀐 _cnt 끝나는 카운트 칼럼들과 분(Min) 칼럼을 int로 복구
                int_cols = [col for col in final_df.columns if col.endswith('_cnt') or col == 'total_use_min']
                final_df[int_cols] = final_df[int_cols].astype(int)
                final_df['avg_use_min'] = final_df['avg_use_min'].round(2)

                # ==========================================
                # 3. DB 적재 (to_sql)
                # ==========================================
                try:
                    final_df.to_sql(name='rent_history_2024', con=engine, if_exists='append', index=False)
                    print(f" └─ DB 적재 성공: 1시간 단위 요약 데이터 {len(final_df)}행 추가됨.\n")
                except Exception as e:
                    print(f" └─ DB 적재 중 에러 발생: {e}\n")

            else:
                print(f" └─ 수집된 타겟 데이터가 없습니다.\n")

            current += timedelta(days=1)

    except Exception as e:
        print(f"\n파이프라인 실행 중 시스템 에러 발생: {e}")
    finally:
        db.close()
        print(f"========== [{target_month}월] 데이터 수집 및 요약 적재 프로세스 종료 ==========")


if __name__ == "__main__":
    init_db(engine, models=[RentHistory]) # DB 연결 및 초기화
    load_monthly_data(int(input("\n수집할 월을 입력하세요 (1~12): ")))