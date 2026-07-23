// driver_dashboard.js (지시서 목록 페이지)

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

var currentUser = null;
var statusFilter = 'all'; // 'all' | '대기' | '진행중' | '완료'
var scannedByOrder = {};  // { [taskKey]: ['BIKE-0001', ...] }
var currentScanTaskKey = null;

function getStation(id) { return DB.station.find(function (s) { return s.id === id; }); }
var STATUS_LABEL = { '대기': '대기', '진행중': '수행 중', '완료': '완료' };

function isCrossDistrict(order) {
    var from = getStation(order.from_station_id), to = getStation(order.to_station_id);
    return !!(from && to && from.district_id !== to.district_id);
}

// dispatch_order + bike_report를 하나의 작업 목록으로 정규화
function getMyTasks() {
    var tasks = [];

    DB.dispatch_order.filter(function (o) { return o.driver_id === currentUser.id; }).forEach(function (o) {
        tasks.push({
            key: 'dispatch-' + o.id,
            type: 'dispatch',
            raw: o,
            status: o.status,
            urgent: o.status !== '완료' && (isCrossDistrict(o) || (o.general_qty + o.sprout_qty) >= 10),
            qty: o.general_qty + o.sprout_qty,
            time: o.ordered_at
        });
    });

    DB.bike_report.filter(function (r) { return r.reported_by === currentUser.id; }).forEach(function (r) {
        tasks.push({
            key: 'report-' + r.id,
            type: 'report',
            raw: r,
            status: r.status === '해결완료' ? '완료' : '대기',
            urgent: false,
            qty: 1,
            time: r.reported_at
        });
    });

    return tasks;
}

function getFilteredTasks() {
    return getMyTasks().filter(function (t) {
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        return true;
    }).sort(function (a, b) {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return new Date(b.time) - new Date(a.time);
    });
}

// 긴급 / 고장 수거 / 일반 재배치 3개 그룹으로 항상 분리 (긴급 건은 유형과 무관하게 긴급 박스로)
function groupTasksByColumn(tasks) {
    var groups = { urgent: [], report: [], dispatch: [] };
    tasks.forEach(function (t) {
        if (t.urgent) groups.urgent.push(t);
        else if (t.type === 'report') groups.report.push(t);
        else groups.dispatch.push(t);
    });
    return groups;
}

function updateStatusCounts() {
    var all = getMyTasks();
    document.getElementById('count-all').textContent = all.length;
    document.getElementById('count-waiting').textContent = all.filter(function (t) { return t.status === '대기'; }).length;
    document.getElementById('count-doing').textContent = all.filter(function (t) { return t.status === '진행중'; }).length;
    document.getElementById('count-done').textContent = all.filter(function (t) { return t.status === '완료'; }).length;
}

