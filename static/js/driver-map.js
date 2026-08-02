// driver-map.js (경로 지도 페이지) — 카카오맵 실제 타일 위에 오늘의 수거/배치 대여소를 표시한다.

function getCurrentUser() {
    var raw = localStorage.getItem('currentUser');
    var fallback = { id: 901, role: 'driver', name: '김마포', district_id: 1, district_name: '마포구' };
    if (raw) {
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.role === 'driver') return parsed;
        } catch (e) { }
    }
    return fallback;
}

var allStations = [];
var allOrders = [];
var kakaoMap = null;
var mapOverlays = [];

// 대여소 좌표가 없는 극소수 케이스(known limitation)를 위한 서울시청 좌표 기본값
var SEOUL_CENTER = { lat: 37.5665, lon: 126.9780 };

function getStation(id) { return allStations.find(function (s) { return s.station_id === id; }); }
function getDistrict(id) { return (window.__driverMapDistricts || []).find(function (d) { return d.id === id; }); }

// 담당 자치구 소속 대여소들의 실제 위경도 평균 — 실제 GPS 연동 전까지 "내 위치" 마커 자리로 사용
function computeDistrictCenter(districtId) {
    var inDistrict = allStations.filter(function (s) { return s.district_id === districtId && s.lat && s.lon; });
    if (!inDistrict.length) return SEOUL_CENTER;
    var sum = inDistrict.reduce(function (acc, s) { acc.lat += s.lat; acc.lon += s.lon; return acc; }, { lat: 0, lon: 0 });
    return { lat: sum.lat / inDistrict.length, lon: sum.lon / inDistrict.length };
}

// 오늘 마커로 표시할 대상: 이 기사에게 배정된, 아직 끝나지 않은 지시서들 (/driver/orders가 이미 driver 기준으로 필터링)
function getActiveOrders() {
    return allOrders
        .filter(function (o) { return o.status !== '완료'; })
        .sort(function (a, b) { return new Date(a.ordered_at) - new Date(b.ordered_at); });
}

async function initKakaoMap() {
    var kakao = await window.loadKakaoMaps();
    var container = document.getElementById('kakaoMapContainer');
    kakaoMap = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lon),
        level: 8
    });
    return kakao;
}

