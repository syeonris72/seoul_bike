// admin_dispatch.js (지시서 관리 페이지)

function getCurrentUser() {
    var raw = localStorage.getItem('loggedInUser');
    if (raw) {
        try { return JSON.parse(raw); } catch (e) { }
    }
    return { id: 501, role: 'seoul_admin', name: '김관제', district_id: null };
}

var currentUser = null;
var statusFilter = 'all'; // 'all' | '대기' | '진행중' | '완료'
var selectedDistricts = new Set(); // 비어있으면 전체
var counts = { normal: 0, sprout: 0 };
var maxCounts = { normal: 0, sprout: 0 };
var currentAiRecs = [];
var aiSelectedKeys = new Set();

function getDistrict(id) { return DB.district.find(function (d) { return d.id === id; }); }
function getStation(id) { return DB.station.find(function (s) { return s.id === id; }); }

function classifyStation(st) {
    var total = st.general_bike_count + st.sprout_bike_count;
    var percent = Math.round((total / st.capacity) * 100);
    var level;
    if (percent >= 90) level = 'full';
    else if (total <= 1) level = 'danger';
    else if (total <= 3) level = 'warning';
    else level = 'normal';
    return { total: total, percent: percent, level: level };
}

function isCrossDistrict(order) {
    var from = getStation(order.from_station_id), to = getStation(order.to_station_id);
    return !!(from && to && from.district_id !== to.district_id);
}

function getScopedStations() {
    return DB.station;
}

function getScopedDrivers(districtId) {
    return DB.account.filter(function (a) {
        if (a.role !== 'driver') return false;
        if (districtId && a.district_id !== districtId) return false;
        return true;
    });
}

function orderMatchesDistrictFilter(o) {
    if (selectedDistricts.size === 0) return true;
    var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
    return (from && selectedDistricts.has(from.district_id)) || (to && selectedDistricts.has(to.district_id));
}

function getOrdersInScope() {
    return DB.dispatch_order;
}

// ── 마지막 데이터 업데이트 시간 ────────────────────────────────
function renderLastUpdate() {
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var text = now.getFullYear() + '. ' + pad(now.getMonth() + 1) + '. ' + pad(now.getDate()) + '. ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' 기준';
    document.getElementById('lastUpdateLabel').textContent = text;
}

// ── 자치구 필터 칩 (다중 선택 토글) ────────────────────────────────
function renderDistrictChips() {
    var container = document.getElementById('districtChipGroup');
    container.innerHTML = '';
    DB.district.forEach(function (d) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'district-chip' + (selectedDistricts.has(d.id) ? ' active' : '');
        btn.textContent = d.name;
        btn.addEventListener('click', function () {
            if (selectedDistricts.has(d.id)) selectedDistricts.delete(d.id);
            else selectedDistricts.add(d.id);
            renderDistrictChips();
            renderOrderList();
        });
        container.appendChild(btn);
    });
}

// ── 상태 탭 (전체/대기/수행 중/완료) ────────────────────────────────
function setStatusFilter(status, btnEl) {
    statusFilter = status;
    document.querySelectorAll('.filter-pill').forEach(function (b) { b.classList.remove('active'); });
    btnEl.classList.add('active');
    renderOrderList();
}

// ── 지시서 리스트 (단일 리스트, 항목별 상태 항상 표시) ────────────────────────────────
function orderRowHtml(o) {
    var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
    var driver = DB.account.find(function (a) { return a.id === o.driver_id; });
    var orderedByAcc = DB.account.find(function (a) { return a.id === o.ordered_by; });
    var STATUS_CLASS = { '대기': 'waiting', '진행중': 'progress', '완료': 'completed' };
    var crossDistrict = isCrossDistrict(o);
    var qty = o.general_qty + o.sprout_qty;

    return (
        '<div class="order-row' + (crossDistrict && o.status !== '완료' ? ' urgent' : '') + '">' +
            '<span class="order-status-badge ' + (STATUS_CLASS[o.status] || 'waiting') + '">' + o.status + '</span>' +
            '<div class="order-main">' +
                '<div class="order-route">' +
                    (from ? from.name : '알 수 없음') + ' → ' + (to ? to.name : '알 수 없음') +
                    (crossDistrict ? ' <span class="badge-urgent">긴급</span>' : '') +
                '</div>' +
                '<div class="order-sub">' + (o.ordered_at ? o.ordered_at.slice(0, 16).replace('T', ' ') : '') + ' · ' + (orderedByAcc ? orderedByAcc.name : '관리자') + ' · ' + (driver ? driver.name + ' 기사' : '담당자 미배정') + '</div>' +
            '</div>' +
            '<div class="order-qty-block">' +
                '<div class="qty">' + qty + '대</div>' +
                '<div class="qty-sub">일반 ' + o.general_qty + ' + 새싹 ' + o.sprout_qty + '</div>' +
            '</div>' +
        '</div>'
    );
}

