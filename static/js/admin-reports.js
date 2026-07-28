// admin-reports.js (고장 신고 관리 페이지)
// 관리자의 역할은 신고를 확인하고 "고장 자전거 수거" 지시서를 작성하는 것까지이며,
// 실제 수거·수리 처리는 다른 부서(기사/정비팀) 소관이므로 이 페이지에서는 신고 상태를
// 직접 변경하지 않고, 해당 신고에 연결된 지시서의 진행 상태(대기/진행중/완료)만 보여준다.
// dispatch_status/driver_name은 백엔드(/admin/reports)가 이미 지시서와 조인해 계산해 준다.

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
var statusFilter = 'all'; // 'all' | '미배정' | '대기' | '진행중' | '완료'

var STATUS_FILTER_LABEL = { all: '전체', '미배정': '미배정', '대기': '대기', '진행중': '수행 중', '완료': '완료' };
var STATUS_BADGE_CLASS = {
    '미배정': 'bg-warning-subtle text-warning-emphasis',
    '대기': 'bg-secondary-subtle text-secondary',
    '진행중': 'bg-primary-subtle text-primary',
    '완료': 'bg-success-subtle text-success'
};

var selectedStationForDispatch = null;
var selectedDriverId = null;

var allStations = [];
var districts = [];
var allDrivers = [];
var allReports = [];

function getStation(id) { return allStations.find(function (s) { return s.station_id === id; }); }
function getDistrict(id) { return districts.find(function (d) { return d.id === id; }); }

function getReportDistrictId(r) {
    var st = getStation(r.station_id);
    return st ? st.district_id : null;
}

// 신고 1건의 진행 상태: 백엔드가 지시서와 조인해 이미 계산해서 내려준다.
function getReportProgressStatus(r) {
    return r.dispatch_status || '미배정';
}

function getVisibleReports() {
    return allReports.filter(function (r) {
        return statusFilter === 'all' || getReportProgressStatus(r) === statusFilter;
    });
}

// ── 신고 카드 (개별 항목): 지시서 관리 페이지의 카드와 동일한 형식 ────────────────────────────────
function reportCardHtml(r) {
    var progress = getReportProgressStatus(r);
    var reportLabel = 'RPT-' + String(r.id).padStart(3, '0');
    var timeStr = r.reported_at ? r.reported_at.slice(0, 16).replace('T', ' ') : '';
    var driverHtml = progress === '미배정' ? '미배정' : (r.driver_name ? r.driver_name + ' 기사' : '기사 미배정');

    return (
        '<div class="report-card-item status-' + progress + '">' +
            '<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">' +
                '<div>' +
                    '<span class="text-muted small fw-bold me-2">' + reportLabel + '</span>' +
                    '<span class="badge rounded-pill bg-light text-dark border">BIKE-' + String(r.bike_id).padStart(4, '0') + '</span>' +
                '</div>' +
                '<span class="badge badge-dot rounded-pill ' + STATUS_BADGE_CLASS[progress] + ' text-nowrap">' + STATUS_FILTER_LABEL[progress] + '</span>' +
            '</div>' +
            '<h5 class="fw-bold mb-2 lh-base">' + escapeHtml(r.station_name || '알 수 없음') + '</h5>' +
            '<div class="text-muted small mb-3">' + escapeHtml(r.issue) + '</div>' +
            '<div class="d-flex justify-content-between text-muted small">' +
                '<span>' + driverHtml + '</span>' +
                '<span>' + timeStr + '</span>' +
            '</div>' +
        '</div>'
    );
}

