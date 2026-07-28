// admin-dashboard.js (관제 지도 페이지)

function getCurrentUser() {
  var raw = localStorage.getItem('currentUser'); // 통합 세션 키
  var fallback = { id: 501, role: 'admin', name: '김관제', district_id: null };
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      // 다른 권한(일반 회원/기사)으로 로그인했던 세션이 남아있으면 관제 페이지 기본 계정으로 대체
      if (parsed && parsed.role === 'admin') return parsed;
    } catch (e) { }
  }
  return fallback;
}

var currentUser = null;
var allStations = [];
var districts = [];

var filterState = {
  districtId: null,
  dong: null,
  status: null // 'danger' | 'warning' | 'normal' | 'full'
};

var LEVEL_LABEL = { danger: '고갈', warning: '부족', normal: '적정', full: '과포화' };
var LEVEL_BADGE = { danger: 'busy', warning: 'mid', normal: 'ok', full: 'full' };
var LEVEL_ORDER = ['danger', 'warning', 'normal', 'full'];
var KOREAN_TO_LEVEL = { '고갈': 'danger', '부족': 'warning', '적정': 'normal', '과포화': 'full' };

// ── 카카오맵 인스턴스 ────────────────────────────────────────────────────────────
var kakaoMap = null;
var pinOverlays = [];
var hasFitBounds = false;

async function initKakaoMap() {
  var kakao = await window.loadKakaoMaps();
  var container = document.getElementById('kakaoMapContainer');
  kakaoMap = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.9780),
    level: 8
  });
  kakao.maps.event.addListener(kakaoMap, 'idle', applySidebarOcclusion);
  // 지도를 옮기거나 확대/축소한 뒤(idle) "스테이션 현황" 목록을 현재 화면 기준으로 갱신.
  kakao.maps.event.addListener(kakaoMap, 'idle', renderStationList);
  return kakao;
}

function fmtNum(n) { return Number(n).toLocaleString('ko-KR'); }
function getDistrict(id) { return districts.find(function (d) { return d.id === id; }); }
function getStation(id) { return allStations.find(function (s) { return s.station_id === id; }); }

function classifyStation(st) {
  var level = KOREAN_TO_LEVEL[st.stock_level] || 'normal';
  var percent = st.capacity > 0 ? Math.round((st.total_bikes / st.capacity) * 100) : 0;
  return { total: st.total_bikes, percent: percent, level: level };
}

function getFilteredStations() {
  return allStations.filter(function (st) {
    if (filterState.districtId && st.district_id !== filterState.districtId) return false;
    if (filterState.dong && st.neighborhood_name !== filterState.dong) return false;
    if (filterState.status && classifyStation(st).level !== filterState.status) return false;
    return true;
  });
}

// getFilteredStations() 결과 중 현재 지도 화면(viewport)에 실제로 보이는 대여소만 남긴다.
// 지도 핀은 필터 조건에만 반응하고(패닝마다 오버레이를 재생성하지 않기 위해), 좌측
// "스테이션 현황" 목록만 지도를 옮기거나 확대/축소할 때(idle 이벤트)마다 이걸로 다시 그린다.
function getVisibleFilteredStations() {
  var filtered = getFilteredStations();
  if (!kakaoMap || !window.kakao) return filtered;
  var bounds = kakaoMap.getBounds();
  return filtered.filter(function (st) {
    if (!st.lat || !st.lon) return false;
    return bounds.contain(new kakao.maps.LatLng(st.lat, st.lon));
  });
}

function getDongsForDistrict(districtId) {
  var set = new Set();
  allStations.forEach(function (st) {
    if (st.district_id === districtId && st.neighborhood_name) set.add(st.neighborhood_name);
  });
  return Array.from(set).sort();
}

