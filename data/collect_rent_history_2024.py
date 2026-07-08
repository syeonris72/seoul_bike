import time
import calendar
from datetime import datetime, timedelta

# ==========================================
# 모듈 임포트 및 초기 환경 설정
# ==========================================
from common_utils import init_db, get_session, fetch_api_json, os, engine, TARGET_DISTRICTS
from models.models import RentHistory, StationLoc


# ==========================================
# 공통 유틸리티 함수
# ==========================================
def parse_date(d_str):
    """문자열 날짜를 datetime 객체로 파싱 (오류 시 None 반환)"""
    if d_str and d_str.strip():
        try:
            return datetime.strptime(d_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
    return None


# ==========================================
# 대여 이력 데이터 수집
# ==========================================
def load_monthly_data(target_month: int):
    print(f"\n========== [{target_month}월] 대여 이력 데이터 수집 시작 ==========")
    db = get_session()
    key = os.getenv("RENT_HISTORY_2024_KEY")

    # 대상 지역(TARGET_DISTRICTS)에 속하는 대여소 ID 목록 추출
    target_stations = db.query(StationLoc.station_id).filter(StationLoc.district.in_(TARGET_DISTRICTS)).all()
    valid_ids = {s[0] for s in target_stations}

    # 해당 월의 시작일과 종료일 계산
    start_date = datetime(2024, target_month, 1)
    end_date = datetime(2024, target_month, calendar.monthrange(2024, target_month)[1])
    current, total = start_date, 0

    try:
        # 날짜별 반복
        while current <= end_date:
            date_str = current.strftime("%Y-%m-%d")

            # 시간대(0~23시)별 반복
            for hour in range(24):
                start_idx, bulk = 1, []

                # API 페이징 반복 (1000건 단위)
                while True:
                    url = f"http://openapi.seoul.go.kr:8088/{key}/json/tbCycleRentData/{start_idx}/{start_idx + 999}/{date_str}/{hour}"
                    data = fetch_api_json(url)

                    # 더 이상 데이터가 없으면 종료
                    if not data or "rentData" not in data:
                        break

                    rows = data["rentData"]["row"]

                    for item in rows:
                        r_id, r_nm = item.get("RENT_ID"), item.get("RENT_NM", "")
                        rt_id, rt_nm = item.get("RTN_ID"), item.get("RTN_NM", "")

                        # 타겟 대여소 또는 특정 지역(여의, 마곡) 포함 여부 확인
                        is_target = (
                                (r_id in valid_ids) or
                                (rt_id in valid_ids) or
                                ("여의" in r_nm) or
                                ("여의" in rt_nm) or
                                ("마곡" in r_nm) or
                                ("마곡" in rt_nm)
                        )

                        # 타겟이 아니면 패스
                        if not is_target:
                            continue

                        # DB 모델 객체 생성
                        bulk.append(RentHistory(
                            bike_id=item.get("BIKE_ID"),
                            rent_dt=parse_date(item.get("RENT_DT")),
                            rent_id=r_id,
                            rent_nm=r_nm,
                            rent_hold=item.get("RENT_HOLD"),
                            rtn_dt=parse_date(item.get("RTN_DT")),
                            rtn_id=rt_id,
                            rtn_nm=rt_nm,
                            rtn_hold=item.get("RTN_HOLD"),
                            use_min=int(item.get("USE_MIN") or 0),
                            use_dst=float(item.get("USE_DST") or 0.0),
                            usr_cls_cd=item.get("USR_CLS_CD"),
                            sex_cd=item.get("SEX_CD"),
                            birth_year=item.get("BIRTH_YEAR"),
                            rent_station_id=item.get("RENT_STATION_ID"),
                            return_station_id=item.get("RETURN_STATION_ID"),
                            bike_se_cd=item.get("BIKE_SE_CD")
                        ))

                    # 1000건 미만이면 해당 시간대의 마지막 페이지
                    if len(rows) < 1000:
                        break

                    start_idx += 1000
                    time.sleep(0.05)  # 서버 부하 방지용 짧은 대기

                # 모아둔 데이터(bulk) 한 번에 적재
                if bulk:
                    db.add_all(bulk)
                    db.commit()
                    total += len(bulk)
                    print(f"[{date_str}/{hour:02d}시] 대여 이력 데이터: {len(bulk)}건\n누적 대여 이력 데이터: {total}건")

            # 다음 날짜로 넘어감
            current += timedelta(days=1)

    except Exception as e:
        db.rollback()
        print(f"\n대여 이력 데이터 에러 발생: {e}")
    finally:
        db.close()
        print(f"========== [{target_month}월] 대여 이력 데이터 수집 종료 ==========")


# ==========================================
# 메인 실행 블록
# ==========================================
if __name__ == "__main__":
    init_db()
    # 사용자 입력을 받아 수집할 월 지정
    load_monthly_data(int(input("\n수집할 월을 입력하세요 (1~12): ")))