// user_dashboard.js
(function () {
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
      capacity: s.capacity
    };
  });

  var statusRank = { ok: 0, mid: 1, busy: 2 };
  var statusLabel = { ok: "여유", mid: "보통", busy: "혼잡" };

  var tabButtons = document.querySelectorAll(".status-tabs button");
  var currentSort = "distance";
  var currentFilter = "all";
  var currentSearchKeyword = "";

  function formatDistance(m) {
    return m >= 1000 ? (m / 1000).toFixed(1) + "km" : m + "m";
  }

  function getFiltered() {
    var filtered = currentFilter === "all" ? stations.slice() : stations.filter(function (s) { return s.status === currentFilter; });

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
      var leftPct = (15 + (s.id * 37) % 70) + '%';
      var topPct = (15 + (s.id * 41) % 70) + '%';

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

    var countText = "· " + list.length + "곳";
    document.querySelectorAll(".status-count").forEach(function (el) { el.textContent = countText; });
  }

  document.addEventListener("input", function (e) {
    if (e.target.id === "stationSearch") {
      currentSearchKeyword = e.target.value;
      render();
    }
  });

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var sort = btn.dataset.sort;
      tabButtons.forEach(function (b) { b.classList.toggle("active", b.dataset.sort === sort); });
      currentSort = sort;
      render();
    });
  });

  function setFilter(f) {
    currentFilter = f;
    document.querySelectorAll(".filter-chip").forEach(function (el) { el.classList.toggle("active", el.dataset.filter === f); });
    render();
  }
  document.querySelectorAll(".filter-chip").forEach(function (el) { el.addEventListener("click", function () { setFilter(el.dataset.filter); }); });

  var statusPanel = document.getElementById("statusPanel");
  var statusPanelToggle = document.getElementById("statusPanelToggle");
  function setStatusPanelCollapsed(collapsed) {
    if (statusPanel) statusPanel.classList.toggle("collapsed", collapsed);
    if (statusPanelToggle) statusPanelToggle.setAttribute("aria-expanded", String(!collapsed));
    var reopenPill = document.getElementById('statusReopenPill');
    if (reopenPill) reopenPill.classList.toggle('show', collapsed);
  }
  if (statusPanelToggle) { statusPanelToggle.addEventListener("click", function (e) { e.preventDefault(); setStatusPanelCollapsed(!statusPanel.classList.contains("collapsed")); }); }
  var reopenPill = document.getElementById('statusReopenPill');
  if (reopenPill) reopenPill.addEventListener('click', function() { setStatusPanelCollapsed(false); });

  var dashboardEl = document.querySelector(".dashboard");
  var sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
  if (sidebarToggleBtn) { sidebarToggleBtn.addEventListener("click", function () { var collapsed = dashboardEl.classList.toggle("sidebar-collapsed"); sidebarToggleBtn.setAttribute("aria-expanded", String(!collapsed)); }); }

  render();

  var profileBtn = document.getElementById("profileMenuBtn");
  var backdrop = document.getElementById("sheetBackdrop");
  var guidePanel = document.getElementById("guidePanel");
  var profilePanel = document.getElementById("profilePanel");
  var favoritesPanel = document.getElementById("favoritesPanel");
  var panels = [guidePanel, profilePanel, favoritesPanel];

  function closeAllPanels() {
    panels.forEach(function (p) { if (p) { p.classList.remove("open"); p.setAttribute("aria-hidden", "true"); } });
    if (backdrop) backdrop.classList.remove("open");
    if (profileBtn) profileBtn.setAttribute("aria-expanded", "false");
  }

  function openPanel(panel, opts) {
    if (!panel) return;
    var wasOpen = panel.classList.contains("open");
    closeAllPanels();
    if (wasOpen) return;
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false");
    if (backdrop) backdrop.classList.add("open");
    if (opts && opts.isProfile && profileBtn) profileBtn.setAttribute("aria-expanded", "true");
  }

  var guideClose = document.getElementById("guideClose"); if (guideClose) guideClose.addEventListener("click", closeAllPanels);
  var profileClose = document.getElementById("profileClose"); if (profileClose) profileClose.addEventListener("click", closeAllPanels);
  var favoritesClose = document.getElementById("favoritesClose"); if (favoritesClose) favoritesClose.addEventListener("click", closeAllPanels);
  if (backdrop) backdrop.addEventListener("click", closeAllPanels);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAllPanels(); });

  var favList = document.getElementById('favList');
  var favEmpty = document.getElementById('favEmpty');
  function renderFavorites() {
    if (!window.DB) return;
    var myFavs = window.DB.favorite_station.filter(function(f) { return f.user_id === 1; });
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
        var idx = window.DB.favorite_station.findIndex(function(f) { return f.user_id === 1 && f.station_id === stId; });
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
      renderFavorites();
      openPanel(favoritesPanel);
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

  function updateSdFavIcon() {
    var isFav = window.DB.favorite_station.some(function(f) { return f.user_id === 1 && f.station_id === currentDetailStationId; });
    if(sdFavBtn) sdFavBtn.innerHTML = isFav ? '<i class="bi bi-star-fill text-warning"></i>' : '<i class="bi bi-star text-muted"></i>';
  }

  function openStationDetail(id) {
    var st = stations.find(function(s) { return s.id === id; });
    if (!st) return;
    currentDetailStationId = id;
    sdTitle.textContent = st.name;
    sdAddr.textContent = st.addr;

    // 일반/새싹 데이터 바인딩
    if(sdGeneral) sdGeneral.textContent = st.generalCount + '대';
    if(sdSprout) sdSprout.textContent = st.sproutCount + '대';
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
      var favIdx = window.DB.favorite_station.findIndex(function(f) { return f.user_id === 1 && f.station_id === currentDetailStationId; });
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
  setTimeout(renderFavorites, 100);
})();