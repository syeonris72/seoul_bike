// admin_dashboard.js (관제 지도 페이지)

function getCurrentUser() {
  var raw = localStorage.getItem('loggedInUser'); // 통합 세션 키
  var fallback = { id: 501, role: 'seoul_admin', name: '김관제', district_id: null };
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      // 다른 권한(이용자/기사)으로 로그인했던 세션이 남아있으면 관제 페이지 기본 계정으로 대체
      if (parsed && parsed.role === 'seoul_admin') return parsed;
    } catch (e) { }
  }
  return fallback;
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

// ── 자치구 / 행정동 드롭다운 (index.html의 자치구 선택 토글과 동일한 패턴) ────────────────────────────────
function fillDistrictDropdown() {
  var listEl = document.getElementById('districtDropdownList');
  listEl.innerHTML = '';

  var options = [{ id: null, name: '전체 자치구' }].concat(
    DB.district.map(function (d) { return { id: d.id, name: d.name }; })
  );

  options.forEach(function (opt) {
    var isSelected = filterState.districtId === opt.id;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.className = 'dropdown-item' + (isSelected ? ' selected-item' : '');
    a.href = '#';
    a.textContent = opt.name;
    a.addEventListener('click', function (e) {
      e.preventDefault();
      filterState.districtId = opt.id;
      filterState.dong = null;
      onFilterChange();
    });
    li.appendChild(a);
    listEl.appendChild(li);
  });

  document.getElementById('selectedDistrictLabel').textContent = filterState.districtId ? getDistrict(filterState.districtId).name : '전체 자치구';
}

function fillDongDropdown() {
  var listEl = document.getElementById('dongDropdownList');
  var btn = document.getElementById('dongDropdownBtn');
  listEl.innerHTML = '';

  if (!filterState.districtId) {
    btn.disabled = true;
    document.getElementById('selectedDongLabel').textContent = '전체 행정동';
    return;
  }
  btn.disabled = false;

  var dongList = DB.districtDongMap[filterState.districtId] || [];
  var options = [null].concat(dongList);

  options.forEach(function (dongName) {
    var isSelected = filterState.dong === dongName;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.className = 'dropdown-item' + (isSelected ? ' selected-item' : '');
    a.href = '#';
    a.textContent = dongName || '전체 행정동';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      filterState.dong = dongName;
      onFilterChange();
    });
    li.appendChild(a);
    listEl.appendChild(li);
  });

  document.getElementById('selectedDongLabel').textContent = filterState.dong || '전체 행정동';
}

// 스테이션 상태 필터칩은 mock 데이터(DB.station)에서 실제 등장하는 상태값만 구성
function renderStatusChips() {
  var container = document.getElementById('mapStatusFilter');
  container.innerHTML = '';

  var levelsPresent = {};
  DB.station.forEach(function (st) { levelsPresent[classifyStation(st).level] = true; });

  var chips = [{ level: null, label: '전체' }].concat(
    LEVEL_ORDER.filter(function (level) { return levelsPresent[level]; })
      .map(function (level) { return { level: level, label: LEVEL_LABEL[level] }; })
  );

  chips.forEach(function (chip) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-chip' + (chip.level ? ' ' + LEVEL_BADGE[chip.level] : '') + (filterState.status === chip.level ? ' active' : '');
    btn.innerHTML = (chip.level ? '<i></i>' : '') + chip.label;
    btn.addEventListener('click', function () {
      filterState.status = chip.level;
      onFilterChange();
    });
    container.appendChild(btn);
  });
}

function syncFilterToggles() {
  fillDistrictDropdown();
  fillDongDropdown();
  renderStatusChips();
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
var STATUS_LABEL = { '대기': '대기', '진행중': '수행 중', '완료': '완료' };

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
            '<span class="badge ' + (STATUS_BADGE[o.status] || 'waiting') + '">' + STATUS_LABEL[o.status] + '</span>' +
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
    // 자치구별로 미리 계산된 격자 좌표(map_x/map_y)를 사용해 같은 동네 정류소끼리 뭉쳐 보이도록 배치
    var leftPct = Math.min(94, Math.max(4, ((st.map_x - 60) / 680) * 100)) + '%';
    var topPct = Math.min(90, Math.max(8, ((st.map_y - 100) / 400) * 100)) + '%';

    var pin = document.createElement('div');
    pin.className = 'map-pin ' + LEVEL_BADGE[c.level];
    pin.setAttribute('data-id', st.id);
    pin.style.left = leftPct;
    pin.style.top = topPct;
    pin.innerHTML = '<span class="dot"></span><span class="chip">' + st.name + ' <span class="count">' + c.total + '대</span></span>';
    mapContainer.appendChild(pin);
  });
  applySidebarOcclusion();
}

