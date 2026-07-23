// user_dashboard.js
(function () {
  var CURRENT_USER_ID = window.CURRENT_USER_ID || 1;

  var stations = DB.station.map(function(s, idx) {
    var distArray = [120, 300, 600, 850, 1400, 2100];
    var dist = distArray[idx % distArray.length];

    var totalBikes = s.general_bike_count + s.sprout_bike_count;
    var stLabel = "ok";
    if (s.stock_level === '고갈심각' || s.stock_level === '과포화') stLabel = "busy";
    else if (s.stock_level === '부족' || totalBikes <= 3) stLabel = "mid";

    var district = DB.district.find(function(d) { return d.id === s.district_id; });
    var addr = (district ? district.name : "") + " " + s.neighborhood_name;

    return {
      id: s.id,
      name: s.name,
      addr: addr,
      distanceM: dist,
      status: stLabel,
      count: totalBikes,
      generalCount: s.general_bike_count, // 🟢 일반 자전거 수량 추가
      sproutCount: s.sprout_bike_count,   // 🟢 새싹 자전거 수량 추가
      capacity: s.capacity,
      mapX: s.map_x,
      mapY: s.map_y
    };
  });

  var statusRank = { ok: 0, mid: 1, busy: 2 };
  var statusLabel = { ok: "여유", mid: "보통", busy: "혼잡" };

  var tabButtons = document.querySelectorAll(".status-tabs button");
  var currentSort = "distance";
  var currentFilter = "all";
  var showFavoritesOnly = false;
  var currentSearchKeyword = "";

  function formatDistance(m) {
    return m >= 1000 ? (m / 1000).toFixed(1) + "km" : m + "m";
  }

  function getFiltered() {
    var filtered = currentFilter === "all" ? stations.slice() : stations.filter(function (s) { return s.status === currentFilter; });

    if (showFavoritesOnly && window.DB) {
      var favIds = window.DB.favorite_station.filter(function (f) { return f.user_id === CURRENT_USER_ID; }).map(function (f) { return f.station_id; });
      filtered = filtered.filter(function (s) { return favIds.indexOf(s.id) > -1; });
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

  function renderMapPins(list) {
    var mapContainer = document.querySelector('.map-card');
    if (!mapContainer) return;
    mapContainer.querySelectorAll('.map-pin').forEach(function(p) { p.remove(); });

    list.forEach(function(s) {
      // 자치구별로 미리 계산된 격자 좌표(map_x/map_y)를 사용해 같은 동네 정류소끼리 뭉쳐 보이도록 배치
      var leftPct = Math.min(94, Math.max(4, ((s.mapX - 60) / 680) * 100)) + '%';
      var topPct = Math.min(90, Math.max(8, ((s.mapY - 100) / 400) * 100)) + '%';

      var pin = document.createElement('div');
      pin.className = 'map-pin ' + s.status;
      pin.setAttribute('data-status', s.status);
      pin.setAttribute('data-id', s.id);
      pin.style.left = leftPct;
      pin.style.top = topPct;
      pin.innerHTML = '<span class="dot"></span><span class="chip">' + s.name + ' <span class="count">' + s.count + '대</span></span>';
      mapContainer.appendChild(pin);
    });
  }

  function render() {
    var list = getFiltered().sort(function (a, b) {
      if (currentSort === "availability") return statusRank[a.status] - statusRank[b.status] || a.distanceM - b.distanceM;
      return a.distanceM - b.distanceM;
    });

    var listHtml = !list.length
      ? '<div class="status-empty">해당 조건의 정류소가 없어요.</div>'
      : list.map(function (s) {
        return (
          '<div class="status-row" style="cursor:pointer;" data-id="' + s.id + '"><div class="left"><span class="badge ' + s.status + '">' + statusLabel[s.status] + '</span><div class="info"><div class="name">' + s.name + '</div><div class="addr">' + s.addr + '</div></div></div><div class="right"><div class="distance">' + formatDistance(s.distanceM) + '</div><div class="count">' + s.count + '대 <span>/ ' + s.capacity + '면</span></div></div></div>'
        );
      }).join("");

    document.querySelectorAll(".status-list").forEach(function (el) { el.innerHTML = listHtml; });
    renderMapPins(list);
    applySidebarOcclusion();

    var countText = "· " + list.length + "곳";
    document.querySelectorAll(".status-count").forEach(function (el) { el.textContent = countText; });
  }

  document.addEventListener("input", function (e) {
    if (e.target.id === "stationSearch") {
      currentSearchKeyword = e.target.value;
      render();
    }
  });

  var SORT_NOTE = { distance: "가까운 정류소부터 보여드려요", availability: "여유로운 정류소부터 보여드려요" };
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

  function setFilter(f) {
    currentFilter = f;
    showFavoritesOnly = false;
    updateFavOnlyBadge();
    document.querySelectorAll(".filter-chip").forEach(function (el) { el.classList.toggle("active", el.dataset.filter === f); });
    render();
  }
  document.querySelectorAll(".filter-chip").forEach(function (el) { el.addEventListener("click", function () { setFilter(el.dataset.filter); }); });

  function updateFavOnlyBadge() {
    var badge = document.getElementById('favOnlyBadge');
    if (badge) badge.style.display = showFavoritesOnly ? 'flex' : 'none';
  }
  var favOnlyBadgeEl = document.getElementById('favOnlyBadge');
  if (favOnlyBadgeEl) favOnlyBadgeEl.addEventListener('click', function () {
    showFavoritesOnly = false;
    updateFavOnlyBadge();
    render();
  });

  var statusPanel = document.getElementById("statusPanel");
  var statusPanelToggle = document.getElementById("statusPanelToggle");
  function setStatusPanelCollapsed(collapsed) {
    if (statusPanel) statusPanel.classList.toggle("collapsed", collapsed);
    if (statusPanelToggle) statusPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    var reopenPill = document.getElementById('statusReopenPill');
    if (reopenPill) reopenPill.classList.toggle('show', collapsed);
    // 모바일 하단 시트가 펼쳐진 동안에는 겹쳐 보이는 우측 하단 필터 칩을 함께 숨김
    var filterPanel = document.querySelector('.map-filter-panel');
    if (filterPanel) filterPanel.classList.toggle('hidden-behind-sheet', !collapsed);
  }
  if (statusPanelToggle) { statusPanelToggle.addEventListener("click", function (e) { e.preventDefault(); setStatusPanelCollapsed(!statusPanel.classList.contains("collapsed")); }); }
  var reopenPill = document.getElementById('statusReopenPill');
  if (reopenPill) reopenPill.addEventListener('click', function() { setStatusPanelCollapsed(false); });
  setStatusPanelCollapsed(statusPanel ? statusPanel.classList.contains('collapsed') : false);

  var dashboardEl = document.querySelector(".dashboard");
  var sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
  if (sidebarToggleBtn) { sidebarToggleBtn.addEventListener("click", function () { var collapsed = dashboardEl.classList.toggle("sidebar-collapsed"); sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed)); }); }

  render();

  var profileBtn = document.getElementById("profileMenuBtn");
  var backdrop = document.getElementById("sheetBackdrop");
  var guidePanel = document.getElementById("guidePanel");
  var profilePanel = document.getElementById("profilePanel");
  var panels = [guidePanel, profilePanel];

  // 모바일에서 시트/팝오버가 열려 있는 동안 실시간 현황 패널과 겹치지 않도록 숨김
  function setStatusPanelHiddenForOverlay(hidden) {
    if (statusPanel) statusPanel.classList.toggle('overlay-hidden', hidden);
  }

  function closeAllPanels() {
    panels.forEach(function (p) { if (p) { p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); } });
    if (backdrop) backdrop.classList.remove("open");
    if (profileBtn) profileBtn.setAttribute("aria-expanded", "false");
    setStatusPanelHiddenForOverlay(false);
  }

  function openPanel(panel, opts) {
    if (!panel) return;
    var wasOpen = panel.classList.contains("open");
    closeAllPanels();
    if (wasOpen) return;
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.classList.add("open");
    setStatusPanelHiddenForOverlay(true);
    if (opts && opts.isProfile && profileBtn) profileBtn.setAttribute("aria-expanded", "true");
  }

  var guideClose = document.getElementById("guideClose"); if (guideClose) guideClose.addEventListener("click", closeAllPanels);
  var profileClose = document.getElementById("profileClose"); if (profileClose) profileClose.addEventListener("click", closeAllPanels);
  if (backdrop) backdrop.addEventListener("click", closeAllPanels);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAllPanels(); closeFavorites(); } });

  // 즐겨찾기 팝오버: 어두운 배경 없이 독립적으로 열고 닫힘
  var favoritesPanel = document.getElementById("favoritesPanel");

  // 데스크탑에서는 즐겨찾기 버튼(검색창 안 별 아이콘) 바로 아래에 떠 있도록 위치 계산
  function positionFavoritesPopover() {
    if (!favoritesPanel) return;
    if (window.innerWidth < 900) { favoritesPanel.style.top = ""; favoritesPanel.style.left = ""; favoritesPanel.style.right = ""; return; }
    var btn = document.getElementById('headerFavBtn');
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    var width = favoritesPanel.offsetWidth || 340;
    var left = Math.min(window.innerWidth - width - 16, Math.max(16, r.left + r.width / 2 - width / 2));
    favoritesPanel.style.top = (r.bottom + 10) + "px";
    favoritesPanel.style.left = left + "px";
    favoritesPanel.style.right = "auto";
  }

  function openFavorites() {
    closeAllPanels();
    renderFavorites();
    if (favoritesPanel) {
      favoritesPanel.classList.add("open"); favoritesPanel.setAttribute("aria-hidden", "false");
      positionFavoritesPopover();
    }
    setStatusPanelHiddenForOverlay(true);
  }
  function closeFavorites() {
    if (favoritesPanel) { favoritesPanel.classList.remove("open"); favoritesPanel.setAttribute("aria-hidden", "true"); }
    setStatusPanelHiddenForOverlay(false);
  }
  var favoritesClose = document.getElementById("favoritesClose"); if (favoritesClose) favoritesClose.addEventListener("click", closeFavorites);
  document.addEventListener("click", function (e) {
    if (!favoritesPanel || !favoritesPanel.classList.contains("open")) return;
    if (favoritesPanel.contains(e.target) || e.target.closest('#headerFavBtn')) return;
    closeFavorites();
  });

  var favList = document.getElementById('favList');
  var favEmpty = document.getElementById('favEmpty');
  function renderFavorites() {
    if (!window.DB) return;
    var myFavs = window.DB.favorite_station.filter(function(f) { return f.user_id === CURRENT_USER_ID; });
    if(favList) favList.innerHTML = '';

    if (myFavs.length === 0) {
        if(favEmpty) favEmpty.style.display = '';
    } else {
        if(favEmpty) favEmpty.style.display = 'none';
        myFavs.forEach(function(f) {
            var st = window.DB.station.find(function(s) { return s.id === f.station_id; });
            if(st) {
                var item = document.createElement('div');
                item.className = 'fav-item';
                item.innerHTML =
                    '<span class="fav-item-star"><i class="bi bi-star-fill"></i></span>' +
                    '<span class="fav-item-name">' + st.name + '</span>' +
                    '<span class="fav-item-count">' + (st.general_bike_count + st.sprout_bike_count) + '대</span>' +
                    '<button class="fav-del-btn" data-id="' + st.id + '" title="즐겨찾기 해제"><i class="bi bi-x-lg"></i></button>';
                item.addEventListener('click', function (e) {
                  if (e.target.closest('.fav-del-btn')) return;
                  showFavoritesOnly = true;
                  updateFavOnlyBadge();
                  render();
                  closeFavorites();
                });
                if(favList) favList.appendChild(item);
            }
        });
    }
  }

  if (favList) {
    favList.addEventListener('click', function(e) {
      var delBtn = e.target.closest('.fav-del-btn');
      if (delBtn) {
        var stId = parseInt(delBtn.getAttribute('data-id'), 10);
        var idx = window.DB.favorite_station.findIndex(function(f) { return f.user_id === CURRENT_USER_ID && f.station_id === stId; });
        if (idx > -1) {
          window.DB.favorite_station.splice(idx, 1);
          renderFavorites();
          if (currentDetailStationId === stId) updateSdFavIcon();
        }
      }
    });
  }

  document.addEventListener('click', function (e) {
    var favBtn = e.target.closest('#headerFavBtn');
    if (favBtn) {
      e.stopPropagation();
      if (favoritesPanel.classList.contains('open')) closeFavorites();
      else openFavorites();
    }
  });

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

  function updateSdFavIcon() {
    var isFav = window.DB.favorite_station.some(function(f) { return f.user_id === CURRENT_USER_ID && f.station_id === currentDetailStationId; });
    if(sdFavBtn) sdFavBtn.innerHTML = isFav ? '<i class="bi bi-star-fill text-warning"></i>' : '<i class="bi bi-star text-muted"></i>';
  }

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
  }

  function closeStationDetail() {
    if(sdBackdrop) sdBackdrop.classList.remove('show');
    if(sdPanel) sdPanel.classList.remove('show');
    currentDetailStationId = null;
  }

  if(sdCloseBtn) sdCloseBtn.addEventListener('click', closeStationDetail);
  if(sdBackdrop) sdBackdrop.addEventListener('click', closeStationDetail);

  if (sdFavBtn) {
    sdFavBtn.addEventListener('click', function() {
      if (!currentDetailStationId) return;
      var favIdx = window.DB.favorite_station.findIndex(function(f) { return f.user_id === CURRENT_USER_ID && f.station_id === currentDetailStationId; });
      if (favIdx > -1) {
        window.DB.favorite_station.splice(favIdx, 1);
      } else {
        window.DB.favorite_station.push({ id: Date.now(), user_id: 1, station_id: currentDetailStationId });
      }
      updateSdFavIcon();
      renderFavorites();
    });
  }

  document.addEventListener('click', function(e) {
    var pin = e.target.closest('.map-pin');
    var row = e.target.closest('.status-row');
    var targetId = null;

    if (pin) targetId = pin.getAttribute('data-id');
    else if (row) targetId = row.getAttribute('data-id');

    if (targetId) openStationDetail(parseInt(targetId, 10));
  });

  var infoModalBackdrop = document.getElementById('infoModalBackdrop');
  var infoModal = document.getElementById('infoModal');
  var infoModalCloseX = document.getElementById('infoModalCloseX');
  var infoModalCloseBtn = document.getElementById('infoModalCloseBtn');
  var infoModalHideToday = document.getElementById('infoModalHideToday');
  function closeInfoModal() {
    if(infoModalBackdrop) infoModalBackdrop.classList.remove('show');
    if(infoModal) infoModal.classList.remove('show');
  }
  if (infoModalCloseX) infoModalCloseX.addEventListener('click', closeInfoModal);
  if (infoModalCloseBtn) infoModalCloseBtn.addEventListener('click', closeInfoModal);

  // ── 고장 신고 팝업 (QR 스캔 / ID 입력 + 신고 내용) ────────────────────────────────
  var reportModalBackdrop = document.getElementById('reportModalBackdrop');
  var reportModal = document.getElementById('reportModal');
  var reportModalCloseBtn = document.getElementById('reportModalCloseBtn');
  var reportBikeIdInput = document.getElementById('reportBikeIdInput');
  var reportIssueInput = document.getElementById('reportIssueInput');

  function openReportModal() {
    if (!currentDetailStationId) return;
    if (reportBikeIdInput) reportBikeIdInput.value = '';
    if (reportIssueInput) reportIssueInput.value = '';
    if (reportModalBackdrop) reportModalBackdrop.classList.add('show');
    if (reportModal) reportModal.classList.add('show');
  }
  function closeReportModal() {
    if (reportModalBackdrop) reportModalBackdrop.classList.remove('show');
    if (reportModal) reportModal.classList.remove('show');
  }
  if (sdReportBtn) sdReportBtn.addEventListener('click', openReportModal);
  if (reportModalCloseBtn) reportModalCloseBtn.addEventListener('click', closeReportModal);
  if (reportModalBackdrop) reportModalBackdrop.addEventListener('click', closeReportModal);

  var reportScanBtn = document.getElementById('reportScanBtn');
  if (reportScanBtn) reportScanBtn.addEventListener('click', function () {
    if (reportBikeIdInput && !reportBikeIdInput.value) reportBikeIdInput.value = 'BIKE-' + Math.floor(1000 + Math.random() * 9000);
  });

  var reportSubmitBtn = document.getElementById('reportSubmitBtn');
  if (reportSubmitBtn) reportSubmitBtn.addEventListener('click', function () {
    var bikeId = reportBikeIdInput ? reportBikeIdInput.value.trim() : '';
    var issue = reportIssueInput ? reportIssueInput.value.trim() : '';
    if (!bikeId) { alert('자전거 ID를 스캔하거나 입력해 주세요.'); return; }
    if (!issue) { alert('고장 내용을 입력해 주세요.'); return; }

    if (window.DB && window.DB.bike_report) {
      var nextId = window.DB.bike_report.reduce(function (max, r) { return Math.max(max, r.id); }, 0) + 1;
      window.DB.bike_report.push({
        id: nextId,
        bike_id: bikeId,
        station_id: currentDetailStationId,
        reported_by: CURRENT_USER_ID,
        issue: issue,
        status: '수리대기',
        reported_at: new Date().toISOString()
      });
    }
    alert('고장 신고가 접수되었습니다. 빠르게 처리하겠습니다!');
    closeReportModal();
  });

  // ── 하단 안내 링크 (고객센터/정류소 제안/개인정보처리방침) ────────────────────────────────
  var FOOTER_TOPICS = {
    support: { title: '고객센터', body: '<p>따릉이 이용 중 불편사항이나 문의사항은 아래로 연락해 주세요.</p><p class="fw-bold mb-0">1599-0120 (평일 09:00~18:00)</p>' },
    suggest: { title: '정류소 제안', body: '<p>새로운 대여소 설치가 필요한 위치가 있다면 알려주세요.</p><p class="text-muted mb-0">추천 위치와 사유를 홈페이지(bikeseoul.com) 제안 게시판에 남겨주시면 검토 후 반영됩니다.</p>' },
    privacy: { title: '개인정보처리방침', body: '<p>따릉이는 회원 가입 시 수집한 개인정보를 서비스 제공 목적으로만 이용하며, 관련 법령에 따라 안전하게 관리합니다.</p><p class="text-muted mb-0">자세한 내용은 홈페이지의 개인정보처리방침 전문을 참고해 주세요.</p>' }
  };
  var footerInfoBackdrop = document.getElementById('footerInfoBackdrop');
  var footerInfoModal = document.getElementById('footerInfoModal');
  var footerInfoTitle = document.getElementById('footerInfoTitle');
  var footerInfoBody = document.getElementById('footerInfoBody');
  var footerInfoCloseBtn = document.getElementById('footerInfoCloseBtn');

  function closeFooterInfo() {
    if (footerInfoBackdrop) footerInfoBackdrop.classList.remove('show');
    if (footerInfoModal) footerInfoModal.classList.remove('show');
  }
  document.querySelectorAll('.footer-link-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
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

  // ── 지도: 좌측 패널에 가려지는 대여소는 마우스 오버로 선택되지 않도록 처리 ────────────────────────────────
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
  setTimeout(applySidebarOcclusion, 150);

  setTimeout(renderFavorites, 100);
})();