function taskCardHtml(t) {
    var isReport = t.type === 'report';
    var badgeClass = t.status === '완료' ? 'bg-success-subtle text-success' : (t.status === '진행중' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary');
    var scannedCount = (scannedByOrder[t.key] || []).length;

    var title, sub, orderLabel;
    if (isReport) {
        var st = getStation(t.raw.station_id);
        orderLabel = 'RPT-' + String(t.raw.id).padStart(3, '0');
        title = (st ? st.name : '알 수 없음') + ' — 고장 자전거 수거';
        sub = t.raw.issue;
    } else {
        var from = getStation(t.raw.from_station_id), to = getStation(t.raw.to_station_id);
        orderLabel = 'ORD-' + new Date(t.time).getFullYear() + '-' + String(t.raw.id).padStart(3, '0');
        title = (from ? from.name : '알 수 없음') + ' <i class="bi bi-arrow-right text-muted fs-6"></i> ' + (to ? to.name : '알 수 없음');
        sub = '일반 ' + t.raw.general_qty + '대 · 새싹 ' + t.raw.sprout_qty + '대';
    }
    var timeStr = t.time ? new Date(t.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

    var footer = '';
    if (t.status === '대기') {
        footer = '<button type="button" class="btn btn-start w-100 fw-bold py-3 rounded-3" onclick="startTask(\'' + t.key + '\')"><i class="bi bi-play-fill me-2"></i>' + (isReport ? '수거 완료 처리' : '지시 시작') + '</button>';
    } else if (t.status === '진행중') {
        if (isReport) {
            footer = '<button type="button" class="btn btn-complete w-100 fw-bold py-3 rounded-3" onclick="completeTask(\'' + t.key + '\')"><i class="bi bi-check2-circle me-2"></i>완료 처리</button>';
        } else {
            var doneEnabled = scannedCount >= t.qty;
            footer =
                '<div class="d-flex flex-column flex-sm-row gap-2 gap-sm-3">' +
                    '<button type="button" class="btn btn-indigo w-100 fw-bold py-3 rounded-3" onclick="openScanModal(\'' + t.key + '\')"><i class="bi bi-qr-code-scan me-2"></i>QR/ID 스캔 (' + scannedCount + '/' + t.qty + ')</button>' +
                    '<button type="button" class="btn btn-complete w-100 fw-bold py-3 rounded-3" ' + (doneEnabled ? '' : 'disabled') + ' onclick="completeTask(\'' + t.key + '\')"><i class="bi bi-check2-circle me-2"></i>완료</button>' +
                '</div>';
        }
    }

    return (
        '<div class="order-card-item' + (t.urgent ? ' urgent' : '') + (isReport ? ' type-report' : '') + '">' +
            '<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">' +
                '<div>' +
                    '<span class="text-muted small fw-bold me-2">' + orderLabel + '</span>' +
                    (t.urgent ? '<span class="badge rounded-pill bg-danger-subtle text-danger px-2 py-1">긴급</span>' : '') +
                    (isReport ? '<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis px-2 py-1">고장 수거</span>' : '') +
                '</div>' +
                '<span class="badge rounded-pill ' + badgeClass + ' px-3 py-1 text-nowrap">' + STATUS_LABEL[t.status] + '</span>' +
            '</div>' +
            '<h5 class="fw-bold mb-3 text-dark lh-base">' + title + '</h5>' +
            '<div class="d-flex justify-content-between text-muted small mb-3">' +
                '<span>' + sub + '</span>' +
                '<span>' + timeStr + '</span>' +
            '</div>' +
            footer +
        '</div>'
    );
}

function renderColumn(columnKey, tasks) {
    var body = document.getElementById('col-' + columnKey);
    var countEl = document.getElementById('col-count-' + columnKey);
    if (countEl) countEl.textContent = tasks.length + '건';
    if (body) {
        body.innerHTML = tasks.length
            ? tasks.map(taskCardHtml).join('')
            : '<div class="empty-state-box text-center shadow-sm py-4 rounded-4 bg-white text-muted">해당 조건의 지시서가 없습니다.</div>';
    }
}

function renderTasks() {
    var groups = groupTasksByColumn(getFilteredTasks());
    renderColumn('urgent', groups.urgent);
    renderColumn('report', groups.report);
    renderColumn('dispatch', groups.dispatch);
    updateStatusCounts();
}

function startTask(key) {
    var isReport = key.indexOf('report-') === 0;
    var id = parseInt(key.split('-')[1], 10);
    if (isReport) {
        var report = DB.bike_report.find(function (r) { return r.id === id; });
        if (report) report.status = '해결완료';
    } else {
        var order = DB.dispatch_order.find(function (o) { return o.id === id; });
        if (order) order.status = '진행중';
    }
    renderTasks();
}

function completeTask(key) {
    var isReport = key.indexOf('report-') === 0;
    var id = parseInt(key.split('-')[1], 10);
    if (isReport) {
        var report = DB.bike_report.find(function (r) { return r.id === id; });
        if (report) report.status = '해결완료';
    } else {
        var order = DB.dispatch_order.find(function (o) { return o.id === id; });
        if (order) { order.status = '완료'; order.dropoff_completed_at = new Date().toISOString(); }
    }
    renderTasks();
}

function openScanModal(key) {
    currentScanTaskKey = key;
    renderScanModal();
    var modalEl = document.getElementById('scanModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function renderScanModal() {
    var task = getMyTasks().find(function (t) { return t.key === currentScanTaskKey; });
    if (!task) return;
    var scanned = scannedByOrder[currentScanTaskKey] || [];

    document.getElementById('scanProgressText').textContent = scanned.length + ' / ' + task.qty;
    document.getElementById('scannedList').innerHTML = scanned.map(function (bikeId, idx) {
        return '<div class="scanned-item"><span>' + bikeId + '</span><button type="button" onclick="removeScannedBike(' + idx + ')"><i class="bi bi-x-lg"></i></button></div>';
    }).join('') || '<p class="text-muted small text-center mb-0">스캔된 자전거가 없습니다.</p>';
}

function removeScannedBike(idx) {
    var scanned = scannedByOrder[currentScanTaskKey] || [];
    scanned.splice(idx, 1);
    scannedByOrder[currentScanTaskKey] = scanned;
    renderScanModal();
    renderTasks();
}

document.addEventListener('DOMContentLoaded', function () {
    currentUser = getCurrentUser();

    if (window.renderHeader) {
        window.renderHeader('tasks', currentUser);
    }

    document.querySelectorAll('.status-tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.status-tab-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            statusFilter = btn.getAttribute('data-status');
            renderTasks();
        });
    });

    document.getElementById('scanAddBtn').addEventListener('click', function () {
        var input = document.getElementById('scanBikeIdInput');
        var bikeId = input.value.trim();
        if (!bikeId) return;
        var task = getMyTasks().find(function (t) { return t.key === currentScanTaskKey; });
        if (!task) return;
        var scanned = scannedByOrder[currentScanTaskKey] || [];
        if (scanned.length >= task.qty) { alert('지시받은 수량만큼 이미 스캔되었습니다.'); return; }
        scanned.push(bikeId);
        scannedByOrder[currentScanTaskKey] = scanned;
        input.value = '';
        renderScanModal();
        renderTasks();
    });

    renderTasks();
});
