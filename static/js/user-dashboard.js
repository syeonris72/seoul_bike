// user-dashboard.js
// 일반 회원용 대시보드(지도 + 실시간 대여소 현황 + 즐겨찾기 + 대여소 상세/고장신고) 로직.
// api.js를 통해 백엔드에서 대여소/즐겨찾기 데이터를 받아와 지도 핀과 목록을 그리고, 각종 팝업/시트의 열고 닫기를 담당한다.
(function () {

  // ── 로그인 여부 확인: 로그인하지 않았거나 'user' 권한이 아니면(예: driver/admin 세션이 남아있는 경우)
  // 헤더/본문 없이 안내 메시지만 표시한다. role까지 확인하지 않으면, 다른 역할로 로그인된 상태에서
  // 이 페이지에 들어왔을 때 본문은 그대로 렌더링되면서 헤더만 조용히 비어버리는 문제가 있었다.
  var loggedInRaw = localStorage.getItem('currentUser');
  var loggedInUser = loggedInRaw ? JSON.parse(loggedInRaw) : null;
  if (!loggedInUser || loggedInUser.role !== 'user' || !localStorage.getItem('accessToken')) {
    document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
    return;
  }

  // 로그인한 사용자의 id를 그대로 사용 (즐겨찾기/고장신고 등 모든 데이터를 이 사용자 기준으로 조회·저장)
  var CURRENT_USER_ID = loggedInUser.id;

  // ── 공용 상단 헤더 렌더링 ────────────────────────────────────────────────────────
  window.onload = function () {
    if (typeof renderHeader === 'function') {
      renderHeader('dashboard', loggedInUser);
    }
  };

  // ── 대여소/즐겨찾기 데이터: 백엔드에서 비동기로 가져와 화면에서 쓰기 좋은 형태로 변환 ─────────────
  var stations = [];
  var favoriteStationIds = new Set();

  // 서울시청 좌표 - 위치 권한을 거부했거나 위치 조회에 실패했을 때 쓰는 기준점
  // (kakaoMap 기본 center와 동일한 값)
  var FALLBACK_ORIGIN = { lat: 37.5665, lon: 126.9780 };

  // 두 좌표 간 거리(m) - serving/mapping.py의 haversine_km과 동일한 공식
  function haversineM(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dPhi = (lat2 - lat1) * Math.PI / 180;
    var dLambda = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // 브라우저 위치 권한을 물어보고 좌표를 가져온다. 거부/타임아웃/미지원이면
  // FALLBACK_ORIGIN(서울시청)으로 조용히 대체 - 거리 표시가 아예 안 뜨는 것보다 낫다.
  function getOriginCoords() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(FALLBACK_ORIGIN); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
        function () { resolve(FALLBACK_ORIGIN); },
        { timeout: 5000 }
      );
    });
  }

  // 대여(rent) 관점의 여유/보통/혼잡 - 백엔드 stock_level(고갈/부족/적정/과포화, 정원 대비
  // 비율 기준 - serving/station_stock.py 참고)을 그대로 매핑한다. 이전 버전은 "과포화"(자전거가
  // 가득 차 대여하기엔 오히려 최상인 상태)를 "고갈"과 똑같이 "혼잡"으로 묶어버리는
  // 반대 방향 버그가 있었다 - 빌릴 자전거가 넘치는 대여소가 "혼잡"으로 뜨는 건 렌더 입장에서
  // 말이 안 된다. 자전거 수가 아니라 대여 난이도 기준으로 재정렬한다.
  var LEVEL_TO_RENT_STATUS = { '고갈': 'busy', '부족': 'mid', '적정': 'ok', '과포화': 'ok' };

  function mapStation(s, origin) {
    var dist = (s.lat && s.lon) ? haversineM(origin.lat, origin.lon, s.lat, s.lon) : null;

    var totalBikes = s.general_bike_cnt + s.sprout_bike_cnt;
    var stLabel = LEVEL_TO_RENT_STATUS[s.stock_level] || "ok";

    var addr = s.neighborhood_name ? (s.district_name || "") + " · " + s.neighborhood_name : (s.district_name || "");

    return {
      id: s.station_id,
      name: s.name,
      addr: addr,
      distanceM: dist,
      status: stLabel,
      count: totalBikes,
      generalCount: s.general_bike_cnt,
      sproutCount: s.sprout_bike_cnt,
      capacity: s.capacity,
      lat: s.lat,
      lon: s.lon,
      districtId: s.district_id
    };
  }

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
    // 지도를 옮기거나 확대/축소한 뒤(idle) "실시간 대여소 현황" 목록을 현재 화면 기준으로 갱신.
    kakao.maps.event.addListener(kakaoMap, 'idle', renderVisibleList);
    return kakao;
  }

  var statusRank = { ok: 0, mid: 1, busy: 2 };
  var statusLabel = { ok: "여유", mid: "보통", busy: "혼잡" };

  // ── 목록/지도 공통 상태값 ────────────────────────────────────────────────────────
  var tabButtons = document.querySelectorAll(".status-tabs button"); // 거리순 / 여유순 정렬 탭
  var currentSort = "distance";       // 현재 정렬 기준
  var currentFilter = "all";          // 현재 혼잡도 필터(전체/여유/보통/혼잡)
  var showFavoritesOnly = false;      // 즐겨찾기만 보기 토글 여부
  var currentSearchKeyword = "";      // 검색창 입력어

  // 미터 단위 거리를 "120m" / "1.4km" 같은 표시용 문자열로 변환 (좌표 없는 대여소는 "-")
  function formatDistance(m) {
    if (m === null || m === undefined) return "-";
    return m >= 1000 ? (m / 1000).toFixed(1) + "km" : m + "m";
  }

  // 현재 필터/즐겨찾기/검색어 조건을 모두 적용한 대여소 목록을 반환
  function getFiltered() {
    var filtered = currentFilter === "all" ? stations.slice() : stations.filter(function (s) { return s.status === currentFilter; });

    if (showFavoritesOnly) {
      filtered = filtered.filter(function (s) { return favoriteStationIds.has(s.id); });
    }

    if (currentSearchKeyword) {
      var keyword = currentSearchKeyword.trim().toLowerCase();
      filtered = filtered.filter(function(s) {
        var matchId = s.id.toString() === keyword;
        var matchName = s.name.toLowerCase().indexOf(keyword) > -1;
        var matchAddr = s.addr.toLowerCase().indexOf(keyword) > -1;
        return matchId || matchName || matchAddr;
      });
    }
    return filtered;
  }

  // getFiltered() 결과 중 현재 지도 화면(viewport)에 실제로 보이는 대여소만 남긴다.
  // "실시간 대여소 현황" 목록이 지도를 옮기거나 확대/축소할 때마다 그 화면에 보이는
  // 대여소로 갱신되도록 하기 위함 - 지도 핀 자체는 필터/검색 조건에만 반응하고 화면
  // 이동으로는 다시 그리지 않으므로(패닝마다 오버레이 전체를 재생성하지 않기 위해),
  // 목록 쪽만 별도로 bounds 교집합을 취한다.
  function getVisibleFiltered() {
    var filtered = getFiltered();
    if (!kakaoMap || !window.kakao) return filtered;
    var bounds = kakaoMap.getBounds();
    return filtered.filter(function (s) {
      if (!s.lat || !s.lon) return false;
      return bounds.contain(new kakao.maps.LatLng(s.lat, s.lon));
    });
  }

  // 지도 위 대여소 핀(원 안에 남은 대수 표시)을 전부 지우고 목록 기준으로 다시 그린다
  function renderMapPins(list) {
    if (!kakaoMap || !window.kakao) return;

    pinOverlays.forEach(function (ov) { ov.setMap(null); });
    pinOverlays = [];

    var bounds = new kakao.maps.LatLngBounds();
    var any = false;

    list.forEach(function (s) {
      if (!s.lat || !s.lon) return;
      var pos = new kakao.maps.LatLng(s.lat, s.lon);

      var el = document.createElement('div');
      el.className = 'kakao-map-pin ' + s.status;
      el.setAttribute('data-id', s.id);
      el.innerHTML = '<span class="dot">' + s.count + '</span><span class="chip">' + s.name + ' <span class="count">' + s.count + '대</span></span>';
      el.addEventListener('click', function () { openStationDetail(s.id); });

      var overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1, xAnchor: 0.5, zIndex: 5 });
      overlay.setMap(kakaoMap);
      pinOverlays.push(overlay);
      bounds.extend(pos);
      any = true;
    });

    // 지도 시점은 처음 목록을 그릴 때만 전체 범위에 맞추고, 이후 필터/검색으로 다시 그릴 때는
    // 사용자가 옮겨 둔 지도 위치·확대 수준을 그대로 유지한다(매번 재조정하면 지도가 계속 튐).
    if (!hasFitBounds && any) {
      kakaoMap.setBounds(bounds, 40, 40, 40, 40);
      hasFitBounds = true;
    }
  }

  // 좌표가 없어 거리를 못 구한 대여소(distanceM === null)는 정렬 시 맨 뒤로 보낸다
  function distSortKey(s) { return s.distanceM === null ? Infinity : s.distanceM; }

  function sortStations(list) {
    return list.slice().sort(function (a, b) {
      if (currentSort === "availability") return statusRank[a.status] - statusRank[b.status] || distSortKey(a) - distSortKey(b);
      return distSortKey(a) - distSortKey(b);
    });
  }

  // "실시간 대여소 현황" 목록 + 상단 개수만 다시 그린다(지도 핀은 건드리지 않음) -
  // 지도를 옮기거나 확대/축소할 때(idle 이벤트)마다 이것만 호출한다.
  function renderVisibleList() {
    var visible = sortStations(getVisibleFiltered());

    var listHtml = !visible.length
      ? '<div class="status-empty">현재 지도 화면에 보이는 대여소가 없어요.</div>'
      : visible.map(function (s) {
        return (
          '<div class="status-row" data-id="' + s.id + '"><div class="left"><span class="badge ' + s.status + '">' + statusLabel[s.status] + '</span><div class="info"><div class="name">' + s.name + '</div><div class="addr">' + s.addr + '</div></div></div><div class="right"><div class="distance">' + formatDistance(s.distanceM) + '</div><div class="count">' + s.count + '대 <span>/ ' + s.capacity + '면</span></div></div></div>'
        );
      }).join("");

    document.querySelectorAll(".status-list").forEach(function (el) { el.innerHTML = listHtml; });
    var countText = "· " + visible.length + "곳";
    document.querySelectorAll(".status-count").forEach(function (el) { el.textContent = countText; });
  }

  // 정렬/필터를 반영해 지도 핀을 다시 그리고, 그 다음 현재 화면 기준으로 목록을 그리는 메인 렌더 함수
  function render() {
    var list = sortStations(getFiltered());
    renderMapPins(list);
    applySidebarOcclusion();
    renderVisibleList();
  }

  // 검색창 입력 시 실시간으로 목록/지도를 다시 그림
  document.addEventListener("input", function (e) {
    if (e.target.id === "stationSearch") {
      currentSearchKeyword = e.target.value;
      render();
    }
  });

  // ── 정렬 탭(거리순 / 여유순) ─────────────────────────────────────────────────────
  var SORT_NOTE = { distance: "가까운 대여소부터 보여드려요", availability: "여유로운 대여소부터 보여드려요" };
  function updateSortNote() {
    document.querySelectorAll(".note").forEach(function (el) { el.textContent = SORT_NOTE[currentSort]; });
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sort = btn.dataset.sort;
      tabButtons.forEach(function (b) { b.classList.toggle("active", b.dataset.sort === sort); });
      currentSort = sort;
      updateSortNote();
      render();
    });
  });
  updateSortNote();

  // ── 혼잡도 필터 칩(전체 / 여유 / 보통 / 혼잡) ────────────────────────────────────
  function setFilter(f) {
    currentFilter = f;
    showFavoritesOnly = false;
    updateFavOnlyBadge();
    document.querySelectorAll(".filter-chip").forEach(function (el) { el.classList.toggle("active", el.dataset.filter === f); });
    render();
  }
  // 모바일: 접혀 있을 땐 탭해서 펼치기만 하고, 펼쳐진 상태에서 옵션을 고르면 적용 후 다시 접힘
  var mapFilterPanelEl = document.querySelector(".map-filter-panel");
  document.querySelectorAll(".filter-chip").forEach(function (el) {
    el.addEventListener("click", function () {
      var isMobile = window.innerWidth < 900;
      var isCollapsed = mapFilterPanelEl && mapFilterPanelEl.classList.contains("chips-collapsed");
      if (isMobile && isCollapsed) { mapFilterPanelEl.classList.remove("chips-collapsed"); return; }
      setFilter(el.dataset.filter);
      if (isMobile && mapFilterPanelEl) mapFilterPanelEl.classList.add("chips-collapsed");
    });
  });

  // 검색창 안 즐겨찾기(별) 버튼: 즐겨찾기 필터가 켜져 있거나 즐겨찾기 팝업이 열려 있으면 노란색으로 표시
  function updateFavOnlyBadge() {
    var favBtn = document.getElementById('headerFavBtn');
    var isPanelOpen = favoritesPanel && favoritesPanel.classList.contains('open');
    if (favBtn) favBtn.classList.toggle('active', showFavoritesOnly || isPanelOpen);
  }

  // ── 모바일 하단 "실시간 현황" 시트 접기/펼치기 ───────────────────────────────────
  var statusPanel = document.getElementById("statusPanel");
  var statusPanelToggle = document.getElementById("statusPanelToggle");
  function setStatusPanelCollapsed(collapsed) {
    if (statusPanel) statusPanel.classList.toggle("collapsed", collapsed);
    if (statusPanelToggle) statusPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    var reopenPill = document.getElementById('statusReopenPill');
    if (reopenPill) reopenPill.classList.toggle('show', collapsed);
    // 모바일 하단 시트가 펼쳐진 동안에는 겹쳐 보이는 우측 하단 필터 칩을 함께 숨김
    // (데스크탑에는 이 시트 자체가 없으므로 모바일에서만 적용 — 그렇지 않으면 페이지 로드 시
    // 시트의 기본 펼침 상태 때문에 데스크탑 필터 칩까지 처음부터 숨겨져 버린다)
    var filterPanel = document.querySelector('.map-filter-panel');
    if (filterPanel && window.innerWidth < 900) filterPanel.classList.toggle('hidden-behind-sheet', !collapsed);
    setTimeout(applySidebarOcclusion, 300);
  }
  if (statusPanelToggle) { statusPanelToggle.addEventListener("click", function (e) { e.preventDefault(); setStatusPanelCollapsed(!statusPanel.classList.contains("collapsed")); }); }
  var reopenPill = document.getElementById('statusReopenPill');
  if (reopenPill) reopenPill.addEventListener('click', function() { setStatusPanelCollapsed(false); });
  setStatusPanelCollapsed(statusPanel ? statusPanel.classList.contains('collapsed') : false);

  // ── 데스크탑 좌측 사이드바 접기/펼치기 ───────────────────────────────────────────
  var dashboardEl = document.querySelector(".dashboard");
  var sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
  var sidebarReopenBtn = document.getElementById("sidebarReopenBtn");
  function setSidebarCollapsed(collapsed) {
    dashboardEl.classList.toggle("sidebar-collapsed", collapsed);
    if (sidebarToggleBtn) sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed));
  }
  if (sidebarToggleBtn) { sidebarToggleBtn.addEventListener("click", function () { setSidebarCollapsed(!dashboardEl.classList.contains("sidebar-collapsed")); }); }
  if (sidebarReopenBtn) { sidebarReopenBtn.addEventListener("click", function () { setSidebarCollapsed(false); }); }

  async function loadStations() {
    try {
      var origin = await getOriginCoords();
      var raw = await api.get('/station/stations');
      stations = raw.map(function (s) { return mapStation(s, origin); });
    } catch (e) {
      stations = [];
    }
    render();
  }

  (async function bootstrapMap() {
    try {
      await initKakaoMap();
    } catch (e) {
      console.error('[카카오맵] 초기화 실패:', e);
      var el = document.getElementById('kakaoMapContainer');
      if (el) el.innerHTML = '<div class="d-flex align-items-center justify-content-center h-100 text-muted small">지도를 불러오지 못했습니다.</div>';
    }
    loadStations();
  })();

  // 모바일에서 즐겨찾기 팝오버가 열려 있는 동안 실시간 현황 패널·필터 칩과 겹치지 않도록 숨김
  function setStatusPanelHiddenForOverlay(hidden) {
    if (statusPanel) statusPanel.classList.toggle('overlay-hidden', hidden);
    var filterPanel = document.querySelector('.map-filter-panel');
    if (filterPanel) filterPanel.classList.toggle('hidden-behind-sheet', hidden);
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeFavorites(); } });

  // ── 즐겨찾기 팝오버 ──────────────────────────────────────────────────────────────
  // 즐겨찾기 팝오버: 어두운 배경 없이 독립적으로 열고 닫힘
  var favoritesPanel = document.getElementById("favoritesPanel");

  // 위치는 CSS 미디어쿼리가 전담(모바일: 하단 시트, 데스크탑: 대여소 상세 팝업과 동일한 하단 중앙 모달)
  function positionFavoritesPopover() {
    if (!favoritesPanel) return;
    favoritesPanel.style.top = ""; favoritesPanel.style.left = ""; favoritesPanel.style.right = "";
  }

  function openFavorites() {
    renderFavorites();
    if (favoritesPanel) {
      favoritesPanel.classList.add("open"); favoritesPanel.setAttribute("aria-hidden", "false");
      positionFavoritesPopover();
    }
    setStatusPanelHiddenForOverlay(true);
    updateFavOnlyBadge();
    // 즐겨찾기를 열면 지도도 즐겨찾기한 대여소만 보이는 토글 상태로 전환 (데스크탑/모바일 공통)
    if (!showFavoritesOnly) {
      showFavoritesOnly = true;
      updateFavOnlyBadge();
      render();
    }
  }
  function closeFavoritesPanel() {
    if (favoritesPanel) { favoritesPanel.classList.remove("open"); favoritesPanel.setAttribute("aria-hidden", "true"); }
    updateFavOnlyBadge();
    setStatusPanelHiddenForOverlay(false);
  }
  // 별 버튼/닫기 버튼/바깥 클릭으로 닫을 땐 즐겨찾기 지도 필터도 함께 해제(별이 다시 회색으로)
  function closeFavorites() {
    closeFavoritesPanel();
    if (showFavoritesOnly) {
      showFavoritesOnly = false;
      updateFavOnlyBadge();
      render();
    }
  }
  // 즐겨찾기 시트 상단 손잡이(핸들바)를 눌러도 닫히도록
  var favoritesHandle = favoritesPanel ? favoritesPanel.querySelector(".panel-drag-handle") : null;
  if (favoritesHandle) favoritesHandle.addEventListener("click", closeFavorites);
  // 팝오버 바깥을 클릭하면 닫힘 (팝오버 내부 클릭이나 별 버튼 클릭은 무시)
  document.addEventListener("click", function (e) {
    if (!favoritesPanel || !favoritesPanel.classList.contains("open")) return;
    if (favoritesPanel.contains(e.target) || e.target.closest('#headerFavBtn')) return;
    closeFavorites();
  });

  // 즐겨찾기 목록(별 아이콘 + 이름 + 대수 + 삭제 버튼)을 백엔드 /favorites 응답 기준으로 다시 그림
  var favList = document.getElementById('favList');
  var favEmpty = document.getElementById('favEmpty');
  async function renderFavorites() {
    var myFavs;
    try {
      myFavs = await api.get('/station/favorites');
    } catch (e) {
      return;
    }
    favoriteStationIds = new Set(myFavs.map(function (f) { return f.station_id; }));
    if(favList) favList.innerHTML = '';

    if (myFavs.length === 0) {
        if(favEmpty) favEmpty.style.display = '';
    } else {
        if(favEmpty) favEmpty.style.display = 'none';
        myFavs.forEach(function(f) {
            var item = document.createElement('div');
            item.className = 'fav-item';
            item.innerHTML =
                '<span class="fav-item-star"><i class="bi bi-star-fill"></i></span>' +
                '<span class="fav-item-name">' + (f.station_name || f.station_id) + '</span>' +
                '<span class="fav-item-count">' + (f.general_bike_cnt + f.sprout_bike_cnt) + '대</span>' +
                '<button class="fav-del-btn" data-id="' + f.station_id + '" title="즐겨찾기 해제"><i class="bi bi-x-lg"></i></button>';
            // 항목(즐겨찾기 삭제 버튼 제외)을 클릭하면 지도를 그 대여소만 보이는 상태로 전환
            item.addEventListener('click', function (e) {
              if (e.target.closest('.fav-del-btn')) return;
              showFavoritesOnly = true;
              updateFavOnlyBadge();
              render();
              closeFavoritesPanel();
            });
            if(favList) favList.appendChild(item);
        });
    }
  }

  // 즐겨찾기 삭제(✕) 버튼: 목록을 다시 그리는 과정에서 클릭했던 요소가 DOM에서 사라지므로,
  // stopPropagation으로 바깥 클릭 감지 로직까지 이벤트가 번지지 않게 막아 팝오버가 닫히지 않도록 함
  if (favList) {
    favList.addEventListener('click', async function(e) {
      var delBtn = e.target.closest('.fav-del-btn');
      if (delBtn) {
        e.stopPropagation();
        var stId = delBtn.getAttribute('data-id');
        try {
          await api.delete('/station/favorites/' + stId);
        } catch (err) { return; }
        favoriteStationIds.delete(stId);
        renderFavorites();
        if (currentDetailStationId === stId) updateSdFavIcon();
      }
    });
  }

  // 검색창 옆 별 버튼: 즐겨찾기 팝오버 토글
  document.addEventListener('click', function (e) {
    var favBtn = e.target.closest('#headerFavBtn');
    if (favBtn) {
      e.stopPropagation();
      if (favoritesPanel.classList.contains('open')) closeFavorites();
      else openFavorites();
    }
  });

  // ── 대여소 상세 팝업 ─────────────────────────────────────────────────────────────
  var currentDetailStationId = null;
  var sdBackdrop = document.getElementById('stationDetailBackdrop');
  var sdPanel = document.getElementById('stationDetailPanel');
  var sdTitle = document.getElementById('sdTitle');
  var sdAddr = document.getElementById('sdAddr');
  var sdGeneral = document.getElementById('sdGeneral'); // 일반 자전거
  var sdSprout = document.getElementById('sdSprout');   // 새싹 자전거
  var sdCapacity = document.getElementById('sdCapacity');
  var sdFavBtn = document.getElementById('sdFavBtn');
  var sdCloseBtn = document.getElementById('sdCloseBtn');
  var sdStatusBadge = document.getElementById('sdStatusBadge');
  var sdReportBtn = document.getElementById('sdReportBtn');

  // 상세 팝업 안의 즐겨찾기(별) 아이콘을 현재 대여소의 즐겨찾기 여부에 맞게 채움/빈 별로 갱신
  function updateSdFavIcon() {
    var isFav = favoriteStationIds.has(currentDetailStationId);
    if(sdFavBtn) sdFavBtn.innerHTML = isFav ? '<i class="bi bi-star-fill text-warning"></i>' : '<i class="bi bi-star text-muted"></i>';
  }

  // 지도 핀 또는 목록 행 클릭 시 호출: 선택한 대여소 정보를 상세 팝업에 채우고 연다
  function openStationDetail(id) {
    var st = stations.find(function(s) { return s.id === id; });
    if (!st) return;
    currentDetailStationId = id;
    sdTitle.textContent = st.name;
    sdAddr.textContent = st.addr;

    // 혼잡도 상태 표시 (색상 + 텍스트로 직관적으로 구분)
    if (sdStatusBadge) {
      sdStatusBadge.textContent = statusLabel[st.status] + ' · ' + st.count + '/' + st.capacity + '대';
      sdStatusBadge.className = 'badge sd-status-badge ' + st.status;
    }

    // 일반/새싹 데이터 바인딩 (상태별 색상 구분)
    if(sdGeneral) { sdGeneral.textContent = st.generalCount + '대'; sdGeneral.className = st.status; }
    if(sdSprout) { sdSprout.textContent = st.sproutCount + '대'; sdSprout.className = st.status; }
    if(sdCapacity) sdCapacity.textContent = st.capacity + '면';

    updateSdFavIcon();
    if(sdBackdrop) sdBackdrop.classList.add('show');
    if(sdPanel) sdPanel.classList.add('show');
    // 데스크탑에서는 상세 팝업이 즐겨찾기 팝업과 같은 위치에 뜨므로, 겹쳐 보이는 필터 칩을 함께 숨김
    setStatusPanelHiddenForOverlay(true);
  }

  function closeStationDetail() {
    if(sdBackdrop) sdBackdrop.classList.remove('show');
    if(sdPanel) sdPanel.classList.remove('show');
    currentDetailStationId = null;
    setStatusPanelHiddenForOverlay(false);
  }

  if(sdCloseBtn) sdCloseBtn.addEventListener('click', closeStationDetail);
  if(sdBackdrop) sdBackdrop.addEventListener('click', closeStationDetail);

  // 상세 팝업 안의 즐겨찾기 버튼: 클릭할 때마다 즐겨찾기 추가/해제를 토글
  if (sdFavBtn) {
    sdFavBtn.addEventListener('click', async function() {
      if (!currentDetailStationId) return;
      try {
        if (favoriteStationIds.has(currentDetailStationId)) {
          await api.delete('/station/favorites/' + currentDetailStationId);
          favoriteStationIds.delete(currentDetailStationId);
        } else {
          await api.post('/station/favorites', { station_id: currentDetailStationId });
          favoriteStationIds.add(currentDetailStationId);
        }
      } catch (e) { return; }
      updateSdFavIcon();
      renderFavorites();
    });
  }

  // 실시간 현황 목록의 행을 클릭하면 해당 대여소의 상세 팝업을 연다 (지도 핀은 자체 클릭 리스너를 가짐)
  document.addEventListener('click', function(e) {
    var row = e.target.closest('.status-row');
    var targetId = row ? row.getAttribute('data-id') : null;

    if (targetId) openStationDetail(targetId);
  });

  // ── 이용안내(요금 정보) 모달: "오늘 하루동안 안 보기"를 체크하지 않았다면 페이지 진입 시 한 번 자동으로 띄움 ──
  var infoModalBackdrop = document.getElementById('infoModalBackdrop');
  var infoModal = document.getElementById('infoModal');
  var infoModalCloseX = document.getElementById('infoModalCloseX');
  var infoModalCloseBtn = document.getElementById('infoModalCloseBtn');
  var infoModalHideToday = document.getElementById('infoModalHideToday');
  var INFO_MODAL_HIDE_KEY = 'infoModalHiddenDate';

  function todayDateString() {
    // toISOString()은 UTC 기준이라 자정 무렵(KST 00:00~09:00) 날짜가 하루 어긋날 수 있어 로컬 날짜로 직접 조합
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function openInfoModal() {
    if (infoModalBackdrop) infoModalBackdrop.classList.add('show');
    if (infoModal) infoModal.classList.add('show');
  }
  function closeInfoModal() {
    // 체크박스가 선택돼 있으면 오늘 날짜를 저장해, 같은 날 다시 들어와도 자동으로 뜨지 않게 함
    if (infoModalHideToday && infoModalHideToday.checked) {
      localStorage.setItem(INFO_MODAL_HIDE_KEY, todayDateString());
    }
    if(infoModalBackdrop) infoModalBackdrop.classList.remove('show');
    if(infoModal) infoModal.classList.remove('show');
  }
  if (infoModalCloseX) infoModalCloseX.addEventListener('click', closeInfoModal);
  if (infoModalCloseBtn) infoModalCloseBtn.addEventListener('click', closeInfoModal);
  if (infoModalBackdrop) infoModalBackdrop.addEventListener('click', closeInfoModal);

  if (localStorage.getItem(INFO_MODAL_HIDE_KEY) !== todayDateString()) {
    openInfoModal();
  }

  // ── 고장 신고 팝업 (QR 스캔 / ID 입력 + 신고 내용) ────────────────────────────────
  var reportModalBackdrop = document.getElementById('reportModalBackdrop');
  var reportModal = document.getElementById('reportModal');
  var reportModalCloseBtn = document.getElementById('reportModalCloseBtn');
  var reportBikeIdInput = document.getElementById('reportBikeIdInput');
  var reportIssueInput = document.getElementById('reportIssueInput');

  // 아이패드 정도 크기(1400px)까지는 카메라 QR 스캔을 쓰고, 그보다 넓은 화면(데스크탑)에서는 ID 직접 입력만 허용한다.
  function isMobileViewport() {
    return window.matchMedia('(max-width: 1399.98px)').matches;
  }

  // ── 모바일 전용 QR 카메라 스캔 ──────────────────────────────────────────────
  var reportQrCamera = null;
  var reportCameraStatus = document.getElementById('reportCameraStatus');

  function startReportCamera() {
    if (!isMobileViewport() || typeof Html5Qrcode === 'undefined') return;
    reportQrCamera = new Html5Qrcode('reportQrReader');
    reportQrCamera.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      function (decodedText) {
        if (reportBikeIdInput) reportBikeIdInput.value = decodedText;
        if (reportCameraStatus) {
          reportCameraStatus.textContent = '스캔 완료: ' + decodedText;
          reportCameraStatus.className = 'scan-camera-status success';
        }
        stopReportCamera();
      },
      function () { /* 프레임마다 QR을 못 찾는 경우는 무시 */ }
    ).catch(function () {
      if (reportCameraStatus) {
        reportCameraStatus.textContent = '카메라를 사용할 수 없습니다. 카메라 권한을 확인해 주세요.';
        reportCameraStatus.className = 'scan-camera-status error';
      }
      // 시작에 실패한 스캐너는 실행 중이 아니므로, stop() 호출 대상에서 제외되도록 참조를 비워둔다.
      reportQrCamera = null;
    });
  }

  function stopReportCamera() {
    if (!reportQrCamera) return;
    var camera = reportQrCamera;
    reportQrCamera = null;
    try {
      camera.stop().catch(function () { }).finally(function () { camera.clear(); });
    } catch (e) {
      // 스캐너가 이미 정지된 상태 등에서 stop()이 동기적으로 예외를 던지는 경우를 방어한다.
    }
  }

  function openReportModal() {
    if (!currentDetailStationId) return;
    if (reportBikeIdInput) reportBikeIdInput.value = '';
    if (reportIssueInput) reportIssueInput.value = '';
    if (reportCameraStatus) {
      reportCameraStatus.textContent = '고장 따릉이의 QR 코드를 카메라 화면 안에 비춰주세요.';
      reportCameraStatus.className = 'scan-camera-status text-muted';
    }
    if (reportModalBackdrop) reportModalBackdrop.classList.add('show');
    if (reportModal) reportModal.classList.add('show');
    startReportCamera();
  }
  function closeReportModal() {
    if (reportModalBackdrop) reportModalBackdrop.classList.remove('show');
    if (reportModal) reportModal.classList.remove('show');
    stopReportCamera();
  }
  if (sdReportBtn) sdReportBtn.addEventListener('click', openReportModal);

  if (reportModalCloseBtn) reportModalCloseBtn.addEventListener('click', closeReportModal);
  if (reportModalBackdrop) reportModalBackdrop.addEventListener('click', closeReportModal);

  // 신고하기 버튼: 입력값을 검증한 뒤 백엔드에 새 신고 건을 접수
  var reportSubmitBtn = document.getElementById('reportSubmitBtn');
  if (reportSubmitBtn) reportSubmitBtn.addEventListener('click', async function () {
    var bikeId = reportBikeIdInput ? reportBikeIdInput.value.trim() : '';
    var issue = reportIssueInput ? reportIssueInput.value.trim() : '';
    if (!bikeId) { alert('따릉이 ID를 스캔하거나 입력해 주세요.'); return; }
    if (!issue) { alert('고장 내용을 입력해 주세요.'); return; }

    reportSubmitBtn.disabled = true;
    try {
      await api.post('/station/reports', {
        bike_id: bikeId,
        station_id: currentDetailStationId,
        issue: issue
      });
    } catch (e) {
      alert(e.message || '신고 접수에 실패했습니다.');
      return;
    } finally {
      reportSubmitBtn.disabled = false;
    }
    alert('고장 신고가 접수되었습니다. 빠르게 처리하겠습니다!');
    closeReportModal();
  });

  // ── 하단 안내 링크 (고객센터/대여소 제안/개인정보처리방침) ────────────────────────────────
  var FOOTER_TOPICS = {
    support: { title: '고객센터', body: '<p>따릉이 이용 중 불편사항이나 문의사항은 아래로 연락해 주세요.</p><p class="fw-bold mb-0">1599-0120 (평일 09:00~18:00)</p>' },
    suggest: { title: '대여소 제안', body: '<p>새로운 대여소 설치가 필요한 위치가 있다면 알려주세요.</p><p class="text-muted mb-0">추천 위치와 사유를 홈페이지(bikeseoul.com) 제안 게시판에 남겨주시면 검토 후 반영됩니다.</p>' },
    privacy: { title: '개인정보처리방침', body: '<p>따릉이는 회원 가입 시 수집한 개인정보를 서비스 제공 목적으로만 이용하며, 관련 법령에 따라 안전하게 관리합니다.</p><p class="text-muted mb-0">자세한 내용은 홈페이지의 개인정보처리방침 전문을 참고해 주세요.</p>' }
  };
  var footerInfoBackdrop = document.getElementById('footerInfoBackdrop');
  var footerInfoModal = document.getElementById('footerInfoModal');
  var footerInfoTitle = document.getElementById('footerInfoTitle');
  var footerInfoBody = document.getElementById('footerInfoBody');
  var footerInfoCloseBtn = document.getElementById('footerInfoCloseBtn');

  // 안내 팝업을 닫을 때도 stopPropagation으로 이벤트를 막아, 즐겨찾기 팝오버 등 다른 열려 있는
  // UI가 이 클릭 때문에 덩달아 닫히거나 상태가 초기화되지 않도록 함
  function closeFooterInfo(e) {
    if (e) e.stopPropagation();
    if (footerInfoBackdrop) footerInfoBackdrop.classList.remove('show');
    if (footerInfoModal) footerInfoModal.classList.remove('show');
  }
  document.querySelectorAll('.footer-link-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      // 클릭이 document까지 번지면 즐겨찾기 팝오버 등의 "바깥 클릭 감지" 로직이 함께 반응해
      // 열려 있던 다른 UI 상태를 초기화해버리므로, 여기서 전파를 막는다
      e.stopPropagation();
      var topic = FOOTER_TOPICS[btn.getAttribute('data-topic')];
      if (!topic) return;
      footerInfoTitle.textContent = topic.title;
      footerInfoBody.innerHTML = topic.body;
      footerInfoBackdrop.classList.add('show');
      footerInfoModal.classList.add('show');
    });
  });
  if (footerInfoCloseBtn) footerInfoCloseBtn.addEventListener('click', closeFooterInfo);
  if (footerInfoBackdrop) footerInfoBackdrop.addEventListener('click', closeFooterInfo);

  // ── 지도: 좌측 패널(데스크탑)이나 하단 시트(모바일)에 가려지는 대여소는 선택되지 않도록 처리 ────────────────────────────────
  function applySidebarOcclusion() {
    var sidebarWrapEl = document.getElementById('sidebarWrap');
    var mapCard = document.querySelector('.map-card');
    var sheetEl = document.getElementById('statusPanel');
    if (!mapCard) return;

    var isDesktopSidebarVisible = !!sidebarWrapEl && window.innerWidth >= 900 && getComputedStyle(sidebarWrapEl).display !== 'none';
    var sidebarRightEdge = isDesktopSidebarVisible ? sidebarWrapEl.getBoundingClientRect().right : 0;

    var isMobileSheetVisible = !!sheetEl && window.innerWidth < 900 &&
      getComputedStyle(sheetEl).display !== 'none' &&
      !sheetEl.classList.contains('collapsed') &&
      !sheetEl.classList.contains('overlay-hidden');
    var sheetTopEdge = isMobileSheetVisible ? sheetEl.getBoundingClientRect().top : Infinity;

    document.querySelectorAll('.kakao-map-pin').forEach(function (pin) {
      var pinRect = pin.getBoundingClientRect();
      var occludedByDesktopSidebar = isDesktopSidebarVisible && (pinRect.left + pinRect.width / 2) < sidebarRightEdge;
      var occludedByMobileSheet = isMobileSheetVisible && pinRect.bottom > sheetTopEdge;
      pin.style.visibility = (occludedByDesktopSidebar || occludedByMobileSheet) ? 'hidden' : 'visible';
    });
  }
  window.addEventListener('resize', applySidebarOcclusion);
  setTimeout(applySidebarOcclusion, 150);

  renderFavorites();
})();