function renderOrderList() {
    var all = getOrdersInScope().filter(orderMatchesDistrictFilter);
    var visible = all.filter(function (o) { return statusFilter === 'all' || o.status === statusFilter; });

    document.getElementById('orderList').innerHTML = visible.length
        ? visible.map(orderRowHtml).join('')
        : '<div class="empty-state"><i class="bi bi-inbox"></i>해당 조건의 지시서가 없습니다.</div>';

    document.getElementById('pillAllCount').textContent = all.length;
    document.getElementById('pillWaitingCount').textContent = all.filter(function (o) { return o.status === '대기'; }).length;
    document.getElementById('pillProgressCount').textContent = all.filter(function (o) { return o.status === '진행중'; }).length;
    document.getElementById('pillCompletedCount').textContent = all.filter(function (o) { return o.status === '완료'; }).length;
}

// ── AI 자동 추천 ────────────────────────────────
function buildAiRecommendations() {
    var stations = getScopedStations();
    var shortages = [];
    var surpluses = [];

    stations.forEach(function (s) {
        var c = classifyStation(s);
        if (c.level === 'danger' || c.level === 'warning') {
            shortages.push({ station: s, need: Math.max(3, s.capacity - c.total), priority: c.level === 'danger' ? 'high' : 'mid' });
        } else if (c.level === 'full') {
            surpluses.push({ station: s, available: Math.max(0, c.total - Math.ceil(s.capacity * 0.5)) });
        }
    });

    shortages.sort(function (a, b) { return (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || b.need - a.need; });
    surpluses.sort(function (a, b) { return b.available - a.available; });

    var recs = [];
    shortages.forEach(function (shortage) {
        var pick = surpluses.find(function (sp) { return sp.available > 0 && sp.station.district_id === shortage.station.district_id; })
            || surpluses.find(function (sp) { return sp.available > 0; });
        if (!pick) return;
        var qty = Math.min(shortage.need, pick.available);
        if (qty <= 0) return;
        pick.available -= qty;
        var generalQty = Math.max(1, Math.round(qty * 0.7));
        var sproutQty = Math.max(0, qty - generalQty);
        recs.push({
            key: 'rec-' + pick.station.id + '-' + shortage.station.id,
            fromStationId: pick.station.id,
            toStationId: shortage.station.id,
            generalQty: generalQty,
            sproutQty: sproutQty,
            priority: shortage.priority
        });
    });
    return recs.slice(0, 12);
}

function aiRowHtml(rec) {
    var from = getStation(rec.fromStationId), to = getStation(rec.toStationId);
    var toC = classifyStation(to);
    var qty = rec.generalQty + rec.sproutQty;
    return (
        '<div class="ai-recommend-item" data-key="' + rec.key + '">' +
            '<input type="checkbox" class="ai-item-check" data-key="' + rec.key + '"' + (aiSelectedKeys.has(rec.key) ? ' checked' : '') + '>' +
            '<span class="priority-badge ' + (rec.priority === 'high' ? 'high' : 'mid') + '">' + (rec.priority === 'high' ? '긴급' : '보통') + '</span>' +
            '<div class="info">' +
                '<div class="name">' + (from ? from.name : '') + ' → ' + (to ? to.name : '') + '</div>' +
                '<div class="addr">' + (to ? getDistrict(to.district_id).name : '') + ' · 현재 재고 ' + toC.total + '/' + (to ? to.capacity : '-') + ' (' + toC.percent + '%)</div>' +
            '</div>' +
            '<div class="qty">' + qty + '대<div class="max-label">일반 ' + rec.generalQty + ' · 새싹 ' + rec.sproutQty + '</div></div>' +
            '<button type="button" class="ai-edit-btn" data-key="' + rec.key + '">수정</button>' +
        '</div>'
    );
}

function renderAiRecommendList() {
    var container = document.getElementById('aiRecommendList');
    container.innerHTML = currentAiRecs.length
        ? currentAiRecs.map(aiRowHtml).join('')
        : '<div class="empty-state"><i class="bi bi-check2-circle"></i>현재 추천할 재배치 건이 없습니다.</div>';

    document.getElementById('aiSelectedCount').textContent = aiSelectedKeys.size + '건 선택됨';
    document.getElementById('aiSelectAll').checked = currentAiRecs.length > 0 && aiSelectedKeys.size === currentAiRecs.length;
    document.getElementById('sendSelectedBtn').disabled = aiSelectedKeys.size === 0;
}

function refreshAiRecommendations() {
    currentAiRecs = buildAiRecommendations();
    aiSelectedKeys.clear();
    renderAiRecommendList();
}

// ── 모달: 지역 캐스케이딩(자치구 → 행정동 → 대여소) ────────────────────────────────
function fillCascadeDistrict(selectId) {
    var el = document.getElementById(selectId);
    el.innerHTML = '<option value="">자치구</option>';
    DB.district.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d.id; opt.textContent = d.name;
        el.appendChild(opt);
    });
}

