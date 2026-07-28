"""위경도 <-> 픽셀 좌표 투영, 두 지점 간 거리 계산 유틸.

카카오맵 JS SDK(KAKAO_JAVASCRIPT_API_KEY 미발급으로 보류) 대신, 실제 station_loc
위경도를 등장방형 투영으로 고정 캔버스에 투영해 기존 목업의 map_x/map_y 방식을 대체한다.
"""
import math

# station_loc 실측 범위(lat 37.47~37.59, lon 126.80~127.16)에 여유를 둔 값
_LAT_MIN, _LAT_MAX = 37.44, 37.62
_LON_MIN, _LON_MAX = 126.76, 127.20
_CANVAS_W, _CANVAS_H = 800.0, 500.0


def project_latlon_to_canvas(lat: float | None, lon: float | None) -> tuple[float, float]:
    if not lat or not lon:
        return _CANVAS_W / 2, _CANVAS_H / 2

    x = (lon - _LON_MIN) / (_LON_MAX - _LON_MIN) * _CANVAS_W
    y = (_LAT_MAX - lat) / (_LAT_MAX - _LAT_MIN) * _CANVAS_H
    return round(x, 1), round(y, 1)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 2)
