import logging
import os
from datetime import date

import requests

logger = logging.getLogger(__name__)

# data/collect_env_2024.py가 2024년치 학습 데이터를 채울 때 쓴 것과 동일한 기상청
# APIHub 과거 관측 API. rt_weather/rt_air(collect_rt.py의 실시간 nowcast)는 "오늘" 것만
# 계속 쌓이는 테이블이라, 수집을 막 시작한 서버는 "어제" 비교 대상이 DB 안에 아예 없다.
# 이 모듈이 그 공백을 이 API로 직접 채운다.
_ASOS_URL = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php"
_PM10_URL = "https://apihub.kma.go.kr/api/typ01/url/kma_pm10.php"
_SEOUL_STN = "108"

# 하루 안에는 값이 바뀌지 않으므로 날짜별로 캐싱해 매 요청마다 외부 API를 다시 호출하지 않는다.
_cache: dict[date, dict[str, float | None]] = {}


def _parse_header_indices(line: str) -> tuple[int, int, list[str]] | None:
    if not (("YYMMDDHHMI" in line or "TM" in line) and "STN" in line):
        return None
    header_fields = [f.strip() for f in line.replace("#", "").split()]
    tm_idx = header_fields.index("YYMMDDHHMI") if "YYMMDDHHMI" in header_fields else header_fields.index("TM")
    stn_idx = header_fields.index("STN")
    return tm_idx, stn_idx, header_fields


def _parse_temp_daily_avg(text: str) -> float | None:
    tm_idx, stn_idx, ta_idx = 0, 1, -1
    values: list[float] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            parsed = _parse_header_indices(line)
            if parsed:
                tm_idx, stn_idx, header_fields = parsed
                ta_idx = header_fields.index("TA") if "TA" in header_fields else -1
            continue
        fields = line.split()
        try:
            if fields[stn_idx] != _SEOUL_STN or ta_idx == -1 or ta_idx >= len(fields):
                continue
            raw = fields[ta_idx].strip()
            if raw in ("-99", "-99.0", "-9", "-9.0", "-") or not raw:
                continue
            values.append(float(raw))
        except (ValueError, IndexError):
            continue
    return round(sum(values) / len(values), 1) if values else None


def _parse_rain_daily_avg(text: str) -> float | None:
    tm_idx, stn_idx, rn_idx = 0, 1, -1
    values: list[float] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            parsed = _parse_header_indices(line)
            if parsed:
                tm_idx, stn_idx, header_fields = parsed
                rn_idx = header_fields.index("RN") if "RN" in header_fields else -1
            continue
        fields = line.split()
        try:
            if fields[stn_idx] != _SEOUL_STN or rn_idx == -1 or rn_idx >= len(fields):
                continue
            raw = fields[rn_idx].strip()
            # collect_env_2024.py의 강수량 처리와 동일: 결측/음수는 0.0(비 안 옴)으로 취급.
            values.append(float(raw) if (raw != "-" and raw and float(raw) >= 0) else 0.0)
        except (ValueError, IndexError):
            continue
    return round(sum(values) / len(values), 1) if values else None


def _parse_pm10_daily_avg(text: str) -> float | None:
    values: list[float] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        fields = line.split(",")
        if len(fields) < 3:
            continue
        stn_id, pm10_val = fields[1].strip(), fields[2].strip()
        if stn_id != _SEOUL_STN or not pm10_val or pm10_val in ("-99", "-99.0"):
            continue
        try:
            val = float(pm10_val)
        except ValueError:
            continue
        if val >= 0:
            values.append(val)
    return round(sum(values) / len(values), 1) if values else None


def fetch_daily_avg(target_date: date) -> dict[str, float | None]:
    """target_date 하루(00~23시) 기상청 ASOS 관측치로 일평균 기온/강수량/PM10을 구한다.
    API 키가 없거나 호출이 실패하면 해당 항목은 None으로 남는다(호출부에서 처리)."""
    if target_date in _cache:
        return _cache[target_date]

    key = os.getenv("WEATHER_HUB_KEY", "")
    result: dict[str, float | None] = {"temp": None, "rain": None, "pm10": None}

    if not key:
        logger.warning("WEATHER_HUB_KEY 미설정 - %s 날씨 조회를 건너뜁니다.", target_date)
        _cache[target_date] = result
        return result

    tm1 = target_date.strftime("%Y%m%d") + "0000"
    tm2 = target_date.strftime("%Y%m%d") + "2300"

    try:
        resp = requests.get(
            _ASOS_URL,
            params={"tm1": tm1, "tm2": tm2, "stn": _SEOUL_STN, "help": "1", "authKey": key},
            timeout=10,
        )
        if resp.status_code == 200:
            result["temp"] = _parse_temp_daily_avg(resp.text)
            result["rain"] = _parse_rain_daily_avg(resp.text)
        else:
            logger.warning("%s 기온/강수량 조회 실패: HTTP %s", target_date, resp.status_code)
    except requests.RequestException as e:
        logger.warning("%s 기온/강수량 조회 실패: %s", target_date, e)

    try:
        resp = requests.get(
            _PM10_URL,
            params={"tm1": tm1, "tm2": tm2, "stn": "0", "authKey": key},
            timeout=10,
        )
        if resp.status_code == 200:
            result["pm10"] = _parse_pm10_daily_avg(resp.text)
        else:
            logger.warning("%s 미세먼지 조회 실패: HTTP %s", target_date, resp.status_code)
    except requests.RequestException as e:
        logger.warning("%s 미세먼지 조회 실패: %s", target_date, e)

    if any(v is not None for v in result.values()):
        _cache[target_date] = result
    else:
        # 전부 실패(일시적 API 장애 등)면 캐싱하지 않는다 - 캐싱해버리면 프로세스가 재시작될
        # 때까지 그날 날씨가 영구적으로 비어 보인다. 다음 요청이 다시 시도하게 둔다.
        logger.warning("%s 날씨 조회 전부 실패 - 캐싱하지 않고 다음 요청에서 재시도합니다.", target_date)
    return result
