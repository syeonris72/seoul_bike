// admin-dispatch.js (지시서 관리 페이지)

function getCurrentUser() {
    var raw = localStorage.getItem('currentUser');
    var fallback = { id: 501, role: 'admin', name: '김관제', district_id: null };
    if (raw) {
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.role === 'admin') return parsed;
        } catch (e) { }
    }
    return fallback;
}

var currentUser = null;
var statusFilter = 'all'; // 'all' | '대기' | '진행중' | '완료'
var counts = { normal: 0, sprout: 0 };
var maxCounts = { normal: 0, sprout: 0 };
var currentAiRecs = [];
var aiSelectedKeys = new Set();

var allStations = [];
var districts = [];
var allDrivers = [];
var allOrders = [];
var KOREAN_TO_LEVEL = { '고갈': 'danger', '부족': 'warning', '적정': 'normal', '과포화': 'full' };

function getDistrict(id) { return districts.find(function (d) { return d.id === id; }); }
function getStation(id) { return allStations.find(function (s) { return s.station_id === id; }); }
var STATUS_LABEL = { '대기': '대기', '진행중': '수행 중', '완료': '완료' };
var STATUS_FILTER_LABEL = { all: '전체', '대기': '대기', '진행중': '수행 중', '완료': '완료' };

// 지시서가 속한 자치구: 수거 대여소(출발지) 기준, 없으면 배치 대여소(도착지) 기준
function getOrderDistrictId(o) {
    var from = getStation(o.from_station_id);
    if (from) return from.district_id;
    var to = getStation(o.to_station_id);
    return to ? to.district_id : null;
}

function classifyStation(st) {
    var level = KOREAN_TO_LEVEL[st.stock_level] || 'normal';
    var percent = st.capacity > 0 ? Math.round((st.total_bikes / st.capacity) * 100) : 0;
    return { total: st.total_bikes, percent: percent, level: level };
}

function getScopedStations() {
    return allStations;
}

function getScopedDrivers(districtId) {
    return allDrivers.filter(function (a) {
        if (districtId && a.district_id !== districtId) return false;
        return true;
    });
}

function getOrdersInScope() {
    return allOrders;
}

async function refreshOrders() {
    try {
        allOrders = await api.get('/admin/dispatch');
    } catch (e) { /* 조회 실패 시 이전 목록 유지 */ }
    renderOrderColumns();
}