function fillCascadeDong(dongSelectId, districtId) {
    var el = document.getElementById(dongSelectId);
    el.innerHTML = '<option value="">행정동</option>';
    if (districtId && DB.districtDongMap[districtId]) {
        DB.districtDongMap[districtId].forEach(function (dongName) {
            var opt = document.createElement('option');
            opt.value = dongName; opt.textContent = dongName;
            el.appendChild(opt);
        });
        el.disabled = false;
    } else {
        el.disabled = true;
    }
}

function fillCascadeStation(stationSelectId, districtId, dongName) {
    var el = document.getElementById(stationSelectId);
    el.innerHTML = '<option value="">대여소</option>';
    if (districtId) {
        getScopedStations()
            .filter(function (s) { return s.district_id === districtId && (!dongName || s.neighborhood_name === dongName); })
            .forEach(function (s) {
                var opt = document.createElement('option');
                opt.value = s.id; opt.textContent = s.name;
                el.appendChild(opt);
            });
        el.disabled = false;
    } else {
        el.disabled = true;
    }
}

// ── 수량 최대치 (출발지 보유 대수 기준) ────────────────────────────────
function updateQuantityMax() {
    var stationId = parseInt(document.getElementById('fromStationSelect').value, 10);
    var st = getStation(stationId);
    maxCounts.normal = st ? st.general_bike_count : 0;
    maxCounts.sprout = st ? st.sprout_bike_count : 0;
    counts.normal = Math.min(counts.normal, maxCounts.normal);
    counts.sprout = Math.min(counts.sprout, maxCounts.sprout);
    document.getElementById('normalCount').textContent = counts.normal;
    document.getElementById('sproutCount').textContent = counts.sprout;
    document.getElementById('normalMaxLabel').textContent = '(최대 ' + maxCounts.normal + '대)';
    document.getElementById('sproutMaxLabel').textContent = '(최대 ' + maxCounts.sprout + '대)';
}

function updateCount(type, delta) {
    var next = counts[type] + delta;
    counts[type] = Math.max(0, Math.min(next, maxCounts[type]));
    document.getElementById(type + 'Count').textContent = counts[type];
}

// ── 담당 기사 배정 (선택된 출발지 자치구 소속 기사만 표시) ────────────────────────────────
function updateDriverList(districtId) {
    var container = document.getElementById('driverList');
    container.innerHTML = '';

    if (!districtId) {
        container.innerHTML = '<p class="text-muted small mb-0">출발지 자치구를 먼저 선택하세요.</p>';
        document.getElementById('driverWaitingBadge').textContent = '대기 중 0명';
        return;
    }

    var drivers = getScopedDrivers(districtId);
    var waitingCount = 0;
    drivers.forEach(function (driver) {
        var working = DB.dispatch_order.some(function (o) { return o.driver_id === driver.id && o.status === '진행중'; });
        if (!working) waitingCount++;
        var district = getDistrict(driver.district_id);
        var div = document.createElement('div');
        div.className = 'driver-item';
        div.setAttribute('data-driver-id', driver.id);
        div.addEventListener('click', function () {
            document.querySelectorAll('.driver-item').forEach(function (el) { el.classList.remove('selected'); });
            div.classList.add('selected');
        });
        div.innerHTML =
            '<div class="driver-item-info">' +
                '<div class="driver-avatar bg-driver-1">' + driver.name.charAt(0) + '</div>' +
                '<div>' +
                    '<h6 class="driver-item-name">' + driver.name + ' 기사</h6>' +
                    '<p class="driver-item-desc">' + (district ? district.name : '') + '</p>' +
                '</div>' +
            '</div>' +
            '<span class="driver-status ' + (working ? 'working' : 'waiting') + '">' + (working ? '업무중' : '대기') + '</span>';
        container.appendChild(div);
    });

    if (drivers.length === 0) {
        container.innerHTML = '<p class="text-muted small mb-0">해당 자치구에 배정 가능한 기사가 없습니다.</p>';
    }
    document.getElementById('driverWaitingBadge').textContent = '대기 중 ' + waitingCount + '명';
}