// 지도는 "오늘 가야 할 대여소가 어디 있는지"만 보여주는 현황판 역할만 한다.
// 대여소 하나 = 마커 하나. 자세한 내용/길안내는 클릭했을 때 뜨는 팝업에서 처리한다.
function renderMapMarkers(currentUser, kakao) {
    if (!kakaoMap) return;

    mapOverlays.forEach(function (ov) { ov.setMap(null); });
    mapOverlays = [];

    var orders = getActiveOrders();

    // 수거 핀과 배치 핀이 같은 지시서의 짝임을 한눈에 알 수 있도록, 지시서마다 모양을 하나씩 배정해
    // 핀 자체를 그 모양(원/사각/삼각/마름모)으로 그린다(숫자는 우선순위처럼 보여서 제외, 선도 긋지 않음).
    var PIN_SHAPES = ['circle', 'square', 'triangle', 'diamond'];
    var pins = [];
    // 같은 대여소에 고장 수거 지시서가 여러 건 겹치는 경우(예: 신고가 여러 건 접수돼 지시서가
    // 나뉜 경우), 대여소별로 핀을 하나만 찍고 그 안에 지시서들을 모아 둔다.
    var reportPinByStation = {};
    orders.forEach(function (o, idx) {
        var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
        if (!from || !to) return;
        var shape = PIN_SHAPES[idx % PIN_SHAPES.length];
        // 고장 수거 지시서는 출발지=도착지(수거 대상 대여소 1곳)이므로, 수거/배치 핀을 둘 다 찍으면
        // 같은 위치에 배치(초록) 핀이 수거 핀을 덮어버린다. 대신 고장(노랑) 핀 하나만 찍는다.
        if (o.order_type === '고장수거') {
            if (!from.lat || !from.lon) return;
            var existing = reportPinByStation[from.station_id];
            if (existing) {
                existing.orders.push(o);
            } else {
                var pin = { st: from, role: 'report', orders: [o], shape: shape, lat: from.lat, lon: from.lon };
                reportPinByStation[from.station_id] = pin;
                pins.push(pin);
            }
            return;
        }
        if (from.lat && from.lon) pins.push({ st: from, role: 'start', orders: [o], shape: shape, lat: from.lat, lon: from.lon });
        if (to.lat && to.lon) pins.push({ st: to, role: 'end', orders: [o], shape: shape, lat: to.lat, lon: to.lon });
    });

    var countEl = document.getElementById('routeCount');
    if (countEl) {
        var stationIds = {};
        pins.forEach(function (p) { stationIds[p.st.station_id] = true; });
        countEl.textContent = Object.keys(stationIds).length + '곳';
    }

    var bounds = new kakao.maps.LatLngBounds();
    pins.forEach(function (p) { bounds.extend(new kakao.maps.LatLng(p.st.lat, p.st.lon)); });

    // 기사님의 현재 위치: 아직 실제 GPS 연동 전이라, 담당 자치구 대여소들의 중심에 파란 점으로 고정 표시한다.
    var myLoc = computeDistrictCenter(currentUser.district_id);
    var myLocPos = new kakao.maps.LatLng(myLoc.lat, myLoc.lon);
    bounds.extend(myLocPos);

    // 화면 축척(줌 레벨)이 정해져야 "화면상 몇 픽셀이나 가까운지"를 알 수 있으므로, 지도를 먼저
    // 데이터에 맞게 이동/확대한 뒤에 겹침 여부를 계산한다.
    if (pins.length > 0) {
        kakaoMap.setBounds(bounds, 60, 60, 60, 60);
    } else {
        kakaoMap.setCenter(myLocPos);
        kakaoMap.setLevel(6);
    }

    // 같은 대여소가 여러 지시서의 수거/배치 지점으로 등장하는 경우뿐 아니라, 한 지시서의 수거지와
    // 배치지처럼 서로 다른 대여소라도 화면상 아주 가까이 있으면 핀이 겹쳐 보인다(예: 같은 역의 서로
    // 다른 출구). 위경도가 아닌 실제 화면 픽셀 거리로 가까운 핀들을 묶어 원형으로 살짝 벌린다.
    var projection = kakaoMap.getProjection();
    var points = pins.map(function (p) { return projection.pointFromCoords(new kakao.maps.LatLng(p.st.lat, p.st.lon)); });
    var CLUSTER_DIST_PX = 22;
    var RADIUS_PX = 12;
    var visited = pins.map(function () { return false; });
    pins.forEach(function (_, i) {
        if (visited[i]) return;
        var group = [i];
        visited[i] = true;
        var grown = true;
        while (grown) {
            grown = false;
            pins.forEach(function (__, j) {
                if (visited[j]) return;
                var near = group.some(function (gi) {
                    var dx = points[gi].x - points[j].x, dy = points[gi].y - points[j].y;
                    return Math.sqrt(dx * dx + dy * dy) < CLUSTER_DIST_PX;
                });
                if (near) { group.push(j); visited[j] = true; grown = true; }
            });
        }
        if (group.length <= 1) return;
        group.forEach(function (pinIdx, gi) {
            var angle = (2 * Math.PI * gi) / group.length - Math.PI / 2;
            pins[pinIdx].offsetX = RADIUS_PX * Math.cos(angle);
            pins[pinIdx].offsetY = RADIUS_PX * Math.sin(angle);
        });
    });

    pins.forEach(function (p) {
        var pos = new kakao.maps.LatLng(p.st.lat, p.st.lon);
        var el = document.createElement('div');
        el.className = 'station-marker ' + p.role + ' ' + p.shape;
        el.title = p.st.name;
        if (p.offsetX || p.offsetY) {
            el.style.setProperty('--ox', p.offsetX + 'px');
            el.style.setProperty('--oy', p.offsetY + 'px');
        }
        el.addEventListener('click', function () { openPinPopup(p.orders, p.role, p.st); });

        var overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 0.5, xAnchor: 0.5, zIndex: 10 });
        overlay.setMap(kakaoMap);
        mapOverlays.push(overlay);
    });

    var myLocEl = document.createElement('div');
    myLocEl.className = 'my-location-marker';
    myLocEl.title = '내 위치';
    myLocEl.innerHTML = '<div class="ring"></div><div class="core"></div>';
    var myLocOverlay = new kakao.maps.CustomOverlay({ position: myLocPos, content: myLocEl, yAnchor: 0.5, xAnchor: 0.5, zIndex: 3 });
    myLocOverlay.setMap(kakaoMap);
    mapOverlays.push(myLocOverlay);
}

