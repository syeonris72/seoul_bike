// admin_dashboard.js (관제 지도 페이지)

function getCurrentUser() {
  var raw = localStorage.getItem('loggedInUser'); // 통합 세션 키
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { }
  }
  return { id: 501, role: 'seoul_admin', name: '김관제', district_id: null };
}

var currentUser = null;
var activeLeftTab = 'map';

var filterState = {
  districtId: null,
  dong: null,
  status: null // 'danger' | 'warning' | 'normal' | 'full'
};

var LEVEL_LABEL = { danger: '고갈 심각', warning: '부족 경고', normal: '적정', full: '과포화' };
var LEVEL_BADGE = { danger: 'busy', warning: 'mid', normal: 'ok', full: 'full' };
var LEVEL_ORDER = ['danger', 'warning', 'normal', 'full'];

function fmtNum(n) { return Number(n).toLocaleString('ko-KR'); }
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

function getFilteredStations() {
  return DB.station.filter(function (st) {
    if (filterState.districtId && st.district_id !== filterState.districtId) return false;
    if (filterState.dong && st.neighborhood_name !== filterState.dong) return false;
    if (filterState.status && classifyStation(st).level !== filterState.status) return false;
    return true;
  });
}

function getFilteredDispatchOrders() {
  function matchesRegion(st) {
    if (!st) return false;
    if (filterState.districtId && st.district_id !== filterState.districtId) return false;
    if (filterState.dong && st.neighborhood_name !== filterState.dong) return false;
    return true;
  }
  return DB.dispatch_order.filter(function (o) {
    var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
    if (!matchesRegion(from) && !matchesRegion(to)) return false;
    if (filterState.status) {
      var fromLevel = from ? classifyStation(from).level : null;
      var toLevel = to ? classifyStation(to).level : null;
      if (fromLevel !== filterState.status && toLevel !== filterState.status) return false;
    }
    return true;
  });
}

// ── 자치구 / 행정동 / 상태 토글 ────────────────────────────────
function fillDistrictSelect() {
  var selectEl = document.getElementById('filterDistrict');
  selectEl.innerHTML = '';
  var allOpt = document.createElement('option');
  allOpt.value = ''; allOpt.textContent = '전체 자치구';
  selectEl.appendChild(allOpt);
  DB.district.forEach(function (d) {
    var opt = document.createElement('option');
    opt.value = d.id; opt.textContent = d.name;
    selectEl.appendChild(opt);
  });
  selectEl.value = filterState.districtId || '';
}

function fillDongSelect() {
  var selectEl = document.getElementById('filterDong');
  selectEl.innerHTML = '';
  var allOpt = document.createElement('option');
  allOpt.value = ''; allOpt.textContent = '전체 행정동';
  selectEl.appendChild(allOpt);

  if (filterState.districtId && DB.districtDongMap[filterState.districtId]) {
    DB.districtDongMap[filterState.districtId].forEach(function (dongName) {
      var opt = document.createElement('option');
      opt.value = dongName; opt.textContent = dongName;
      selectEl.appendChild(opt);
    });
    selectEl.disabled = false;
  } else {
    selectEl.disabled = true;
  }
  selectEl.value = filterState.dong || '';
}

// 스테이션 상태 옵션은 mock 데이터(DB.station)에서 실제 등장하는 상태값만 구성
function fillStatusSelect() {
  var selectEl = document.getElementById('filterStatus');
  selectEl.innerHTML = '';
  var allOpt = document.createElement('option');
  allOpt.value = ''; allOpt.textContent = '전체 상태';
  selectEl.appendChild(allOpt);

  var levelsPresent = {};
  DB.station.forEach(function (st) { levelsPresent[classifyStation(st).level] = true; });

  LEVEL_ORDER.forEach(function (level) {
    if (!levelsPresent[level]) return;
    var opt = document.createElement('option');
    opt.value = level; opt.textContent = LEVEL_LABEL[level];
    selectEl.appendChild(opt);
  });
  selectEl.value = filterState.status || '';
}

function syncFilterToggles() {
  fillDistrictSelect();
  fillDongSelect();
  fillStatusSelect();
}