// ── 지시서 작성 모달 ────────────────────────────────
function resetOrderForm() {
    fillCascadeDistrict('fromDistrictSelect');
    fillCascadeDong('fromDongSelect', null);
    fillCascadeStation('fromStationSelect', null, null);
    fillCascadeDistrict('toDistrictSelect');
    fillCascadeDong('toDongSelect', null);
    fillCascadeStation('toStationSelect', null, null);

    counts.normal = 0; counts.sprout = 0;
    updateQuantityMax();
    updateDriverList(null);

    document.getElementById('emergencyToggle').checked = false;
    document.getElementById('orderMemo').value = '';
    document.querySelectorAll('.driver-item').forEach(function (el) { el.classList.remove('selected'); });
}

function selectCascadeStation(prefix, stationId) {
    var st = getStation(stationId);
    if (!st) return;
    document.getElementById(prefix + 'DistrictSelect').value = st.district_id;
    fillCascadeDong(prefix + 'DongSelect', st.district_id);
    document.getElementById(prefix + 'DongSelect').value = st.neighborhood_name;
    fillCascadeStation(prefix + 'StationSelect', st.district_id, st.neighborhood_name);
    document.getElementById(prefix + 'StationSelect').value = st.id;
}

function openWriteModal(prefill) {
    resetOrderForm();
    prefill = prefill || {};

    if (prefill.fromStationId) {
        selectCascadeStation('from', prefill.fromStationId);
        updateQuantityMax();
        updateDriverList(getStation(prefill.fromStationId).district_id);
    }
    if (prefill.toStationId) {
        selectCascadeStation('to', prefill.toStationId);
    }
    if (prefill.generalQty != null) {
        counts.normal = Math.min(prefill.generalQty, maxCounts.normal);
        document.getElementById('normalCount').textContent = counts.normal;
    }
    if (prefill.sproutQty != null) {
        counts.sprout = Math.min(prefill.sproutQty, maxCounts.sprout);
        document.getElementById('sproutCount').textContent = counts.sprout;
    }

    var modalEl = document.getElementById('dispatchModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function submitOrder() {
    var fromId = parseInt(document.getElementById('fromStationSelect').value, 10);
    var toId = parseInt(document.getElementById('toStationSelect').value, 10);

    if (!fromId || !toId) { alert('출발지와 도착지 대여소를 모두 선택해 주세요.'); return; }
    if (fromId === toId) { alert('출발지와 도착지는 서로 달라야 합니다.'); return; }
    if (counts.normal + counts.sprout <= 0) { alert('이동할 따릉이 수량을 입력해 주세요.'); return; }

    var selectedDriverEl = document.querySelector('.driver-item.selected');
    var driverId = selectedDriverEl ? parseInt(selectedDriverEl.getAttribute('data-driver-id'), 10) : null;

    var nextId = DB.dispatch_order.reduce(function (max, o) { return Math.max(max, o.id); }, 0) + 1;
    DB.dispatch_order.push({
        id: nextId,
        from_station_id: fromId,
        to_station_id: toId,
        general_qty: counts.normal,
        sprout_qty: counts.sprout,
        driver_id: driverId,
        ordered_by: currentUser.id,
        ordered_at: new Date().toISOString(),
        pickup_completed_at: null,
        dropoff_completed_at: null,
        status: '대기'
    });

    var modalEl = document.getElementById('dispatchModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.hide();

    renderOrderList();
    renderDistrictChips();
    alert('지시서가 전송되었습니다!');
}

// ── 뷰 전환 (일반 리스트 / AI 자동 추천) ────────────────────────────────
function setView(view) {
    document.getElementById('normalListSection').style.display = view === 'list' ? '' : 'none';
    document.getElementById('aiRecommendSection').style.display = view === 'ai' ? '' : 'none';
    document.getElementById('aiRecommendTabBtn').classList.toggle('active', view === 'ai');
    if (view === 'ai') refreshAiRecommendations();
}

document.addEventListener('DOMContentLoaded', function () {
    currentUser = getCurrentUser();

    if (window.renderHeader) {
        window.renderHeader('dispatch', currentUser);
    }

    renderLastUpdate();
    renderDistrictChips();
    renderOrderList();

    document.getElementById('aiRecommendTabBtn').addEventListener('click', function () {
        var goingToAi = document.getElementById('aiRecommendSection').style.display === 'none';
        setView(goingToAi ? 'ai' : 'list');
    });

    document.getElementById('aiSelectAll').addEventListener('change', function () {
        if (this.checked) currentAiRecs.forEach(function (r) { aiSelectedKeys.add(r.key); });
        else aiSelectedKeys.clear();
        renderAiRecommendList();
    });

    document.getElementById('aiRecommendList').addEventListener('click', function (e) {
        var check = e.target.closest('.ai-item-check');
        var editBtn = e.target.closest('.ai-edit-btn');
        if (check) {
            var key = check.getAttribute('data-key');
            if (check.checked) aiSelectedKeys.add(key); else aiSelectedKeys.delete(key);
            renderAiRecommendList();
        } else if (editBtn) {
            var rec = currentAiRecs.find(function (r) { return r.key === editBtn.getAttribute('data-key'); });
            if (rec) openWriteModal(rec);
        }
    });

    document.getElementById('sendSelectedBtn').addEventListener('click', function () {
        if (aiSelectedKeys.size === 0) return;
        var toSend = currentAiRecs.filter(function (r) { return aiSelectedKeys.has(r.key); });
        var nextId = DB.dispatch_order.reduce(function (max, o) { return Math.max(max, o.id); }, 0) + 1;
        toSend.forEach(function (rec) {
            DB.dispatch_order.push({
                id: nextId++,
                from_station_id: rec.fromStationId,
                to_station_id: rec.toStationId,
                general_qty: rec.generalQty,
                sprout_qty: rec.sproutQty,
                driver_id: null,
                ordered_by: currentUser.id,
                ordered_at: new Date().toISOString(),
                pickup_completed_at: null,
                dropoff_completed_at: null,
                status: '대기'
            });
        });
        alert(toSend.length + '건의 지시서가 일괄 발송되었습니다.');
        renderOrderList();
        renderDistrictChips();
        refreshAiRecommendations();
    });

    // 캐스케이딩 셀렉트 이벤트
    document.getElementById('fromDistrictSelect').addEventListener('change', function () {
        var districtId = this.value ? parseInt(this.value, 10) : null;
        fillCascadeDong('fromDongSelect', districtId);
        fillCascadeStation('fromStationSelect', districtId, null);
        updateQuantityMax();
        updateDriverList(districtId);
    });
    document.getElementById('fromDongSelect').addEventListener('change', function () {
        var districtId = document.getElementById('fromDistrictSelect').value ? parseInt(document.getElementById('fromDistrictSelect').value, 10) : null;
        fillCascadeStation('fromStationSelect', districtId, this.value || null);
        updateQuantityMax();
    });
    document.getElementById('fromStationSelect').addEventListener('change', updateQuantityMax);

    document.getElementById('toDistrictSelect').addEventListener('change', function () {
        var districtId = this.value ? parseInt(this.value, 10) : null;
        fillCascadeDong('toDongSelect', districtId);
        fillCascadeStation('toStationSelect', districtId, null);
    });
    document.getElementById('toDongSelect').addEventListener('change', function () {
        var districtId = document.getElementById('toDistrictSelect').value ? parseInt(document.getElementById('toDistrictSelect').value, 10) : null;
        fillCascadeStation('toStationSelect', districtId, this.value || null);
    });

    document.getElementById('openWriteModalBtn').addEventListener('click', function () { openWriteModal(); });
    document.getElementById('submitOrderBtn').addEventListener('click', submitOrder);

    // 관제 지도 페이지에서 "지시서 쓰기"로 넘어온 경우: 해당 스테이션을 출발지로 자동 선택 후 모달 오픈
    var params = new URLSearchParams(window.location.search);
    if (params.get('writeOrder') === '1' && params.get('stationId')) {
        openWriteModal({ fromStationId: parseInt(params.get('stationId'), 10) });
    }
});