// 카카오내비 앱으로 바로 길안내를 연결하기 위한 링크
function buildKakaoNaviUrl(station) {
    return 'https://map.kakao.com/link/to/' + encodeURIComponent(station.name) + ',' + station.lat + ',' + station.lon;
}

// 대여소 마커를 눌렀을 때: 대여소 이름/위치 + 외부 내비게이션 앱 연동 버튼만 짧게 보여준다.
// orders는 이 핀에 겹쳐진 지시서 목록(고장 수거가 아니면 항상 1건)이며, 수량은 합산해서 보여준다.
function openPinPopup(orders, role, station) {
    var qty = orders.reduce(function (sum, o) { return sum + o.general_qty + o.sprout_qty; }, 0);
    var district = station ? getDistrict(station.district_id) : null;
    var roleLabel = role === 'report' ? '고장 수거' : (role === 'start' ? '수거' : '배치');

    var roleTagEl = document.getElementById('pinPopupRoleTag');
    roleTagEl.className = 'pin-popup-role-tag ' + role;
    roleTagEl.textContent = roleLabel + ' · ' + qty + '대';

    document.getElementById('pinPopupStationName').textContent = station ? station.name : '알 수 없음';
    document.getElementById('pinPopupAddr').textContent =
        (district ? district.name : '') + (station && station.neighborhood_name ? ' · ' + station.neighborhood_name : '');

    // 고장 수거 핀은 현장에서 바로 대상 자전거를 식별할 수 있도록 신고된 자전거 ID를 함께 보여준다.
    var bikeIds = role === 'report'
        ? orders.reduce(function (acc, o) { return acc.concat(o.bike_ids || []); }, [])
        : [];
    var bikeIdsEl = document.getElementById('pinPopupBikeIds');
    if (bikeIds.length) {
        bikeIdsEl.innerHTML = bikeIds.map(function (id) {
            return '<span class="badge rounded-pill bg-light text-dark border">' + escapeHtml(id) + '</span>';
        }).join('');
        bikeIdsEl.classList.remove('d-none');
    } else {
        bikeIdsEl.innerHTML = '';
        bikeIdsEl.classList.add('d-none');
    }

    if (station) {
        document.getElementById('pinPopupKakaoBtn').setAttribute('href', buildKakaoNaviUrl(station));
    }

    document.getElementById('pinPopupBackdrop').classList.add('show');
    document.getElementById('pinPopup').classList.add('show');
}

function closePinPopup() {
    document.getElementById('pinPopupBackdrop').classList.remove('show');
    document.getElementById('pinPopup').classList.remove('show');
}

document.addEventListener('DOMContentLoaded', async function () {
    var authRaw = localStorage.getItem('currentUser');
    var authUser = authRaw ? JSON.parse(authRaw) : null;
    if (!authUser || authUser.role !== 'driver' || !localStorage.getItem('accessToken')) {
        document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
        return;
    }

    var currentUser = getCurrentUser();

    if (window.renderHeader) {
        window.renderHeader('route', currentUser);
    }

    var kakao;
    try {
        kakao = await initKakaoMap();
    } catch (e) {
        console.error('[카카오맵] 초기화 실패:', e);
        document.getElementById('kakaoMapContainer').innerHTML =
            '<div class="d-flex align-items-center justify-content-center h-100 text-muted small">지도를 불러오지 못했습니다.</div>';
    }

    try {
        var results = await Promise.all([api.get('/station/stations'), api.get('/station/districts'), api.get('/driver/orders')]);
        allStations = results[0];
        window.__driverMapDistricts = results[1];
        allOrders = results[2];
    } catch (e) {
        allStations = []; window.__driverMapDistricts = []; allOrders = [];
    }

    if (kakao) renderMapMarkers(currentUser, kakao);

    var pinPopupBackdrop = document.getElementById('pinPopupBackdrop');
    var pinPopupCloseBtn = document.getElementById('pinPopupCloseBtn');
    if (pinPopupBackdrop) pinPopupBackdrop.addEventListener('click', closePinPopup);
    if (pinPopupCloseBtn) pinPopupCloseBtn.addEventListener('click', closePinPopup);
});