// ── 신고 목록: 자치구별 박스로 항상 분리해 표시 ────────────────────────────────
function renderReportColumns() {
    var visible = getVisibleReports();
    var progressOrder = { '미배정': 0, '대기': 1, '진행중': 2, '완료': 3 };

    var container = document.getElementById('districtColumns');
    container.innerHTML = districts.map(function (d) {
        var districtReports = visible.filter(function (r) { return getReportDistrictId(r) === d.id; })
            .sort(function (a, b) {
                var diff = progressOrder[getReportProgressStatus(a)] - progressOrder[getReportProgressStatus(b)];
                if (diff !== 0) return diff;
                return new Date(b.reported_at) - new Date(a.reported_at);
            });
        return (
            '<section class="task-column" data-district="' + d.id + '">' +
                '<div class="task-column-head">' + d.name + ' <span class="task-column-count">' + districtReports.length + '건</span></div>' +
                '<div class="task-column-body">' +
                    (districtReports.length
                        ? districtReports.map(reportCardHtml).join('')
                        : '<div class="empty-state"><i class="bi bi-inbox"></i>해당 조건의 고장 신고가 없습니다.</div>') +
                '</div>' +
            '</section>'
        );
    }).join('');

    var counts = { all: allReports.length, '미배정': 0, '대기': 0, '진행중': 0, '완료': 0 };
    allReports.forEach(function (r) { counts[getReportProgressStatus(r)]++; });

    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-unassigned').textContent = counts['미배정'];
    document.getElementById('count-waiting').textContent = counts['대기'];
    document.getElementById('count-doing').textContent = counts['진행중'];
    document.getElementById('count-done').textContent = counts['완료'];
    document.getElementById('statusSelectedLabel').textContent = STATUS_FILTER_LABEL[statusFilter];
    document.getElementById('statusSelectedCount').textContent = counts[statusFilter];
}

async function refreshReports() {
    try {
        allReports = await api.get('/admin/reports');
    } catch (e) { /* 조회 실패 시 이전 목록 유지 */ }
    renderReportColumns();
}

// ── 고장 신고 지시서 작성 모달: 아직 지시서가 없는(미배정) 신고를 대여소 단위로 묶어서 보여준다 —
// 같은 대여소에 신고가 여러 건이어도 지시서 한 장으로 묶여서 기사 한 명에게 바로 배정된다.
function getUnassignedReportsByStation() {
    var groups = {};
    allReports.forEach(function (r) {
        if (getReportProgressStatus(r) !== '미배정') return;
        (groups[r.station_id] = groups[r.station_id] || []).push(r);
    });
    return groups;
}

// 대여소 선택 토글(상태 필터와 동일한 pill 드롭다운 UI): 목록 렌더링 + 선택된 항목 라벨/강조 갱신
function renderStationDropdownList() {
    var listEl = document.getElementById('stationDropdownList');
    var groups = getUnassignedReportsByStation();
    var stationIds = Object.keys(groups);

    if (!stationIds.length) {
        listEl.innerHTML = '<li><span class="dropdown-item disabled">배정 가능한 신고가 없습니다</span></li>';
        return;
    }

    listEl.innerHTML = stationIds.map(function (stationId) {
        var st = getStation(stationId);
        var reports = groups[stationId];
        var isSelected = selectedStationForDispatch === stationId;
        return '<li><a class="dropdown-item' + (isSelected ? ' selected-item' : '') + '" href="#" data-station-id="' + stationId + '">' +
            (st ? st.name : '알 수 없음') + ' <span class="count">' + reports.length + '</span></a></li>';
    }).join('');
}

function updateStationSelectedLabel() {
    var labelEl = document.getElementById('stationSelectedLabel');
    var countEl = document.getElementById('stationSelectedCount');

    if (!selectedStationForDispatch) {
        labelEl.textContent = '선택';
        countEl.textContent = '';
        return;
    }
    var groups = getUnassignedReportsByStation();
    var st = getStation(selectedStationForDispatch);
    var reports = groups[selectedStationForDispatch] || [];
    labelEl.textContent = st ? st.name : '알 수 없음';
    countEl.textContent = reports.length;
}

function updateSubmitButtonState() {
    document.getElementById('submitReportDispatchBtn').disabled = !(selectedStationForDispatch && selectedDriverId);
}

function selectDispatchStation(stationId) {
    selectedStationForDispatch = stationId || null;
    selectedDriverId = null;

    updateStationSelectedLabel();
    renderStationDropdownList();
    updateSubmitButtonState();

    if (!selectedStationForDispatch) {
        document.getElementById('dispatchReportSummary').innerHTML = '<p class="text-muted small mb-0">위에서 지시서를 작성할 대여소를 선택해 주세요.</p>';
        renderDispatchDriverList(null);
        return;
    }

    var groups = getUnassignedReportsByStation();
    var reports = groups[selectedStationForDispatch] || [];
    var st = getStation(selectedStationForDispatch);
    var district = st ? getDistrict(st.district_id) : null;
    document.getElementById('dispatchReportSummary').innerHTML =
        '<div class="d-flex flex-wrap gap-2">' +
        reports.map(function (r) {
            return '<span class="badge rounded-pill bg-light text-dark border">BIKE-' + String(r.bike_id).padStart(4, '0') + '</span>';
        }).join('') +
        '</div>';

    renderDispatchDriverList(district ? district.id : null);
}

