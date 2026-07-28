// driver-dashboard.js (지시서 목록 페이지)

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

var currentUser = null;
var statusFilter = 'all'; // 'all' | '대기' | '진행중' | '완료'
var scannedByOrder = {};  // { [taskKey]: ['BIKE-0001', ...] }
var currentScanTaskKey = null;
var scanForceInputView = false; // 스캔/입력이 다 끝난 뒤 "다시 스캔하기"를 눌러 목록 수정 화면으로 돌아온 상태인지
var scanModalOpenKey = null; // QR/ID 스캔 팝업이 열려 있는 동안, 그 뒤에 보이는 카드의 "지시 수행 중" 버튼을 회색으로 표시하기 위한 키

var allStations = [];
var allOrders = []; // /driver/orders가 이미 나(driver_id) 기준으로 필터링해서 내려준다

function getStation(id) { return allStations.find(function (s) { return s.station_id === id; }); }
var STATUS_LABEL = { '대기': '대기', '진행중': '수행 중', '완료': '완료' };

async function refreshOrders() {
    try {
        allOrders = await api.get('/driver/orders');
    } catch (e) { /* 조회 실패 시 이전 목록 유지 */ }
}

// dispatch를 작업 목록으로 정규화 (고장 신고는 이용자만 접수 가능하며, 관리자가
// "고장 자전거 수거" 지시서(order_type === '고장수거')로 변환해 기사에게 배정한다)
function getMyTasks() {
    var tasks = [];

    allOrders.forEach(function (o) {
        tasks.push({
            key: 'dispatch-' + o.id,
            type: 'dispatch',
            raw: o,
            status: o.status,
            // "긴급" 여부는 관리자가 지시서 작성 시 켠 긴급 토글(is_emergency)만을 기준으로 한다.
            urgent: o.status !== '완료' && !!o.is_emergency,
            // 관리자가 지시서 작성 시 "고장 자전거 수거"로 지정한 지시서(order_type)는 고장 수거 취급한다.
            brokenPickup: o.order_type === '고장수거',
            qty: o.general_qty + o.sprout_qty,
            time: o.ordered_at
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

// 긴급 / 고장 수거 / 일반 3개 그룹으로 항상 분리 (긴급 건은 유형과 무관하게 긴급 박스로)
// 고장 수거 그룹에는 관리자가 "고장 자전거 수거"로 지정한 지시서(order_type === '고장수거')가 들어간다.
function groupTasksByColumn(tasks) {
    var groups = { urgent: [], report: [], dispatch: [] };
    tasks.forEach(function (t) {
        if (t.urgent) groups.urgent.push(t);
        else if (t.brokenPickup) groups.report.push(t);
        else groups.dispatch.push(t);
    });
    return groups;
}

var STATUS_FILTER_LABEL = { all: '전체', '대기': '대기', '진행중': '수행 중', '완료': '완료' };

function updateStatusCounts() {
    var all = getMyTasks();
    var counts = {
        all: all.length,
        '대기': all.filter(function (t) { return t.status === '대기'; }).length,
        '진행중': all.filter(function (t) { return t.status === '진행중'; }).length,
        '완료': all.filter(function (t) { return t.status === '완료'; }).length
    };
    document.getElementById('count-all').textContent = counts.all;
    document.getElementById('count-waiting').textContent = counts['대기'];
    document.getElementById('count-doing').textContent = counts['진행중'];
    document.getElementById('count-done').textContent = counts['완료'];

    var statusSelectedLabel = document.getElementById('statusSelectedLabel');
    var statusSelectedCount = document.getElementById('statusSelectedCount');
    if (statusSelectedLabel) statusSelectedLabel.textContent = STATUS_FILTER_LABEL[statusFilter];
    if (statusSelectedCount) statusSelectedCount.textContent = counts[statusFilter];
}

function getActiveDispatch() {
    return allOrders.find(function (o) { return o.status === '진행중'; });
}

function hasActiveDispatch() {
    return !!getActiveDispatch();
}

function taskCardHtml(t) {
    var badgeClass = t.status === '완료' ? 'bg-success-subtle text-success' : (t.status === '진행중' ? 'bg-primary-subtle text-primary' : 'bg-secondary-subtle text-secondary');
    var scannedCount = (scannedByOrder[t.key] || []).length;

    var from = getStation(t.raw.from_station_id), to = getStation(t.raw.to_station_id);
    var orderLabel = 'ORD-' + new Date(t.time).getFullYear() + '-' + String(t.raw.id).padStart(3, '0');
    // 고장 신고 관리 페이지에서 발송된 고장 수거 지시서는 출발지=도착지(수거 대상 대여소 1곳)이므로 화살표 없이 대여소명만 표시한다.
    var title = (from && t.raw.from_station_id === t.raw.to_station_id)
        ? from.name
        : (from ? from.name : '알 수 없음') + ' <i class="bi bi-arrow-right text-muted fs-6"></i> ' + (to ? to.name : '알 수 없음');
    var sub = '일반 ' + t.raw.general_qty + '대 · 새싹 ' + t.raw.sprout_qty + '대';
    var timeStr = t.time ? new Date(t.time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

    var footer = '';
    if (t.status === '대기') {
        var blockedByActiveOrder = hasActiveDispatch();
        footer = '<button type="button" class="btn btn-start w-100 fw-bold py-3 rounded-3" ' + (blockedByActiveOrder ? 'disabled title="수행 중인 지시서를 완료한 후 처리할 수 있습니다."' : '') + ' onclick="startTask(\'' + t.key + '\')"><i class="bi bi-play-fill me-2"></i>지시 시작</button>';
    } else if (t.status === '진행중') {
        // 완료 처리는 팝업 안(완료 버튼)에서만 하고, 카드에는 항상 "지시 수행 중"만 보여준다.
        // 이 지시서의 QR/ID 스캔 팝업이 열려 있는 동안에는(=팝업 뒤에 보이는 동안) 회색으로, 닫히면 다시 초록색으로 표시한다.
        var isScanOpenForThis = scanModalOpenKey === t.key;
        footer = '<button type="button" class="btn ' + (isScanOpenForThis ? 'btn-scan-inactive' : 'btn-indigo') + ' w-100 fw-bold py-3 rounded-3" onclick="openScanModal(\'' + t.key + '\')"><i class="bi bi-hourglass-split me-2"></i>지시 수행 중 (' + scannedCount + '/' + t.qty + ')</button>';
    }

    return (
        '<div class="order-card-item' + (t.urgent ? ' urgent' : '') + (t.brokenPickup ? ' type-report' : '') + '">' +
            '<div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">' +
                '<div>' +
                    '<span class="text-muted small fw-bold me-2">' + orderLabel + '</span>' +
                    (t.urgent ? '<span class="badge rounded-pill bg-danger-subtle text-danger px-2 py-1">긴급</span>' : '') +
                    (t.brokenPickup ? '<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis px-2 py-1">고장 수거</span>' : '') +
                '</div>' +
                '<span class="badge badge-dot rounded-pill ' + badgeClass + ' text-nowrap">' + STATUS_LABEL[t.status] + '</span>' +
            '</div>' +
            '<h5 class="fw-bold mb-3 lh-base">' + title + '</h5>' +
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

// startTask/completeTask 중복 클릭 방지용 플래그. allOrders는 요청이 끝나야 갱신되므로
// hasActiveDispatch()만으로는 연속 클릭 사이의 경쟁 조건을 막을 수 없다
// (서버도 동일하게 막아주지만, 클라이언트에서 먼저 막아 불필요한 요청/에러 알림을 줄인다).
var _taskActionInFlight = false;

async function startTask(key) {
    if (_taskActionInFlight) return;
    var id = parseInt(key.split('-')[1], 10);
    if (hasActiveDispatch()) {
        alert('현재 수행 중인 지시서가 있어 새로운 지시서를 시작할 수 없습니다. 수행 중인 지시서를 완료한 후 다시 시도해주세요.');
        return;
    }
    _taskActionInFlight = true;
    try {
        await api.patch('/driver/orders/' + id, { action: 'start' });
    } catch (e) {
        alert(e.message || '지시 시작에 실패했습니다.');
        return;
    } finally {
        _taskActionInFlight = false;
    }
    await refreshOrders();
    renderTasks();
}

async function completeTask(key) {
    if (_taskActionInFlight) return;
    var id = parseInt(key.split('-')[1], 10);
    _taskActionInFlight = true;
    try {
        await api.patch('/driver/orders/' + id, { action: 'complete' });
    } catch (e) {
        alert(e.message || '지시 완료 처리에 실패했습니다.');
        return;
    } finally {
        _taskActionInFlight = false;
    }
    await refreshOrders();
    renderTasks();
}

function openScanModal(key) {
    currentScanTaskKey = key;
    scanForceInputView = false;
    scanModalOpenKey = key;
    renderScanModal();
    renderTasks();
    var modalEl = document.getElementById('scanModal');
    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function renderScanModal() {
    var task = getMyTasks().find(function (t) { return t.key === currentScanTaskKey; });
    if (!task) return;
    var scanned = scannedByOrder[currentScanTaskKey] || [];
    var done = scanned.length >= task.qty;

    document.getElementById('scanProgressText').textContent = scanned.length + ' / ' + task.qty;
    document.getElementById('scannedList').innerHTML = scanned.map(function (bikeId, idx) {
        return '<div class="scanned-item"><span>' + bikeId + '</span><button type="button" onclick="removeScannedBike(' + idx + ')"><i class="bi bi-x-lg"></i></button></div>';
    }).join('') || '<p class="text-muted small text-center mb-0">추가된 따릉이가 없습니다.</p>';

    // 지시받은 수량을 모두 스캔/입력하면 스캔 UI 대신 완료/다시 스캔 버튼을 보여준다.
    // "다시 스캔하기"를 누른 경우(scanForceInputView)에는 다 채워졌더라도 스캔 UI를 유지해 목록을 정리할 수 있게 한다.
    var showInputArea = !done || scanForceInputView;
    var inputArea = document.getElementById('scanInputArea');
    var doneActions = document.getElementById('scanDoneActions');
    if (inputArea) inputArea.classList.toggle('d-none', !showInputArea);
    if (doneActions) doneActions.classList.toggle('d-none', showInputArea);

    syncScanCameraForCurrentView();
}

// 현재 스캔 UI가 화면에 보이는 상태일 때만(완료/다시 스캔 버튼 화면이 아닐 때만) 모바일 카메라를 켜둔다.
function syncScanCameraForCurrentView() {
    var scanModalEl = document.getElementById('scanModal');
    var inputArea = document.getElementById('scanInputArea');
    var visible = inputArea && !inputArea.classList.contains('d-none') && scanModalEl && scanModalEl.classList.contains('show');
    if (visible) {
        if (isMobileViewport() && !scanQrCamera) startScanCamera();
    } else {
        stopScanCamera();
    }
}

function removeScannedBike(idx) {
    var scanned = scannedByOrder[currentScanTaskKey] || [];
    scanned.splice(idx, 1);
    scannedByOrder[currentScanTaskKey] = scanned;
    renderScanModal();
    renderTasks();
}

// 수동 입력(데스크탑)과 카메라 스캔(모바일) 양쪽에서 공통으로 사용하는 추가 로직
function addScannedBike(bikeId) {
    bikeId = (bikeId || '').trim();
    if (!bikeId) return false;
    var task = getMyTasks().find(function (t) { return t.key === currentScanTaskKey; });
    if (!task) return false;
    var scanned = scannedByOrder[currentScanTaskKey] || [];
    if (scanned.indexOf(bikeId) !== -1) return false;
    if (scanned.length >= task.qty) { alert('지시받은 수량만큼 이미 스캔되었습니다.'); return false; }
    scanned.push(bikeId);
    scannedByOrder[currentScanTaskKey] = scanned;
    scanForceInputView = false; // 다시 가득 채워지면 완료/다시 스캔 버튼 화면으로 자연스럽게 돌아가도록 초기화
    renderScanModal();
    renderTasks();
    return true;
}

// ── 모바일 전용 QR 카메라 스캔 ──────────────────────────────────────────────
var scanQrCamera = null;

// 아이패드 정도 크기(1400px)까지는 카메라 QR 스캔을 쓰고, 그보다 넓은 화면(데스크탑)에서는 ID 직접 입력만 허용한다.
function isMobileViewport() {
    return window.matchMedia('(max-width: 1399.98px)').matches;
}

function startScanCamera() {
    if (!isMobileViewport() || typeof Html5Qrcode === 'undefined') return;
    var statusEl = document.getElementById('scanCameraStatus');
    scanQrCamera = new Html5Qrcode('scanQrReader');
    scanQrCamera.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        function (decodedText) {
            var added = addScannedBike(decodedText);
            if (statusEl) {
                statusEl.textContent = added ? ('스캔 완료: ' + decodedText) : (decodedText + ' 은(는) 이미 스캔되었거나 추가할 수 없습니다.');
                statusEl.className = 'scan-camera-status ' + (added ? 'success' : 'error');
            }
        },
        function () { /* 프레임마다 QR을 못 찾는 경우는 무시 */ }
    ).catch(function () {
        if (statusEl) {
            statusEl.textContent = '카메라를 사용할 수 없습니다. 카메라 권한을 확인해 주세요.';
            statusEl.className = 'scan-camera-status error';
        }
        // 시작에 실패한 스캐너는 실행 중이 아니므로, stop() 호출 대상에서 제외되도록 참조를 비워둔다.
        scanQrCamera = null;
    });
}

function stopScanCamera() {
    if (!scanQrCamera) return;
    var camera = scanQrCamera;
    scanQrCamera = null;
    try {
        camera.stop().catch(function () { }).finally(function () { camera.clear(); });
    } catch (e) {
        // 스캐너가 이미 정지된 상태 등에서 stop()이 동기적으로 예외를 던지는 경우를 방어한다.
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    var authRaw = localStorage.getItem('currentUser');
    var authUser = authRaw ? JSON.parse(authRaw) : null;
    if (!authUser || authUser.role !== 'driver' || !localStorage.getItem('accessToken')) {
        document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
        return;
    }

    currentUser = getCurrentUser();

    if (window.renderHeader) {
        window.renderHeader('tasks', currentUser);
    }

    try {
        allStations = await api.get('/station/stations');
    } catch (e) { allStations = []; }
    await refreshOrders();

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
            renderTasks();
        });
    }

    document.getElementById('scanAddBtn').addEventListener('click', function () {
        var input = document.getElementById('scanBikeIdInput');
        if (addScannedBike(input.value)) input.value = '';
    });

    document.getElementById('scanCompleteBtn').addEventListener('click', function () {
        var key = currentScanTaskKey;
        var modalEl = document.getElementById('scanModal');
        bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        completeTask(key);
    });

    document.getElementById('scanRescanBtn').addEventListener('click', function () {
        scanForceInputView = true;
        renderScanModal();
    });

    var scanModalEl = document.getElementById('scanModal');
    if (scanModalEl) {
        scanModalEl.addEventListener('shown.bs.modal', syncScanCameraForCurrentView);
        scanModalEl.addEventListener('hidden.bs.modal', function () {
            stopScanCamera();
            scanForceInputView = false;
            scanModalOpenKey = null;
            renderTasks();
        });
    }

    renderTasks();
});