// ── 자치구 / 행정동 드롭다운 (index.html의 자치구 선택 토글과 동일한 패턴) ────────────────────────────────
function fillDistrictDropdown() {
  var listEl = document.getElementById('districtDropdownList');
  listEl.innerHTML = '';

  var options = [{ id: null, name: '전체 자치구' }].concat(
    districts.map(function (d) { return { id: d.id, name: d.name }; })
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

  document.getElementById('selectedDistrictLabel').textContent = filterState.districtId ? (getDistrict(filterState.districtId)?.name || '전체 자치구') : '전체 자치구';
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

  var dongList = getDongsForDistrict(filterState.districtId);
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

// 스테이션 상태 필터칩은 실제 등장하는 상태값만 구성
function renderStatusChips() {
  var container = document.getElementById('mapStatusFilter');
  container.innerHTML = '';

  var levelsPresent = {};
  allStations.forEach(function (st) { levelsPresent[classifyStation(st).level] = true; });

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
      // 모바일: 접혀 있을 땐 탭해서 펼치기만 하고, 펼쳐진 상태에서 옵션을 고르면 적용 후 다시 접힘
      var isMobile = window.innerWidth < 900;
      var isCollapsed = container.classList.contains('chips-collapsed');
      if (isMobile && isCollapsed) { container.classList.remove('chips-collapsed'); return; }
      filterState.status = chip.level;
      onFilterChange();
      if (isMobile) container.classList.add('chips-collapsed');
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
  var stations = getVisibleFilteredStations();
  var html = !stations.length
    ? '<div class="status-empty">현재 지도 화면에 보이는 대여소가 없습니다.</div>'
    : stations.map(function (st) {
      var c = classifyStation(st);
      var district = getDistrict(st.district_id);
      return (
        '<div class="status-row" data-id="' + st.station_id + '">' +
          '<div class="left">' +
            '<span class="badge ' + LEVEL_BADGE[c.level] + '">' + LEVEL_LABEL[c.level] + '</span>' +
            '<div class="info">' +
              '<div class="name">' + st.name + '</div>' +
              '<div class="addr">' + (district ? district.name : '') + (st.neighborhood_name ? ' · ' + st.neighborhood_name : '') + '</div>' +
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
  document.querySelectorAll('.mobile-total-count').forEach(function (el) { el.textContent = countText; });
}

// ── 지도 위 스테이션 핀 ────────────────────────────────
function renderMapPins() {
  if (!kakaoMap || !window.kakao) return;

  pinOverlays.forEach(function (ov) { ov.setMap(null); });
  pinOverlays = [];

  var bounds = new kakao.maps.LatLngBounds();
  var any = false;

  getFilteredStations().forEach(function (st) {
    if (!st.lat || !st.lon) return;
    var c = classifyStation(st);
    var pos = new kakao.maps.LatLng(st.lat, st.lon);

    var el = document.createElement('div');
    el.className = 'kakao-map-pin ' + LEVEL_BADGE[c.level];
    el.setAttribute('data-id', st.station_id);
    el.innerHTML = '<span class="dot">' + c.total + '</span><span class="chip">' + st.name + ' <span class="count">' + c.total + '대</span></span>';
    el.addEventListener('click', function () { openStationDetail(st.station_id); });

    var overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1, xAnchor: 0.5, zIndex: 5 });
    overlay.setMap(kakaoMap);
    pinOverlays.push(overlay);
    bounds.extend(pos);
    any = true;
  });

  // 필터가 바뀔 때마다 지도 시점이 재조정되면 산만하므로, 처음 한 번만 전체 범위에 맞춘다.
  if (!hasFitBounds && any) {
    kakaoMap.setBounds(bounds, 40, 40, 40, 40);
    hasFitBounds = true;
  }
  applySidebarOcclusion();
}

// ── 좌측 패널(데스크탑)이나 하단 시트(모바일)에 가려지는 스테이션 핀은 클릭되지 않도록 처리 (user-dashboard와 동일한 패턴) ────────────────────────────────
function applySidebarOcclusion() {
  var sidebarEl = document.getElementById('sidebar');
  var mapCard = document.querySelector('.map-card');
  var sheetEl = document.getElementById('statusPanel');
  if (!mapCard) return;

  var isDesktopSidebarVisible = !!sidebarEl && window.innerWidth >= 900 && getComputedStyle(sidebarEl).display !== 'none';
  var sidebarRightEdge = isDesktopSidebarVisible ? sidebarEl.getBoundingClientRect().right : 0;

  var isMobileSheetVisible = !!sheetEl && window.innerWidth < 900 &&
    getComputedStyle(sheetEl).display !== 'none' &&
    !sheetEl.classList.contains('collapsed');
  var sheetTopEdge = isMobileSheetVisible ? sheetEl.getBoundingClientRect().top : Infinity;

  document.querySelectorAll('.kakao-map-pin').forEach(function (pin) {
    var pinRect = pin.getBoundingClientRect();
    var occludedByDesktopSidebar = isDesktopSidebarVisible && (pinRect.left + pinRect.width / 2) < sidebarRightEdge;
    var occludedByMobileSheet = isMobileSheetVisible && pinRect.bottom > sheetTopEdge;
    pin.style.visibility = (occludedByDesktopSidebar || occludedByMobileSheet) ? 'hidden' : 'visible';
  });
}
window.addEventListener('resize', applySidebarOcclusion);

function renderAll() {
  renderMapPins();
  renderStationList();
}

function onFilterChange() {
  syncFilterToggles();
  renderAll();
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
  document.getElementById('sdAddr').textContent = (district ? district.name : '') + (st.neighborhood_name ? ' · ' + st.neighborhood_name : '');
  var statusBadge = document.getElementById('sdStatusBadge');
  statusBadge.textContent = LEVEL_LABEL[c.level] + ' (' + c.percent + '%)';
  statusBadge.className = 'badge sd-status-badge ' + LEVEL_BADGE[c.level];
  document.getElementById('sdGeneral').textContent = st.general_bike_cnt + '대';
  document.getElementById('sdSprout').textContent = st.sprout_bike_cnt + '대';
  document.getElementById('sdCapacity').textContent = st.capacity + '면';

  document.getElementById('stationDetailBackdrop').classList.add('show');
  document.getElementById('stationDetailPanel').classList.add('show');
}

function closeStationDetail() {
  document.getElementById('stationDetailBackdrop').classList.remove('show');
  document.getElementById('stationDetailPanel').classList.remove('show');
  currentDetailStationId = null;
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
    window.renderHeader('map', currentUser);
  }

  try {
    await initKakaoMap();
  } catch (e) {
    console.error('[카카오맵] 초기화 실패:', e);
    var el = document.getElementById('kakaoMapContainer');
    if (el) el.innerHTML = '<div class="d-flex align-items-center justify-content-center h-100 text-muted small">지도를 불러오지 못했습니다.</div>';
  }

  try {
    var results = await Promise.all([api.get('/station/stations'), api.get('/station/districts')]);
    allStations = results[0];
    districts = results[1];
  } catch (e) {
    allStations = [];
    districts = [];
  }

  // 실시간 현황 목록 클릭 → 상세 팝업 (지도 핀은 자체 클릭 리스너를 가짐)
  document.addEventListener('click', function (e) {
    var stationRow = e.target.closest('.station-list .status-row');
    if (stationRow) openStationDetail(stationRow.getAttribute('data-id'));
  });

  document.getElementById('sdCloseBtn').addEventListener('click', closeStationDetail);
  document.getElementById('stationDetailBackdrop').addEventListener('click', closeStationDetail);

  document.getElementById('sdWriteOrderBtn').addEventListener('click', function () {
    if (!currentDetailStationId) return;
    window.location.href = 'admin-dispatch.html?writeOrder=1&stationId=' + currentDetailStationId;
  });

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
    setTimeout(applySidebarOcclusion, 300);
  }
  if (statusPanelToggle) {
    statusPanelToggle.addEventListener('click', function (e) {
      e.preventDefault();
      setStatusPanelCollapsed(!statusPanel.classList.contains('collapsed'));
    });
  }
  setStatusPanelCollapsed(statusPanel ? statusPanel.classList.contains('collapsed') : false);
  if (reopenPill) reopenPill.addEventListener('click', function () { setStatusPanelCollapsed(false); });

  // ── 데스크탑 좌측 사이드바 접기/펼치기 ───────────────────────────────────────────
  var dashboardEl = document.querySelector('.dashboard');
  var sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  var sidebarReopenBtn = document.getElementById('sidebarReopenBtn');
  function setSidebarCollapsed(collapsed) {
    dashboardEl.classList.toggle('sidebar-collapsed', collapsed);
    if (sidebarToggleBtn) sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
    setTimeout(applySidebarOcclusion, 260);
  }
  if (sidebarToggleBtn) { sidebarToggleBtn.addEventListener('click', function () { setSidebarCollapsed(!dashboardEl.classList.contains('sidebar-collapsed')); }); }
  if (sidebarReopenBtn) { sidebarReopenBtn.addEventListener('click', function () { setSidebarCollapsed(false); }); }

  syncFilterToggles();
  renderAll();
});