function openDispatchModal(stationId) {
    selectDispatchStation(stationId || null);

    var modalEl = document.getElementById('reportDispatchModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function renderDispatchDriverList(districtId) {
    var container = document.getElementById('dispatchDriverList');
    container.innerHTML = '';

    var drivers = districtId ? allDrivers.filter(function (a) { return a.district_id === districtId; }) : [];
    var waitingCount = 0;

    drivers.forEach(function (driver) {
        var working = false; // 기사 업무중 여부는 배차 지시서 목록에서만 정확히 알 수 있어, 여기선 항상 '대기'로 표시
        if (!working) waitingCount++;

        var div = document.createElement('div');
        div.className = 'driver-item';
        div.setAttribute('data-driver-id', driver.id);
        div.addEventListener('click', function () {
            document.querySelectorAll('#dispatchDriverList .driver-item').forEach(function (el) { el.classList.remove('selected'); });
            div.classList.add('selected');
            selectedDriverId = driver.id;
            updateSubmitButtonState();
        });
        div.innerHTML =
            '<div class="driver-item-info">' +
                '<div class="driver-avatar">' + driver.name.charAt(0) + '</div>' +
                '<div><h6 class="driver-item-name">' + driver.name + ' 기사</h6></div>' +
            '</div>' +
            '<span class="driver-status ' + (working ? 'working' : 'waiting') + '">' + (working ? '업무중' : '대기') + '</span>';
        container.appendChild(div);
    });

    if (drivers.length === 0) {
        container.innerHTML = '<p class="text-muted small mb-0">해당 자치구에 배정 가능한 기사가 없습니다.</p>';
    }
    document.getElementById('dispatchDriverWaitingBadge').textContent = '대기 중 ' + waitingCount + '명';
}

async function submitReportDispatch() {
    if (!selectedStationForDispatch || !selectedDriverId) {
        alert('대여소와 담당 기사를 모두 선택해야 지시서를 전송할 수 있습니다.');
        return;
    }
    try {
        await api.post('/admin/reports/dispatch', {
            station_id: selectedStationForDispatch,
            driver_id: selectedDriverId
        });
    } catch (e) {
        alert(e.message || '지시서 전송에 실패했습니다.');
        return;
    }

    var modalEl = document.getElementById('reportDispatchModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();

    alert('고장 수거 지시서가 전송되었습니다.');
    await refreshReports();
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
        window.renderHeader('reports', currentUser);
    }

    try {
        var results = await Promise.all([
            api.get('/station/stations'),
            api.get('/station/districts'),
            api.get('/admin/drivers'),
            api.get('/admin/reports')
        ]);
        allStations = results[0];
        districts = results[1];
        allDrivers = results[2];
        allReports = results[3];
    } catch (e) {
        allStations = []; districts = []; allDrivers = []; allReports = [];
    }

    renderReportColumns();

    var statusFilterList = document.getElementById('statusFilterList');
    if (statusFilterList) {
        statusFilterList.addEventListener('click', function (e) {
            var item = e.target.closest('.dropdown-item');
            if (!item) return;
            e.preventDefault();
            statusFilterList.querySelectorAll('.dropdown-item').forEach(function (el) { el.classList.remove('selected-item'); });
            item.classList.add('selected-item');
            statusFilter = item.getAttribute('data-status');
            renderReportColumns();
        });
    }

    document.getElementById('openDispatchModalBtn').addEventListener('click', function () {
        openDispatchModal();
    });

    document.getElementById('stationDropdownList').addEventListener('click', function (e) {
        var item = e.target.closest('.dropdown-item[data-station-id]');
        if (!item) return;
        e.preventDefault();
        selectDispatchStation(item.getAttribute('data-station-id'));
    });

    document.getElementById('submitReportDispatchBtn').addEventListener('click', submitReportDispatch);
});