// ── 좌측 패널에 가려지는 스테이션 핀은 클릭되지 않도록 처리 (user_dashboard와 동일한 패턴) ────────────────────────────────
function applySidebarOcclusion() {
  var sidebarEl = document.getElementById('sidebar');
  var mapCard = document.querySelector('.map-card');
  if (!sidebarEl || !mapCard) return;

  var isDesktopSidebarVisible = window.innerWidth >= 900 && getComputedStyle(sidebarEl).display !== 'none';
  var sidebarRightEdge = isDesktopSidebarVisible ? sidebarEl.getBoundingClientRect().right : 0;

  document.querySelectorAll('.map-pin').forEach(function (pin) {
    if (!isDesktopSidebarVisible) { pin.classList.remove('occluded'); return; }
    var pinRect = pin.getBoundingClientRect();
    var pinCenterX = pinRect.left + pinRect.width / 2;
    pin.classList.toggle('occluded', pinCenterX < sidebarRightEdge);
  });
}
window.addEventListener('resize', applySidebarOcclusion);

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

  var c = classifyStation(st);
  document.getElementById('sdTitle').textContent = st.name;
  document.getElementById('sdAddr').textContent = (district ? district.name : '') + ' · ' + st.neighborhood_name;
  var statusBadge = document.getElementById('sdStatusBadge');
  statusBadge.textContent = LEVEL_LABEL[c.level] + ' (' + c.percent + '%)';
  statusBadge.className = 'badge sd-status-badge ' + LEVEL_BADGE[c.level];
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

// ── 지시서 상세 팝업 ────────────────────────────────
function openOrderDetail(id) {
  var o = DB.dispatch_order.find(function (order) { return order.id === id; });
  if (!o) return;
  var from = getStation(o.from_station_id), to = getStation(o.to_station_id);
  var driver = DB.account.find(function (a) { return a.id === o.driver_id; });
  var STATUS_BADGE = { '대기': 'waiting', '진행중': 'progress', '완료': 'done' };

  document.getElementById('odTitle').textContent = (from ? from.name : '알 수 없음') + ' → ' + (to ? to.name : '알 수 없음');
  document.getElementById('odMeta').textContent = (o.ordered_at ? o.ordered_at.slice(0, 16).replace('T', ' ') : '') + (isCrossDistrict(o) ? ' · 긴급(구간 간 이동)' : '');
  var statusBadge = document.getElementById('odStatusBadge');
  statusBadge.textContent = STATUS_LABEL[o.status] || o.status;
  statusBadge.className = 'badge sd-status-badge ' + (STATUS_BADGE[o.status] || 'waiting');
  document.getElementById('odGeneral').textContent = o.general_qty + '대';
  document.getElementById('odSprout').textContent = o.sprout_qty + '대';
  document.getElementById('odDriver').textContent = driver ? driver.name + ' 기사' : '담당자 미배정';

  document.getElementById('orderDetailBackdrop').classList.add('show');
  document.getElementById('orderDetailPanel').classList.add('show');
}

function closeOrderDetail() {
  document.getElementById('orderDetailBackdrop').classList.remove('show');
  document.getElementById('orderDetailPanel').classList.remove('show');
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

  // 스테이션 리스트/핀 클릭 → 상세 팝업, 지시서 리스트 클릭 → 지시서 상세 팝업
  document.addEventListener('click', function (e) {
    var pin = e.target.closest('.map-pin');
    var stationRow = e.target.closest('.station-list .status-row');
    var orderRow = e.target.closest('.dispatch-pane-list .status-row');

    if (pin) openStationDetail(parseInt(pin.getAttribute('data-id'), 10));
    else if (stationRow) openStationDetail(parseInt(stationRow.getAttribute('data-id'), 10));
    else if (orderRow) openOrderDetail(parseInt(orderRow.getAttribute('data-id'), 10));
  });

  document.getElementById('sdCloseBtn').addEventListener('click', closeStationDetail);
  document.getElementById('stationDetailBackdrop').addEventListener('click', closeStationDetail);
  document.getElementById('odCloseBtn').addEventListener('click', closeOrderDetail);
  document.getElementById('orderDetailBackdrop').addEventListener('click', closeOrderDetail);

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
    // 모바일 하단 시트가 펼쳐진 동안에는 겹쳐 보이는 우측 하단 필터 칩을 함께 숨김
    var filterPanel = document.getElementById('mapStatusFilter');
    if (filterPanel) filterPanel.classList.toggle('hidden-behind-sheet', !collapsed);
  }
  if (statusPanelToggle) {
    statusPanelToggle.addEventListener('click', function (e) {
      e.preventDefault();
      setStatusPanelCollapsed(!statusPanel.classList.contains('collapsed'));
    });
  }
  setStatusPanelCollapsed(statusPanel ? statusPanel.classList.contains('collapsed') : false);
  if (reopenPill) reopenPill.addEventListener('click', function () { setStatusPanelCollapsed(false); });

  syncFilterToggles();
  renderAll();
});
