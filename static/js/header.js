// header.js
(function () {
  function getWeatherData() {
    if (!window.DB || !window.DB.environment_log) return null;
    const logs = window.DB.environment_log;

    const todayLogs = logs.filter(l => l.recorded_at.startsWith('2026-07-23'));
    const yestLogs = logs.filter(l => l.recorded_at.startsWith('2026-07-22'));

    if (!todayLogs.length || !yestLogs.length) return null;

    const avg = (arr, key) => arr.reduce((sum, item) => sum + item[key], 0) / arr.length;

    const today = { temp: avg(todayLogs, 'temperature'), rain: avg(todayLogs, 'precipitation'), pm10: avg(todayLogs, 'pm10') };
    const yest = { temp: avg(yestLogs, 'temperature'), rain: avg(yestLogs, 'precipitation'), pm10: avg(yestLogs, 'pm10') };
    const diff = { temp: today.temp - yest.temp, rain: today.rain - yest.rain, pm10: today.pm10 - yest.pm10 };

    const getTrendHtml = (val, unit) => {
      if (val > 0) return `<span class="ms-1 text-danger">▲${val.toFixed(1)}${unit}</span>`;
      if (val < 0) return `<span class="ms-1 text-primary">▼${Math.abs(val).toFixed(1)}${unit}</span>`;
      return `<span class="ms-1 text-secondary">-</span>`;
    };

    const pmStatus = today.pm10 <= 15 ? '좋음' : (today.pm10 <= 35 ? '보통' : '나쁨');
    const demandMsg = diff.temp > 0 ? `어제보다 기온 +${diff.temp.toFixed(1)}°C — 자전거 수요 증가 예상` : `어제 대비 기온 하락 — 자전거 수요 감소 예상`;

    return { today, diff, getTrendHtml, pmStatus, demandMsg };
  }

  function generateWeatherHtml() {
    const w = getWeatherData();
    if (!w) return { badge: '날씨 정보 없음', popup: '<div class="p-3">데이터를 불러올 수 없습니다.</div>' };

    const badgeHtml = `
      <div><i class="bi bi-thermometer-half weather-icon-temp"></i> ${w.today.temp.toFixed(1)}°C <br> ${w.getTrendHtml(w.diff.temp, '°')}</div>
      <div class="weather-badge-divider"><i class="bi bi-cloud-drizzle weather-icon-rain"></i> ${w.today.rain.toFixed(1)}mm <br> ${w.getTrendHtml(w.diff.rain, 'mm')}</div>
      <div class="weather-badge-divider"><i class="bi bi-wind weather-icon-wind"></i> ${w.pmStatus} <br> ${w.getTrendHtml(w.diff.pm10, '')}</div>
    `;

    const popupHtml = `
      <div class="weather-popup-head">오늘 날씨 — 어제 대비</div>
      <div class="weather-popup-sub">실시간 평균 관측 기준</div>
      <div class="weather-row"><span><i class="bi bi-thermometer-half me-2 weather-icon-temp"></i> 기온</span><strong>${w.today.temp.toFixed(1)}°C ${w.getTrendHtml(w.diff.temp, '°C')}</strong></div>
      <div class="weather-row"><span><i class="bi bi-cloud-drizzle me-2 weather-icon-rain"></i> 강수량</span><strong>${w.today.rain.toFixed(1)}mm ${w.getTrendHtml(w.diff.rain, 'mm')}</strong></div>
      <div class="weather-row"><span><i class="bi bi-wind me-2 weather-icon-wind"></i> 미세먼지 (PM10)</span><strong>${w.today.pm10.toFixed(0)}㎍/㎥ ${w.getTrendHtml(w.diff.pm10, '㎍')}</strong></div>
      <div class="weather-footer-box">${w.demandMsg}</div>
    `;
    return { badge: badgeHtml, popup: popupHtml };
  }

  window.renderHeader = function (activeTab, userInfo) {
    const root = document.getElementById('app-header');
    if (!root) return;

    let user = window.DB && window.DB.account ? window.DB.account.find(a => a.id === userInfo?.id || a.role === userInfo?.role) : userInfo;
    if (!user) user = { role: 'user', name: '홍길동', id: 1 };

    if (!activeTab) {
      const path = window.location.pathname;
      if (path.includes('dispatch')) activeTab = 'dispatch';
      else if (path.includes('analytics')) activeTab = 'analytics';
      else if (path.includes('rental')) activeTab = 'history';
      else if (path.includes('driver')) activeTab = 'tasks';
      else activeTab = 'dashboard';
    }

    if (user.role === 'seoul_admin') renderAdminHeader(root, activeTab, user);
    else if (user.role === 'driver') renderDriverHeader(root, activeTab, user);
    else if (user.role === 'user') renderUserHeader(root, activeTab, user);

    setupDropdowns();
    setupMobileMenu();
  };

  function renderAdminHeader(root, activeTab, user) {
    const finalName = user.name || '김관제'; const initial = finalName.charAt(0);
    const roleName = '중앙 본부 관리자';
    const w = generateWeatherHtml();

    const html = `<header class="site-header"><div class="d-flex align-items-center"><a href="index.html" class="brand-logo-link"><img src="img/logo.png" alt="따릉이 로고" class="brand-logo-img"></a><div class="brand-subtext d-none d-sm-block">따릉이 관제<br><span class="brand-district">${roleName}</span></div><nav class="sh-nav ms-4 d-none d-lg-flex" aria-label="관리자 메뉴"><a href="admin_dashboard.html" class="nav-menu-item ${activeTab === 'map' ? 'active' : ''}"><i class="bi bi-map"></i> 관제 지도</a><a href="admin_dispatch.html" class="nav-menu-item ${activeTab === 'dispatch' ? 'active' : ''}"><i class="bi bi-card-checklist"></i> 지시서 관리</a><a href="admin_analytics.html" class="nav-menu-item ${activeTab === 'analytics' ? 'active' : ''}"><i class="bi bi-bar-chart-fill"></i> 데이터 분석</a></nav></div><div class="sh-right"><div class="weather-badge-wrap d-none d-lg-block"><div class="weather-badge" id="weatherToggleBtn">${w.badge}</div><div class="weather-popup" id="weatherPopup">${w.popup}</div></div><div class="position-relative"><button class="sh-icon-btn" id="sh-notif-btn"><i class="bi bi-bell"></i><span class="sh-dot" id="notif-dot"></span></button><div class="sh-dropdown sh-notif-menu" id="sh-notif-menu"><div class="sh-menu-head" id="notif-count">알림 0건</div><div id="notif-list"></div></div></div><div class="user-profile-wrap d-none d-lg-flex" id="sh-user-btn"><div class="profile-icon header-profile-icon">${initial}</div><div class="profile-text-group"><div class="header-profile-name">${finalName}</div><div class="header-profile-role">${roleName}</div></div><div class="sh-dropdown sh-user-menu" id="sh-user-menu" style="right: 0 !important; left: auto !important;"><div class="sh-menu-head"><div class="name header-dropdown-name">${finalName}</div><div class="id header-dropdown-role">${roleName}</div></div><a href="user_profile.html" class="sh-menu-item"><i class="bi bi-person"></i>내 프로필</a><a href="user_profile.html" class="sh-menu-item"><i class="bi bi-gear"></i>설정</a><a href="index.html" class="sh-menu-item danger"><i class="bi bi-box-arrow-right"></i>로그아웃</a></div></div><button class="hamburger-btn d-lg-none" id="mobileMenuBtn" aria-label="메뉴 열기"><span></span><span></span><span></span></button></div></header><div class="mobile-menu-overlay" id="mobileMenu"><div class="mobile-menu-content"><div class="mobile-menu-header"><div class="mobile-profile-wrap d-flex align-items-center gap-3"><div class="profile-icon header-profile-icon" style="width: 48px; height: 48px; font-size: 1.3rem;">${initial}</div><div class="profile-text-group"><div class="header-profile-name" style="font-size: 1.15rem;">${finalName}</div><div class="header-profile-role" style="font-size: 0.85rem;">${roleName}</div></div></div><button class="mobile-close-btn" id="mobileCloseBtn"><i class="bi bi-x-lg"></i></button></div><div class="mobile-menu-body"><div class="mobile-weather-section"><div class="weather-badge mobile-weather-badge" id="mobileWeatherToggleBtn">${w.badge}</div><div class="mobile-weather-popup" id="mobileWeatherPopup">${w.popup}</div></div><nav class="mobile-nav"><a href="admin_dashboard.html" class="mobile-nav-item ${activeTab === 'map' ? 'active' : ''}"><i class="bi bi-map fs-5"></i> 관제 지도</a><a href="admin_dispatch.html" class="mobile-nav-item ${activeTab === 'dispatch' ? 'active' : ''}"><i class="bi bi-card-checklist fs-5"></i> 지시서 관리</a><a href="admin_analytics.html" class="mobile-nav-item ${activeTab === 'analytics' ? 'active' : ''}"><i class="bi bi-bar-chart-fill fs-5"></i> 데이터 분석</a></nav><div class="mobile-menu-divider"></div><nav class="mobile-nav"><a href="user_profile.html" class="mobile-nav-item"><i class="bi bi-person fs-5"></i> 내 프로필</a><a href="user_profile.html" class="mobile-nav-item"><i class="bi bi-gear fs-5"></i> 설정</a><a href="index.html" class="mobile-nav-item danger"><i class="bi bi-box-arrow-right fs-5"></i> 로그아웃</a></nav></div></div></div>`;
    root.outerHTML = html; buildNotifications(user);
  }

  function renderDriverHeader(root, activeTab, user) {
    const initial = user.name ? user.name.charAt(0) : '기'; const districtName = user.district_name || '마포구';
    // 기사 헤더 디자인 완벽 동기화 (세로 정렬 텍스트 + 볼드)
    const html = `<header class="site-header"><div class="d-flex align-items-center"><a href="index.html" class="brand-logo-link"><img src="img/logo.png" alt="따릉이 로고" class="brand-logo-img"></a><div class="d-none d-sm-flex align-items-center" style="border-left: 1px solid #e3ebe4; padding-left: 14px; margin-left: 6px;"><div style="line-height: 1.2;"><div style="font-size: 11px; color: #6b7d70;">따릉이 재배치</div><div style="font-size: 12.5px; font-weight: 800; color: #333;">${districtName}</div></div></div><a href="driver_dashboard.html" class="ms-4 d-flex align-items-center" style="font-size: 14.5px; font-weight: 800; color: #333; text-decoration: none;"><i class="bi bi-check-square me-2" style="font-size: 1.1rem;"></i> 내 작업</a></div><div class="sh-right"><div class="position-relative"><button class="sh-icon-btn" id="sh-notif-btn"><i class="bi bi-bell"></i><span class="sh-dot" id="notif-dot"></span></button><div class="sh-dropdown sh-notif-menu" id="sh-notif-menu"><div class="sh-menu-head" id="notif-count">알림 0건</div><div id="notif-list"></div></div></div><div class="user-profile-wrap d-none d-lg-flex" id="sh-user-btn"><div class="profile-icon driver">${initial}</div><div class="profile-text-group"><div class="header-profile-name">${user.name}</div><div class="header-profile-role">재배치 기사</div></div><div class="sh-dropdown sh-user-menu" id="sh-user-menu" style="right: 0 !important; left: auto !important;"><div class="sh-menu-head"><div class="name">${user.name}</div><div class="id">재배치 기사</div></div><a href="user_profile.html" class="sh-menu-item"><i class="bi bi-person"></i>내 프로필</a><a href="user_profile.html" class="sh-menu-item"><i class="bi bi-gear"></i>설정</a><a href="index.html" class="sh-menu-item danger"><i class="bi bi-box-arrow-right"></i>로그아웃</a></div></div><button class="hamburger-btn d-lg-none" id="mobileMenuBtn" aria-label="메뉴 열기"><span></span><span></span><span></span></button></div></header><div class="mobile-menu-overlay" id="mobileMenu"><div class="mobile-menu-content"><div class="mobile-menu-header"><div class="mobile-profile-wrap d-flex align-items-center gap-3"><div class="profile-icon driver" style="width: 48px; height: 48px; font-size: 1.3rem;">${initial}</div><div class="profile-text-group"><div class="header-profile-name" style="font-size: 1.15rem;">${user.name}</div><div class="header-profile-role" style="font-size: 0.85rem;">재배치 기사</div></div></div><button class="mobile-close-btn" id="mobileCloseBtn"><i class="bi bi-x-lg"></i></button></div><div class="mobile-menu-body"><nav class="mobile-nav"><a href="user_profile.html" class="mobile-nav-item"><i class="bi bi-person fs-5"></i> 내 프로필</a><a href="user_profile.html" class="mobile-nav-item"><i class="bi bi-gear fs-5"></i> 설정</a><a href="index.html" class="mobile-nav-item danger"><i class="bi bi-box-arrow-right fs-5"></i> 로그아웃</a></nav></div></div></div>`;
    root.outerHTML = html; buildNotifications(user);
  }

  function renderUserHeader(root, activeTab, user) {
    const initial = user.name ? user.name.charAt(0) : '홍';
    const roleName = '이용자'; // '일반 이용자' -> '이용자'
    const w = generateWeatherHtml();

    const html = `
      <header class="site-header">
        <div class="d-flex align-items-center">
          <a href="index.html" class="brand-logo-link">
            <img src="img/logo.png" alt="따릉이 로고" class="brand-logo-img" onerror="this.style.display='none';">
          </a>
          <div class="brand-subtext d-none d-sm-block">따릉이<br><span class="brand-district">실시간 현황</span></div>
          <nav class="sh-nav ms-4 d-none d-lg-flex" aria-label="이용자 메뉴">
            <a href="user_dashboard.html" class="nav-menu-item ${activeTab === 'dashboard' || activeTab === 'home' ? 'active' : ''}"><i class="bi bi-house"></i> 홈</a>
            <a href="user_rental.html" class="nav-menu-item ${activeTab === 'rental' || activeTab === 'history' ? 'active' : ''}"><i class="bi bi-clock-history"></i> 대여/반납 이력</a>
          </nav>
        </div>
        
        <div class="sh-right">
          <div class="weather-badge-wrap d-none d-lg-block">
            <div class="weather-badge" id="weatherToggleBtn">${w.badge}</div>
            <div class="weather-popup" id="weatherPopup">${w.popup}</div>
          </div>
          <div class="position-relative">
            <button class="sh-icon-btn" id="sh-notif-btn"><i class="bi bi-bell"></i><span class="sh-dot" id="notif-dot"></span></button>
            <div class="sh-dropdown sh-notif-menu" id="sh-notif-menu"><div class="sh-menu-head" id="notif-count">알림 0건</div><div id="notif-list"></div></div>
          </div>
          <div class="user-profile-wrap d-none d-lg-flex" id="sh-user-btn">
            <div class="profile-icon user-icon-bg">${initial}</div>
            <div class="profile-text-group">
              <div class="header-profile-name">${user.name}님</div>
              <div class="header-profile-role">${roleName}</div>
            </div>
            <div class="sh-dropdown sh-user-menu" id="sh-user-menu" style="right: 0 !important; left: auto !important;">
              <div class="sh-menu-head"><div class="name">${user.name}님</div><div class="id">${roleName}</div></div>
              <a href="user_profile.html" class="sh-menu-item"><i class="bi bi-person"></i>내 프로필</a>
              <a href="user_profile.html" class="sh-menu-item"><i class="bi bi-gear"></i>설정</a>
              <a href="index.html" class="sh-menu-item danger"><i class="bi bi-box-arrow-right"></i>로그아웃</a>
            </div>
          </div>
          <button class="hamburger-btn d-lg-none" id="mobileMenuBtn" aria-label="메뉴 열기">
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      <div class="mobile-menu-overlay" id="mobileMenu">
        <div class="mobile-menu-content">
          <div class="mobile-menu-header">
            <div class="mobile-profile-wrap d-flex align-items-center gap-3">
              <div class="profile-icon user-icon-bg" style="width: 48px; height: 48px; font-size: 1.3rem;">${initial}</div>
              <div class="profile-text-group">
                <div class="header-profile-name" style="font-size: 1.15rem;">${user.name}님</div>
                <div class="header-profile-role" style="font-size: 0.85rem;">${roleName}</div>
              </div>
            </div>
            <button class="mobile-close-btn" id="mobileCloseBtn"><i class="bi bi-x-lg"></i></button>
          </div>
          <div class="mobile-menu-body">
            <div class="mobile-weather-section">
              <div class="weather-badge mobile-weather-badge" id="mobileWeatherToggleBtn">${w.badge}</div>
              <div class="mobile-weather-popup" id="mobileWeatherPopup">${w.popup}</div>
            </div>
            <nav class="mobile-nav">
              <a href="user_dashboard.html" class="mobile-nav-item ${activeTab === 'dashboard' || activeTab === 'home' ? 'active' : ''}"><i class="bi bi-house fs-5"></i> 홈</a>
              <a href="user_rental.html" class="mobile-nav-item ${activeTab === 'rental' || activeTab === 'history' ? 'active' : ''}"><i class="bi bi-clock-history fs-5"></i> 대여/반납 이력</a>
            </nav>
            <div class="mobile-menu-divider"></div>
            <nav class="mobile-nav">
              <a href="user_profile.html" class="mobile-nav-item"><i class="bi bi-person fs-5"></i> 내 프로필</a>
              <a href="user_profile.html" class="mobile-nav-item"><i class="bi bi-gear fs-5"></i> 설정</a>
              <a href="index.html" class="mobile-nav-item danger"><i class="bi bi-box-arrow-right fs-5"></i> 로그아웃</a>
            </nav>
          </div>
        </div>
      </div>
    `;
    root.outerHTML = html;
    buildNotifications(user);
  }

  function setupMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileCloseBtn = document.getElementById('mobileCloseBtn');
    const mobileMenu = document.getElementById('mobileMenu');

    if (mobileMenuBtn && mobileMenu) mobileMenuBtn.addEventListener('click', () => mobileMenu.classList.add('show'));
    if (mobileCloseBtn && mobileMenu) mobileCloseBtn.addEventListener('click', () => mobileMenu.classList.remove('show'));
    if (mobileMenu) mobileMenu.addEventListener('click', (e) => { if (e.target === mobileMenu) mobileMenu.classList.remove('show'); });

    const mobileWeatherBtn = document.getElementById('mobileWeatherToggleBtn');
    const mobileWeatherPopup = document.getElementById('mobileWeatherPopup');
    if (mobileWeatherBtn && mobileWeatherPopup) {
      mobileWeatherBtn.addEventListener('click', (e) => { e.stopPropagation(); mobileWeatherPopup.classList.toggle('show'); });
    }
  }

  function buildNotifications(user) {
    const listEl = document.getElementById('notif-list');
    const countEl = document.getElementById('notif-count');
    const dotEl = document.getElementById('notif-dot');
    if (!listEl || !window.DB) return;

    let notifHTML = ''; let count = 0;

    if (user.role === 'seoul_admin') {
      const fullStations = window.DB.station.filter(s => s.stock_level === '과포화' || s.stock_level === '고갈심각');
      fullStations.forEach(st => { notifHTML += `<div class="sh-notif-item"><div class="title">${st.name} <strong class="text-danger">${st.stock_level}</strong> 발생</div></div>`; count++; });
      const orders = window.DB.dispatch_order.filter(o => o.status === '대기');
      orders.forEach(o => { const toSt = window.DB.station.find(s => s.id === o.to_station_id); notifHTML += `<div class="sh-notif-item urgent-notif"><div class="title"><span class="badge bg-danger me-1">긴급</span> 신규 재배치 명령: ${toSt ? toSt.name : '알수없음'}</div></div>`; count++; });
      const reports = window.DB.bike_report.filter(r => r.status !== '해결완료');
      reports.forEach(r => { notifHTML += `<div class="sh-notif-item"><div class="title">고장 접수: ${r.issue}</div></div>`; count++; });
    } else if (user.role === 'driver') {
      const myOrders = window.DB.dispatch_order.filter(o => o.driver_id === user.id);
      myOrders.forEach(o => { const toSt = window.DB.station.find(s => s.id === o.to_station_id); notifHTML += `<div class="sh-notif-item"><div class="title">할당된 지시: ${toSt ? toSt.name : ''}으로 이동</div></div>`; count++; });
      const myReports = window.DB.bike_report.filter(r => r.reported_by === user.id && r.status !== '해결완료');
      if (myReports.length > 0) { notifHTML += `<div class="sh-notif-item"><div class="title">고장 수거 지시: ${myReports.length}건</div></div>`; count++; }
    } else if (user.role === 'user') {
      notifHTML += `<div class="sh-notif-item"><div class="title">알림(뭘 적을지 몰라서 그냥 이렇게)</div></div>`; count++;
      const myRentals = window.DB.rental.filter(r => r.user_id === user.id);
      myRentals.forEach(r => { if (r.status === '완료') { notifHTML += `<div class="sh-notif-item"><div class="title">최근 이용 완료 (이동거리: ${r.distance_km}km)</div></div>`; count++; } });
    }

    if (count > 0) { countEl.textContent = `알림 ${count}건`; listEl.innerHTML = notifHTML; if (dotEl) dotEl.style.display = 'block'; }
    else { listEl.innerHTML = '<div class="sh-notif-item"><div class="title" style="color:#888;">새로운 알림이 없습니다.</div></div>'; }
  }

  function setupDropdowns() {
    const notifBtn = document.getElementById('sh-notif-btn'); const notifMenu = document.getElementById('sh-notif-menu');
    const userBtn = document.getElementById('sh-user-btn'); const userMenu = document.getElementById('sh-user-menu');
    const weatherBtn = document.getElementById('weatherToggleBtn'); const weatherPopup = document.getElementById('weatherPopup');

    function closeAll() {
      if (notifMenu) notifMenu.classList.remove('show');
      if (userMenu) userMenu.classList.remove('show');
      if (weatherPopup) weatherPopup.classList.remove('show');
    }
    function toggleMenu(menu) {
      const willOpen = !menu.classList.contains('show');
      closeAll();
      if (willOpen) menu.classList.add('show');
    }

    if (notifBtn && notifMenu) notifBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(notifMenu); });
    if (userBtn && userMenu) userBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(userMenu); });
    if (weatherBtn && weatherPopup) weatherBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(weatherPopup); });
    document.addEventListener('click', closeAll);
  }
})();