// ── 좌측 패널: 지도현황 탭 ────────────────────────────────
function renderStationList() {
  var stations = getFilteredStations();
  var html = !stations.length
    ? '<div class="status-empty">해당 조건의 스테이션이 없습니다.</div>'
    : stations.map(function (st) {
      var c = classifyStation(st);
      var district = getDistrict(st.district_id);
      return (
        '<div class="status-row" data-id="' + st.id + '">' +
          '<div class="left">' +
            '<span class="badge ' + LEVEL_BADGE[c.level] + '">' + LEVEL_LABEL[c.level] + '</span>' +
            '<div class="info">' +
              '<div class="name">' + st.name + '</div>' +
              '<div class="addr">' + (district ? district.name : '') + ' · ' + st.neighborhood_name + ' · 일반 ' + st.general_bike_count + '대 + 새싹 ' + st.sprout_bike_count + '대</div>' +
            '</div>' +
          '</div>' +
          '<div class="right">' +
            '<div class="count">' + c.total + '대 <span>/ ' + st.capacity + '면</span></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

  document.querySelectorAll('.station-list').forEach(function (el) { el.innerHTML = html; });
  var countText = '· ' + stations.length + '곳';
  document.querySelectorAll('.station-count-label').forEach(function (el) { el.textContent = countText; });
}

// ── 좌측 패널: 지시서 탭 ────────────────────────────────
function renderDispatchPane() {
  var orders = getFilteredDispatchOrders();
  var STATUS_BADGE = { '대기': 'waiting', '진행중': 'progress', '완료': 'done' };

  var html = !orders.length
    ? '<div class="status-empty">해당 조건의 지시서가 없습니다.</div>'
    : orders.map(function (o) {
      var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
      var driver = DB.account.find(function (a) { return a.id === o.driver_id; });
      return (
        '<div class="status-row" data-id="' + o.id + '">' +
          '<div class="left">' +
            '<span class="badge ' + (STATUS_BADGE[o.status] || 'waiting') + '">' + o.status + '</span>' +
            '<div class="info">' +
              '<div class="name">' + (from ? from.name : '알 수 없음') + ' → ' + (to ? to.name : '알 수 없음') + '</div>' +
              '<div class="addr">일반 ' + o.general_qty + '대 · 새싹 ' + o.sprout_qty + '대 · ' + (driver ? '담당: ' + driver.name : '담당자 미배정') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

  document.querySelectorAll('.dispatch-pane-list').forEach(function (el) { el.innerHTML = html; });
  var countText = '· ' + orders.length + '건';
  document.querySelectorAll('.dispatch-count-label').forEach(function (el) { el.textContent = countText; });
  document.querySelectorAll('.dispatch-count-badge').forEach(function (el) { el.textContent = orders.length; });
}

// ── 지도 위 스테이션 핀 ────────────────────────────────
function renderMapPins() {
  var mapContainer = document.querySelector('.map-card');
  if (!mapContainer) return;
  mapContainer.querySelectorAll('.map-pin').forEach(function (p) { p.remove(); });

  getFilteredStations().forEach(function (st) {
    var c = classifyStation(st);
    var leftPct = (10 + (st.id * 37) % 80) + '%';
    var topPct = (12 + (st.id * 41) % 76) + '%';

    var pin = document.createElement('div');
    pin.className = 'map-pin ' + LEVEL_BADGE[c.level];
    pin.setAttribute('data-id', st.id);
    pin.style.left = leftPct;
    pin.style.top = topPct;
    pin.innerHTML = '<span class="dot"></span><span class="chip">' + st.name + ' <span class="count">' + c.total + '대</span></span>';
    mapContainer.appendChild(pin);
  });
}

function renderAll() {
  renderStationList();
  renderDispatchPane();
  renderMapPins();
  var totalText = '· ' + getFilteredStations().length + '곳';
  document.querySelectorAll('.mobile-total-count').forEach(function (el) { el.textContent = totalText; });
}

function onFilterChange() {
  syncFilterToggles();
  renderAll();
}

// ── 좌측 패널 탭 전환 (지도현황 / 지시서) ────────────────────────────────
function setActiveLeftTab(tab) {
  activeLeftTab = tab;
  document.querySelectorAll('.left-tab-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  document.querySelectorAll('.left-pane-map').forEach(function (el) { el.style.display = tab === 'map' ? '' : 'none'; });
  document.querySelectorAll('.left-pane-dispatch').forEach(function (el) { el.style.display = tab === 'dispatch' ? '' : 'none'; });
}

// ── 스테이션 상세 팝업 ────────────────────────────────
var currentDetailStationId = null;

function openStationDetail(id) {
  var st = getStation(id);
  if (!st) return;
  currentDetailStationId = id;
  var district = getDistrict(st.district_id);

  document.getElementById('sdTitle').textContent = st.name;
  document.getElementById('sdAddr').textContent = (district ? district.name : '') + ' · ' + st.neighborhood_name;
  document.getElementById('sdGeneral').textContent = st.general_bike_count + '대';
  document.getElementById('sdSprout').textContent = st.sprout_bike_count + '대';
  document.getElementById('sdCapacity').textContent = st.capacity + '면';

  document.getElementById('stationDetailBackdrop').classList.add('show');
  document.getElementById('stationDetailPanel').classList.add('show');
}

function closeStationDetail() {
  document.getElementById('stationDetailBackdrop').classList.remove('show');
  document.getElementById('stationDetailPanel').classList.remove('show');
  currentDetailStationId = null;
}

document.addEventListener('DOMContentLoaded', function () {
  currentUser = getCurrentUser();

  if (window.renderHeader) {
    window.renderHeader('map', currentUser);
  }

  // 좌측 패널 탭 전환 (데스크탑/모바일 버튼 모두 동일하게 동작)
  document.querySelectorAll('.left-tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setActiveLeftTab(btn.getAttribute('data-tab')); });
  });

  // 지역/상태 토글
  document.getElementById('filterDistrict').addEventListener('change', function () {
    filterState.districtId = this.value ? parseInt(this.value, 10) : null;
    filterState.dong = null;
    onFilterChange();
  });
  document.getElementById('filterDong').addEventListener('change', function () {
    filterState.dong = this.value || null;
    onFilterChange();
  });
  document.getElementById('filterStatus').addEventListener('change', function () {
    filterState.status = this.value || null;
    onFilterChange();
  });

  // 스테이션 리스트/핀 클릭 → 상세 팝업
  document.addEventListener('click', function (e) {
    var pin = e.target.closest('.map-pin');
    var row = e.target.closest('.station-list .status-row');
    var targetId = null;
    if (pin) targetId = pin.getAttribute('data-id');
    else if (row) targetId = row.getAttribute('data-id');
    if (targetId) openStationDetail(parseInt(targetId, 10));
  });

  document.getElementById('sdCloseBtn').addEventListener('click', closeStationDetail);
  document.getElementById('stationDetailBackdrop').addEventListener('click', closeStationDetail);

  // 지시서 쓰기 → 지시서 관리 페이지로 이동, 선택한 스테이션을 출발지로 자동 지정
  document.getElementById('sdWriteOrderBtn').addEventListener('click', function () {
    if (!currentDetailStationId) return;
    window.location.href = 'admin_dispatch.html?writeOrder=1&stationId=' + currentDetailStationId;
  });

  // 모바일 바텀시트 열기/닫기
  var statusPanel = document.getElementById('statusPanel');
  var statusPanelToggle = document.getElementById('statusPanelToggle');
  var reopenPill = document.getElementById('statusReopenPill');
  function setStatusPanelCollapsed(collapsed) {
    if (statusPanel) statusPanel.classList.toggle('collapsed', collapsed);
    if (statusPanelToggle) statusPanelToggle.setAttribute('aria-expanded', String(!collapsed));
    if (reopenPill) reopenPill.classList.toggle('show', collapsed);
  }
  if (statusPanelToggle) {
    statusPanelToggle.addEventListener('click', function (e) {
      e.preventDefault();
      setStatusPanelCollapsed(!statusPanel.classList.contains('collapsed'));
    });
  }
  if (reopenPill) reopenPill.addEventListener('click', function () { setStatusPanelCollapsed(false); });

  syncFilterToggles();
  renderAll();
});
