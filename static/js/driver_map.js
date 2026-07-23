// driver_map.js (경로 지도 페이지)

function getCurrentUser() {
    var raw = localStorage.getItem('loggedInUser');
    var fallback = { id: 901, role: 'driver', name: '김마포', district_id: 1, district_name: '마포구' };
    if (raw) {
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.role === 'driver') return parsed;
        } catch (e) { }
    }
    return fallback;
}

function getStation(id) { return DB.station.find(function (s) { return s.id === id; }); }
function getDistrict(id) { return DB.district.find(function (d) { return d.id === id; }); }
var STATUS_LABEL = { '대기': '대기', '진행중': '수행 중', '완료': '완료' };

function isCrossDistrict(order) {
    var from = getStation(order.from_station_id), to = getStation(order.to_station_id);
    return !!(from && to && from.district_id !== to.district_id);
}

function getActiveOrders(currentUser) {
    return DB.dispatch_order.filter(function (o) { return o.driver_id === currentUser.id && o.status !== '완료'; });
}

function renderRouteList(currentUser) {
    var orders = getActiveOrders(currentUser);
    document.getElementById('routeCount').textContent = '· ' + orders.length + '건';

    var listEl = document.getElementById('routeList');
    listEl.innerHTML = orders.length
        ? orders.map(renderRouteItem).join('')
        : '<div class="route-empty"><i class="bi bi-signpost-split"></i>현재 배정된 재배치 경로가 없습니다.</div>';
}

function renderRouteItem(o) {
    var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
    var urgent = isCrossDistrict(o) || (o.general_qty + o.sprout_qty) >= 10;
    return (
        '<div class="route-item' + (urgent ? ' urgent' : '') + '">' +
            '<div class="badge-row">' +
                '<span class="badge ' + (o.status === '진행중' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary') + ' rounded-pill px-2 py-1 text-nowrap">' + STATUS_LABEL[o.status] + '</span>' +
                (urgent ? '<span class="badge bg-danger-subtle text-danger rounded-pill px-2 py-1">긴급</span>' : '') +
            '</div>' +
            '<div class="route-path"><span class="stop-dot start"></span>' + (from ? from.name : '알 수 없음') + ' <i class="bi bi-arrow-right"></i> <span class="stop-dot end"></span>' + (to ? to.name : '알 수 없음') + '</div>' +
            '<div class="route-sub"><span class="qty-pill">총 ' + (o.general_qty + o.sprout_qty) + '대</span>일반 ' + o.general_qty + '대 · 새싹 ' + o.sprout_qty + '대</div>' +
        '</div>'
    );
}

function renderRoutePins(currentUser) {
    var container = document.getElementById('route-pins');
    container.innerHTML = '';
    var orders = getActiveOrders(currentUser);

    orders.forEach(function (o) {
        var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
        [{ st: from, type: 'start', label: '출발' }, { st: to, type: 'end', label: '도착' }].forEach(function (item) {
            if (!item.st) return;
            var pin = document.createElement('div');
            pin.className = 'route-pin ' + item.type;
            pin.style.left = (item.st.map_x || 0) + 'px';
            pin.style.top = (item.st.map_y || 0) + 'px';
            pin.innerHTML = '<span class="dot"></span><span class="chip">' + item.label + ' · ' + item.st.name + '</span>';
            container.appendChild(pin);
        });
    });
}

document.addEventListener('DOMContentLoaded', function () {
    var currentUser = getCurrentUser();

    if (window.renderHeader) {
        window.renderHeader('route', currentUser);
    }

    renderRouteList(currentUser);
    renderRoutePins(currentUser);

    // 모바일 바텀시트 열기/닫기
    var sidebar = document.getElementById('routeSidebar');
    var toggle = document.getElementById('routePanelToggle');
    var reopenPill = document.getElementById('routeReopenPill');
    function setCollapsed(collapsed) {
        if (sidebar) sidebar.classList.toggle('collapsed', collapsed);
        if (toggle) toggle.setAttribute('aria-expanded', String(!collapsed));
        if (reopenPill) reopenPill.classList.toggle('show', collapsed);
        // 경로 목록 시트가 펼쳐진 동안에는 겹쳐 보이는 범례(출발지/도착지)를 함께 숨김
        var legend = document.querySelector('.route-legend');
        if (legend) legend.classList.toggle('hidden-behind-sheet', !collapsed);
    }
    if (toggle) toggle.addEventListener('click', function (e) { e.preventDefault(); setCollapsed(!sidebar.classList.contains('collapsed')); });
    if (reopenPill) reopenPill.addEventListener('click', function () { setCollapsed(false); });
    setCollapsed(sidebar ? sidebar.classList.contains('collapsed') : false);
});