// ── 지시서 카드 (개별 항목): driver-dashboard(지시서 목록)의 카드와 동일한 형식 ────────────────────────────────
function orderCardHtml(o) {
    var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
    var driver = allDrivers.find(function (a) { return a.id === o.driver_id; });
    var badgeClass = o.status === '완료' ? 'bg-success-subtle text-success' : (o.status === '진행중' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary');
    // "긴급" 여부는 관리자가 지시서 작성 시 켠 긴급 토글(is_emergency)만을 기준으로 한다.
    var isUrgent = !!o.is_emergency && o.status !== '완료';
    var isBroken = o.order_type === '고장수거';
    var orderLabel = 'ORD-' + (o.ordered_at ? new Date(o.ordered_at).getFullYear() : new Date().getFullYear()) + '-' + String(o.id).padStart(3, '0');
    var qty = o.general_qty + o.sprout_qty;
    var timeStr = o.ordered_at ? o.ordered_at.slice(0, 16).replace('T', ' ') : '';
    // 고장 신고 관리 페이지에서 발송된 고장 수거 지시서는 출발지=도착지(수거 대상 대여소 1곳)이므로 화살표 없이 대여소명만 표시한다.
    var titleHtml = (from && o.from_station_id === o.to_station_id)
        ? from.name
        : (from ? from.name : '알 수 없음') + ' <i class="bi bi-arrow-right text-muted fs-6"></i> ' + (to ? to.name : '알 수 없음');

    return (
        '<div class="order-card-item' + (isUrgent ? ' urgent' : '') + (isBroken ? ' type-report' : '') + '">' +
            '<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">' +
                '<div>' +
                    '<span class="text-muted small fw-bold me-2">' + orderLabel + '</span>' +
                    (isUrgent ? '<span class="badge rounded-pill bg-danger-subtle text-danger px-2 py-1">긴급</span>' : '') +
                    (isBroken ? '<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis px-2 py-1">고장 수거</span>' : '') +
                '</div>' +
                '<span class="badge badge-dot rounded-pill ' + badgeClass + ' text-nowrap">' + STATUS_LABEL[o.status] + '</span>' +
            '</div>' +
            '<h5 class="fw-bold mb-2 lh-base">' + titleHtml + '</h5>' +
            '<div class="text-muted small">일반 ' + o.general_qty + '대 · 새싹 ' + o.sprout_qty + '대 (총 ' + qty + '대)</div>' +
            '<div class="text-muted small order-card-meta">' + timeStr + ' · ' + (driver ? driver.name + ' 기사' : '담당자 미배정') + '</div>' +
        '</div>'
    );
}

// ── 지시서 목록: 자치구별 박스로 항상 분리해 표시 ────────────────────────────────
function renderOrderColumns() {
    var all = getOrdersInScope();
    var visible = all.filter(function (o) { return statusFilter === 'all' || o.status === statusFilter; });

    var container = document.getElementById('districtColumns');
    container.innerHTML = districts.map(function (d) {
        var districtOrders = visible.filter(function (o) { return getOrderDistrictId(o) === d.id; })
            .sort(function (a, b) {
                var aUrgent = !!a.is_emergency && a.status !== '완료';
                var bUrgent = !!b.is_emergency && b.status !== '완료';
                if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
                return new Date(b.ordered_at) - new Date(a.ordered_at);
            });
        return (
            '<section class="task-column" data-district="' + d.id + '">' +
                '<div class="task-column-head">' + d.name + ' <span class="task-column-count">' + districtOrders.length + '건</span></div>' +
                '<div class="task-column-body">' +
                    (districtOrders.length
                        ? districtOrders.map(orderCardHtml).join('')
                        : '<div class="empty-state"><i class="bi bi-inbox"></i>해당 조건의 지시서가 없습니다.</div>') +
                '</div>' +
            '</section>'
        );
    }).join('');

    document.getElementById('count-all').textContent = all.length;
    document.getElementById('count-waiting').textContent = all.filter(function (o) { return o.status === '대기'; }).length;
    document.getElementById('count-doing').textContent = all.filter(function (o) { return o.status === '진행중'; }).length;
    document.getElementById('count-done').textContent = all.filter(function (o) { return o.status === '완료'; }).length;

    var counts = {
        all: all.length,
        '대기': all.filter(function (o) { return o.status === '대기'; }).length,
        '진행중': all.filter(function (o) { return o.status === '진행중'; }).length,
        '완료': all.filter(function (o) { return o.status === '완료'; }).length
    };
    var statusSelectedLabel = document.getElementById('statusSelectedLabel');
    var statusSelectedCount = document.getElementById('statusSelectedCount');
    if (statusSelectedLabel) statusSelectedLabel.textContent = STATUS_FILTER_LABEL[statusFilter];
    if (statusSelectedCount) statusSelectedCount.textContent = counts[statusFilter];
}

// 출발지 자치구 소속 기사 중 현재 '진행중'인 지시서가 없는(=대기 중) 기사를 배정한다.
// usedCounts로 이번 추천 배치 안에서 이미 배정된 횟수를 추적해, 한 기사에게 몰리지 않고 고르게 분산되도록 한다.
// 배정 가능한 기사가 없으면 null을 반환하며, 이 경우 해당 추천 건은 담당 기사가 없어 전송할 수 없다.
function pickAvailableDriverId(districtId, usedCounts) {
    var drivers = getScopedDrivers(districtId);
    var free = drivers.filter(function (d) {
        return !allOrders.some(function (o) { return o.driver_id === d.id && o.status === '진행중'; });
    });
    if (!free.length) return null;
    free.sort(function (a, b) { return (usedCounts[a.id] || 0) - (usedCounts[b.id] || 0); });
    var chosen = free[0];
    usedCounts[chosen.id] = (usedCounts[chosen.id] || 0) + 1;
    return chosen.id;
}

// ── AI 자동 추천 (실시간 재고 데이터를 읽어 클라이언트에서 계산하는 휴리스틱 — 백엔드 변경 없음) ────────────────────────────────
function buildAiRecommendations() {
    var stations = getScopedStations();
    var shortages = [];
    var surpluses = [];

    // 이미 대기/진행중인 지시서가 걸려 있는 대여소는 추천에서 제외한다.
    // (재고 데이터는 기사가 실제로 이동을 완료해야 갱신되므로, 이 체크가 없으면 발송 직후에도
    //  동일한 추천 건이 그대로 다시 나타나 중복 발송으로 이어진다.)
    var hasActiveOrder = function (stationId) {
        return allOrders.some(function (o) {
            return o.status !== '완료' && (o.from_station_id === stationId || o.to_station_id === stationId);
        });
    };

    stations.forEach(function (s) {
        if (hasActiveOrder(s.station_id)) return;
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
    var usedCounts = {};
    shortages.forEach(function (shortage) {
        var pick = surpluses.find(function (sp) { return sp.available > 0 && sp.station.district_id === shortage.station.district_id; })
            || surpluses.find(function (sp) { return sp.available > 0; });
        if (!pick) return;
        var qty = Math.min(shortage.need, pick.available);
        if (qty <= 0) return;
        pick.available -= qty;
        var generalQty = Math.max(1, Math.round(qty * 0.7));
        var sproutQty = Math.max(0, qty - generalQty);
        // 지시서의 소속 자치구는 출발지(수거 대여소) 기준(getOrderDistrictId와 동일한 기준)이므로, 담당 기사도 출발지 자치구에서 찾는다.
        var driverId = pickAvailableDriverId(pick.station.district_id, usedCounts);
        recs.push({
            key: 'rec-' + pick.station.station_id + '-' + shortage.station.station_id,
            fromStationId: pick.station.station_id,
            toStationId: shortage.station.station_id,
            generalQty: generalQty,
            sproutQty: sproutQty,
            priority: shortage.priority,
            driverId: driverId
        });
    });
    return recs.slice(0, 12);
}

function aiRowHtml(rec) {
    var from = getStation(rec.fromStationId), to = getStation(rec.toStationId);
    var toC = classifyStation(to);
    var qty = rec.generalQty + rec.sproutQty;
    var driver = rec.driverId ? allDrivers.find(function (d) { return d.id === rec.driverId; }) : null;
    var driverHtml = driver ? driver.name + ' 기사' : '<span class="text-danger">배정 가능한 기사 없음</span>';
    return (
        '<div class="ai-recommend-item" data-key="' + rec.key + '">' +
            '<div class="ai-recommend-item-main">' +
                '<input type="checkbox" class="ai-item-check" data-key="' + rec.key + '"' + (aiSelectedKeys.has(rec.key) ? ' checked' : '') + (rec.driverId ? '' : ' disabled') + '>' +
                '<span class="priority-badge ' + (rec.priority === 'high' ? 'high' : 'mid') + '">' + (rec.priority === 'high' ? '긴급' : '보통') + '</span>' +
                '<div class="info">' +
                    '<div class="name">' + (from ? from.name : '') + ' → ' + (to ? to.name : '') + '</div>' +
                    '<div class="addr">' + (to ? (getDistrict(to.district_id)?.name || '') : '') + ' · 현재 재고 ' + toC.total + '/' + (to ? to.capacity : '-') + ' (' + toC.percent + '%) · 담당 ' + driverHtml + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="ai-recommend-item-actions">' +
                '<div class="qty">' + qty + '대<div class="max-label">일반 ' + rec.generalQty + ' · 새싹 ' + rec.sproutQty + '</div></div>' +
                '<button type="button" class="ai-edit-btn" data-key="' + rec.key + '">수정</button>' +
            '</div>' +
        '</div>'
    );
}

function renderAiRecommendList() {
    var container = document.getElementById('aiRecommendList');
    container.innerHTML = currentAiRecs.length
        ? currentAiRecs.map(aiRowHtml).join('')
        : '<div class="empty-state"><i class="bi bi-check2-circle"></i>현재 추천할 재배치 건이 없습니다.</div>';

    var selectableRecs = currentAiRecs.filter(function (r) { return !!r.driverId; });
    document.getElementById('aiSelectedCount').textContent = aiSelectedKeys.size + '건 선택됨';
    document.getElementById('aiSelectAll').checked = selectableRecs.length > 0 && aiSelectedKeys.size === selectableRecs.length;
    document.getElementById('sendSelectedBtn').disabled = aiSelectedKeys.size === 0;
}

function refreshAiRecommendations() {
    currentAiRecs = buildAiRecommendations();
    aiSelectedKeys.clear();
    renderAiRecommendList();
}

// ── 모달: 지역 캐스케이딩(자치구 → 행정동 → 대여소) ────────────────────────────────
// 실제 값은 숨겨진 <select>에 그대로 보관하고(기존 로직 재사용), 화면에는 상태 필터와 동일한
// pill 버튼 + 드롭다운 메뉴(cascade-select-btn/cascade-dropdown-menu)로 렌더링한다.
function renderCascadeDropdown(selectId) {
    var select = document.getElementById(selectId);
    var prefix = selectId.replace('Select', '');
    var btn = document.getElementById(prefix + 'Btn');
    var label = document.getElementById(prefix + 'Label');
    var menu = document.getElementById(prefix + 'Menu');
    if (!select || !btn || !label || !menu) return;

    var options = Array.prototype.slice.call(select.options);
    menu.innerHTML = options.map(function (opt) {
        var isSelected = opt.value === select.value;
        return '<li><a class="dropdown-item' + (isSelected ? ' selected-item' : '') + '" href="#" data-select="' + selectId + '" data-value="' + opt.value + '">' + opt.textContent + '</a></li>';
    }).join('');

    var selectedOption = options.filter(function (o) { return o.value === select.value; })[0] || options[0];
    label.textContent = selectedOption ? selectedOption.textContent : '';
    btn.disabled = select.disabled;
}

function fillCascadeDistrict(selectId) {
    var el = document.getElementById(selectId);
    el.innerHTML = '<option value="">자치구</option>';
    districts.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d.id; opt.textContent = d.name;
        el.appendChild(opt);
    });
    renderCascadeDropdown(selectId);
}

function getDongsForDistrict(districtId) {
    var set = new Set();
    allStations.forEach(function (st) {
        if (st.district_id === districtId && st.neighborhood_name) set.add(st.neighborhood_name);
    });
    return Array.from(set).sort();
}

function fillCascadeDong(dongSelectId, districtId) {
    var el = document.getElementById(dongSelectId);
    el.innerHTML = '<option value="">행정동</option>';
    var dongList = districtId ? getDongsForDistrict(districtId) : [];
    if (districtId && dongList.length) {
        dongList.forEach(function (dongName) {
            var opt = document.createElement('option');
            opt.value = dongName; opt.textContent = dongName;
            el.appendChild(opt);
        });
        el.disabled = false;
    } else {
        el.disabled = true;
    }
    renderCascadeDropdown(dongSelectId);
}

function fillCascadeStation(stationSelectId, districtId, dongName) {
    var el = document.getElementById(stationSelectId);
    el.innerHTML = '<option value="">대여소</option>';
    if (districtId) {
        getScopedStations()
            .filter(function (s) { return s.district_id === districtId && (!dongName || s.neighborhood_name === dongName); })
            .forEach(function (s) {
                var opt = document.createElement('option');
                opt.value = s.station_id; opt.textContent = s.name;
                el.appendChild(opt);
            });
        el.disabled = false;
    } else {
        el.disabled = true;
    }
    renderCascadeDropdown(stationSelectId);
}

// ── 지시서 전송 버튼: 출발/도착 대여소, 수량, 담당 기사가 모두 채워져야 활성화 ────────────────────────────────
function updateSubmitButtonState() {
    var fromId = document.getElementById('fromStationSelect').value;
    var toId = document.getElementById('toStationSelect').value;
    var qty = counts.normal + counts.sprout;
    var driverSelected = !!document.querySelector('.driver-item.selected');
    var valid = !!fromId && !!toId && fromId !== toId && qty > 0 && driverSelected;
    document.getElementById('submitOrderBtn').disabled = !valid;
}

// ── 수량 최대치 (출발지 보유 대수 기준) ────────────────────────────────
function updateQuantityMax() {
    var stationId = document.getElementById('fromStationSelect').value;
    var st = getStation(stationId);
    maxCounts.normal = st ? st.general_bike_cnt : 0;
    maxCounts.sprout = st ? st.sprout_bike_cnt : 0;
    counts.normal = Math.min(counts.normal, maxCounts.normal);
    counts.sprout = Math.min(counts.sprout, maxCounts.sprout);
    document.getElementById('normalCount').textContent = counts.normal;
    document.getElementById('sproutCount').textContent = counts.sprout;
    document.getElementById('normalMaxLabel').textContent = '(최대 ' + maxCounts.normal + '대)';
    document.getElementById('sproutMaxLabel').textContent = '(최대 ' + maxCounts.sprout + '대)';
    updateSubmitButtonState();
}

function updateCount(type, delta) {
    var next = counts[type] + delta;
    counts[type] = Math.max(0, Math.min(next, maxCounts[type]));
    document.getElementById(type + 'Count').textContent = counts[type];
    updateSubmitButtonState();
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
        var working = allOrders.some(function (o) { return o.driver_id === driver.id && o.status === '진행중'; });
        if (!working) waitingCount++;
        var district = getDistrict(driver.district_id);
        var div = document.createElement('div');
        div.className = 'driver-item';
        div.setAttribute('data-driver-id', driver.id);
        div.addEventListener('click', function () {
            document.querySelectorAll('.driver-item').forEach(function (el) { el.classList.remove('selected'); });
            div.classList.add('selected');
            updateSubmitButtonState();
        });
        div.innerHTML =
            '<div class="driver-item-info">' +
                '<div class="profile-icon driver">' + driver.name.charAt(0) + '</div>' +
                '<div>' +
                    '<h6 class="driver-item-name">' + driver.name + '</h6>' +
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
    closeAllSimpleDropdowns();
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
    document.querySelectorAll('.driver-item').forEach(function (el) { el.classList.remove('selected'); });
}

function selectCascadeStation(prefix, stationId) {
    var st = getStation(stationId);
    if (!st) return;
    document.getElementById(prefix + 'DistrictSelect').value = st.district_id;
    renderCascadeDropdown(prefix + 'DistrictSelect');
    fillCascadeDong(prefix + 'DongSelect', st.district_id);
    document.getElementById(prefix + 'DongSelect').value = st.neighborhood_name;
    renderCascadeDropdown(prefix + 'DongSelect');
    fillCascadeStation(prefix + 'StationSelect', st.district_id, st.neighborhood_name);
    document.getElementById(prefix + 'StationSelect').value = st.station_id;
    renderCascadeDropdown(prefix + 'StationSelect');
}

function openWriteModal(prefill) {
    resetOrderForm();
    prefill = prefill || {};

    if (prefill.fromStationId) {
        selectCascadeStation('from', prefill.fromStationId);
        updateQuantityMax();
        updateDriverList(getStation(prefill.fromStationId).district_id);
        // AI 추천이 자동 배정한 담당 기사를 모달에도 그대로 선택된 상태로 반영한다.
        if (prefill.driverId) {
            var driverEl = document.querySelector('.driver-item[data-driver-id="' + prefill.driverId + '"]');
            if (driverEl) {
                document.querySelectorAll('.driver-item').forEach(function (el) { el.classList.remove('selected'); });
                driverEl.classList.add('selected');
            }
        }
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
    // AI 추천 목록에서 "긴급"(high)으로 표시된 건을 수정할 때는 긴급 지시서 토글도 함께 켜준다.
    if (prefill.priority === 'high') {
        document.getElementById('emergencyToggle').checked = true;
    }
    updateSubmitButtonState();

    var modalEl = document.getElementById('dispatchModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

async function submitOrder() {
    var fromId = document.getElementById('fromStationSelect').value;
    var toId = document.getElementById('toStationSelect').value;

    if (!fromId || !toId) { alert('출발지와 도착지 대여소를 모두 선택해 주세요.'); return; }
    if (fromId === toId) { alert('출발지와 도착지는 서로 달라야 합니다.'); return; }
    if (counts.normal + counts.sprout <= 0) { alert('이동할 따릉이 수량을 입력해 주세요.'); return; }

    var selectedDriverEl = document.querySelector('.driver-item.selected');
    var driverId = selectedDriverEl ? parseInt(selectedDriverEl.getAttribute('data-driver-id'), 10) : null;
    if (!driverId) { alert('담당 기사를 배정해 주세요.'); return; }

    var isEmergency = document.getElementById('emergencyToggle').checked;

    try {
        await api.post('/admin/dispatch', {
            from_station_id: fromId,
            to_station_id: toId,
            general_qty: counts.normal,
            sprout_qty: counts.sprout,
            driver_id: driverId,
            is_emergency: isEmergency
        });
    } catch (e) {
        alert(e.message || '지시서 전송에 실패했습니다.');
        return;
    }

    var modalEl = document.getElementById('dispatchModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.hide();

    await refreshOrders();
    alert('지시서가 전송되었습니다!');
}

// ── AI 자동 추천 팝업 열기 ────────────────────────────────
function openAiRecommendModal() {
    refreshAiRecommendations();
    var modalEl = document.getElementById('aiRecommendModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

// ── 상태 필터 / 캐스케이딩 드롭다운: Popper를 쓰지 않고 순수 CSS(버튼 바로 아래 100%)로 위치를 고정해
// 열렸을 때 버튼과 드롭다운이 간격 없이 하나로 이어져 보이도록 직접 열고 닫는다. ────────────────────────────────
var SIMPLE_DROPDOWNS = [
    { btn: 'statusDropdownBtn', menu: 'statusFilterList' },
    { btn: 'fromDistrictBtn', menu: 'fromDistrictMenu' },
    { btn: 'fromDongBtn', menu: 'fromDongMenu' },
    { btn: 'fromStationBtn', menu: 'fromStationMenu' },
    { btn: 'toDistrictBtn', menu: 'toDistrictMenu' },
    { btn: 'toDongBtn', menu: 'toDongMenu' },
    { btn: 'toStationBtn', menu: 'toStationMenu' }
];

function closeAllSimpleDropdowns() {
    SIMPLE_DROPDOWNS.forEach(function (p) {
        var btn = document.getElementById(p.btn);
        var menu = document.getElementById(p.menu);
        if (menu) menu.classList.remove('show');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    });
}

function initSimpleDropdowns() {
    SIMPLE_DROPDOWNS.forEach(function (p) {
        var btn = document.getElementById(p.btn);
        var menu = document.getElementById(p.menu);
        if (!btn || !menu) return;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (btn.disabled) return;
            var willOpen = !menu.classList.contains('show');
            closeAllSimpleDropdowns();
            if (willOpen) {
                menu.classList.add('show');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });
    // 드롭다운 바깥을 클릭하면 열려 있는 드롭다운을 모두 닫는다 (항목 선택 클릭은 각자의 핸들러가 먼저 처리된 뒤 여기로 버블링되어 자연스럽게 닫힌다)
    document.addEventListener('click', closeAllSimpleDropdowns);
}

document.addEventListener('DOMContentLoaded', async function () {
    var authRaw = localStorage.getItem('currentUser');
    var authUser = authRaw ? JSON.parse(authRaw) : null;
    if (!authUser || authUser.role !== 'admin' || !localStorage.getItem('accessToken')) {
        document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
        return;
    }

    currentUser = getCurrentUser();

    if (window.renderHeader) {
        window.renderHeader('dispatch', currentUser);
    }

    try {
        var results = await Promise.all([
            api.get('/station/stations'),
            api.get('/station/districts'),
            api.get('/admin/drivers'),
            api.get('/admin/dispatch')
        ]);
        allStations = results[0];
        districts = results[1];
        allDrivers = results[2];
        allOrders = results[3];
    } catch (e) {
        allStations = []; districts = []; allDrivers = []; allOrders = [];
    }

    renderOrderColumns();
    initSimpleDropdowns();

    // 수량 카운터 +/- 버튼 (이벤트 위임으로 리스너 하나만 사용)
    document.querySelectorAll('.counter-grid').forEach(function (grid) {
        grid.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-count-type]');
            if (!btn) return;
            updateCount(btn.getAttribute('data-count-type'), Number(btn.getAttribute('data-count-delta')));
        });
    });

    // 상태 필터 드롭다운: 항목 클릭 시 선택 표시를 옮기고 필터를 적용한다 (이벤트 위임으로 리스너 하나만 사용)
    var statusFilterList = document.getElementById('statusFilterList');
    if (statusFilterList) {
        statusFilterList.addEventListener('click', function (e) {
            var item = e.target.closest('.dropdown-item');
            if (!item) return;
            e.preventDefault();
            statusFilterList.querySelectorAll('.dropdown-item').forEach(function (el) { el.classList.remove('selected-item'); });
            item.classList.add('selected-item');
            statusFilter = item.getAttribute('data-status');
            renderOrderColumns();
        });
    }

    document.getElementById('aiRecommendTabBtn').addEventListener('click', openAiRecommendModal);

    document.getElementById('aiSelectAll').addEventListener('change', function () {
        if (this.checked) currentAiRecs.forEach(function (r) { if (r.driverId) aiSelectedKeys.add(r.key); });
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

    document.getElementById('sendSelectedBtn').addEventListener('click', async function () {
        if (aiSelectedKeys.size === 0) return;
        var toSend = currentAiRecs.filter(function (r) { return aiSelectedKeys.has(r.key); });

        if (toSend.some(function (r) { return !r.driverId; })) {
            alert('담당 기사가 배정되지 않은 항목이 있어 전송할 수 없습니다. 해당 항목은 선택을 해제하거나 "수정"에서 기사를 직접 배정해 주세요.');
            return;
        }

        try {
            await Promise.all(toSend.map(function (rec) {
                return api.post('/admin/dispatch', {
                    from_station_id: rec.fromStationId,
                    to_station_id: rec.toStationId,
                    general_qty: rec.generalQty,
                    sprout_qty: rec.sproutQty,
                    driver_id: rec.driverId,
                    is_emergency: rec.priority === 'high'
                });
            }));
        } catch (e) {
            alert(e.message || '일괄 발송에 실패했습니다.');
            return;
        }

        alert(toSend.length + '건의 지시서가 일괄 발송되었습니다.');
        await refreshOrders();
        refreshAiRecommendations();

        var modalEl = document.getElementById('aiRecommendModal');
        var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();
    });

    // 지역 캐스케이딩 드롭다운(자치구/행정동/대여소) 항목 클릭: 숨겨진 select 값을 갱신하고 change 이벤트를 발생시켜
    // 아래의 기존 캐스케이딩 로직(change 리스너)이 그대로 동작하도록 한다.
    document.querySelectorAll('.cascade-dropdown-menu').forEach(function (menu) {
        menu.addEventListener('click', function (e) {
            var item = e.target.closest('.dropdown-item');
            if (!item) return;
            e.preventDefault();
            var selectId = item.getAttribute('data-select');
            var select = document.getElementById(selectId);
            select.value = item.getAttribute('data-value');
            renderCascadeDropdown(selectId);
            select.dispatchEvent(new Event('change'));
        });
    });

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
    document.getElementById('toStationSelect').addEventListener('change', updateSubmitButtonState);

    document.getElementById('openWriteModalBtn').addEventListener('click', function () { openWriteModal(); });
    document.getElementById('submitOrderBtn').addEventListener('click', submitOrder);

    // 관제 지도 페이지에서 "지시서 쓰기"로 넘어온 경우: 해당 대여소를 role에 따라 출발지(수거) 또는 도착지(배치)로 자동 선택 후 모달 오픈
    // (고갈 대여소 핀에서 넘어온 경우 role=to이므로 배치 대여소로, 그 외는 role=from이므로 수거 대여소로 선택된다.)
    var params = new URLSearchParams(window.location.search);
    if (params.get('writeOrder') === '1' && params.get('stationId')) {
        if (params.get('role') === 'to') {
            openWriteModal({ toStationId: params.get('stationId') });
        } else {
            openWriteModal({ fromStationId: params.get('stationId') });
        }
    }
});
