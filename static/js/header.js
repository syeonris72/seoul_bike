// header.js
(function () {

  // 🌤️ 1. 날씨 데이터 처리 영역

  // 헤더 최초 렌더링 시(백엔드 응답 오기 전) 잠깐 보여주는 자리표시자
  function weatherLoadingHtml() {
    return { badge: '날씨 불러오는 중…', popup: '<div class="p-3">불러오는 중…</div>' };
  }

  // 증감(▲/▼) HTML 생성 (null/undefined면 비교 대상 데이터가 없다는 뜻이라 '-' 표시)
  function weatherTrendHtml(val, unit) {
    if (val === null || val === undefined) return `<span class="text-secondary weather-trend">-</span>`;
    if (val > 0) return `<span class="text-success weather-trend">▲${val.toFixed(1)}${unit}</span>`;
    if (val < 0) return `<span class="text-danger weather-trend">▼${Math.abs(val).toFixed(1)}${unit}</span>`;
    return `<span class="text-secondary weather-trend">-</span>`;
  }

  // GET /analytics/weather-summary 응답을 상단 날씨 뱃지/팝업 HTML로 변환
  function formatWeatherHtml(summary) {
    if (!summary || summary.today_temp === null || summary.today_temp === undefined) {
      return { badge: '날씨 정보 없음', popup: '<div class="p-3">데이터를 불러올 수 없습니다.</div>' };
    }

    const pm10 = summary.today_pm10;
    const pmStatus = (pm10 === null || pm10 === undefined) ? '-' : (pm10 <= 15 ? '좋음' : (pm10 <= 35 ? '보통' : '나쁨'));
    let measuredLabel = '';
    if (summary.measured_label) {
      const d = new Date(summary.measured_label);
      if (!isNaN(d)) measuredLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 기준`;
    }
    const rain = summary.today_rain || 0;

    const badgeHtml = `
      <span class="weather-item"><i class="bi bi-thermometer-half weather-icon-temp"></i>${summary.today_temp.toFixed(1)}°C ${weatherTrendHtml(summary.diff_temp, '°')}</span>
      <span class="weather-sep">|</span>
      <span class="weather-item"><i class="bi bi-cloud-drizzle weather-icon-rain"></i>${rain.toFixed(1)}mm ${weatherTrendHtml(summary.diff_rain, 'mm')}</span>
      <span class="weather-sep">|</span>
      <span class="weather-item"><i class="bi bi-wind weather-icon-wind"></i>${pmStatus} ${weatherTrendHtml(summary.diff_pm10, '')}</span>
    `;

    const popupHtml = `
      <div class="weather-popup-head">날씨</div>
      <div class="weather-popup-sub">${measuredLabel}</div>
      <div class="weather-row"><span><i class="bi bi-thermometer-half me-2 weather-icon-temp"></i> 기온</span><strong>${summary.today_temp.toFixed(1)}°C ${weatherTrendHtml(summary.diff_temp, '°C')}</strong></div>
      <div class="weather-row"><span><i class="bi bi-cloud-drizzle me-2 weather-icon-rain"></i> 강수량</span><strong>${rain.toFixed(1)}mm ${weatherTrendHtml(summary.diff_rain, 'mm')}</strong></div>
      <div class="weather-row"><span><i class="bi bi-wind me-2 weather-icon-wind"></i> 미세먼지</span><strong>${(pm10 === null || pm10 === undefined) ? '-' : pm10.toFixed(0)}㎍/㎥ ${weatherTrendHtml(summary.diff_pm10, '㎍')}</strong></div>
    `;
    return { badge: badgeHtml, popup: popupHtml };
  }

  async function loadWeatherHtml() {
    try {
      const summary = await api.get('/analytics/weather-summary');
      return formatWeatherHtml(summary);
    } catch (e) {
      return { badge: '날씨 정보 없음', popup: '<div class="p-3">데이터를 불러올 수 없습니다.</div>' };
    }
  }

  // 헤더 렌더링 시점엔 아직 데이터가 없으니, 백엔드 응답이 도착하면 데스크탑/모바일 뱃지·팝업을 한 번에 갱신한다
  function refreshWeatherDom(w) {
    [['weatherToggleBtn', 'weatherPopup'], ['mobileWeatherToggleBtn', 'mobileWeatherPopup']].forEach(function (ids) {
      const badgeEl = document.getElementById(ids[0]);
      const popupEl = document.getElementById(ids[1]);
      if (badgeEl) badgeEl.innerHTML = w.badge;
      if (popupEl) popupEl.innerHTML = w.popup;
    });
  }


  // 🚀 2. 헤더 렌더링 (메인 진입점)

  // 모든 페이지에서 공통으로 호출되는 메인 헤더 그리기 함수
  window.renderHeader = function (activeTab, userInfo) {
    const root = document.getElementById('app-header');
    if (!root) return;

    let user = userInfo;
    if (!user) user = { role: 'user', name: '홍길동', id: 1 };

    // 현재 접속한 페이지 주소를 기반으로 네비게이션 활성화(Active) 탭 설정
    if (!activeTab) {
      const path = window.location.pathname;
      if (path.includes('dispatch')) activeTab = 'dispatch';
      else if (path.includes('reports')) activeTab = 'reports';
      else if (path.includes('analytics')) activeTab = 'analytics';
      else if (path.includes('rental')) activeTab = 'history';
      else if (path.includes('driver-map')) activeTab = 'route';
      else if (path.includes('driver')) activeTab = 'tasks';
      else activeTab = 'dashboard';
    }

    if (user.role === 'admin') renderAdminHeader(root, activeTab, user);
    else if (user.role === 'driver') renderDriverHeader(root, activeTab, user);
    else if (user.role === 'user') renderUserHeader(root, activeTab, user);

    setupDropdowns();
    setupMobileMenu();

    // 날씨는 백엔드 응답을 기다려야 하니 렌더링 이후 비동기로 채워 넣는다
    loadWeatherHtml().then(refreshWeatherDom);
  };

  // 프로필 설정 드롭다운 메뉴용 HTML 템플릿
  function profileMenuHtml(profilePage) {
    return `
      <a href="${profilePage}" class="sh-menu-item"><i class="bi bi-person-gear"></i>프로필 · 설정</a>
      <a href="index.html" class="sh-menu-item danger"><i class="bi bi-box-arrow-right"></i>로그아웃</a>
    `;
  }
  function mobileProfileMenuHtml(profilePage) {
    return `
      <a href="${profilePage}" class="mobile-nav-item"><i class="bi bi-person-gear fs-5"></i> 프로필 · 설정</a>
      <a href="index.html" class="mobile-nav-item danger"><i class="bi bi-box-arrow-right fs-5"></i> 로그아웃</a>
    `;
  }


  // 👑 3. 역할별 개별 헤더 렌더링 로직

  // [관리자 전용 헤더]
  function renderAdminHeader(root, activeTab, user) {
    const finalName = user.name || '김관제'; const initial = finalName.charAt(0);
    const roleName = '관리자';
    const w = weatherLoadingHtml();

    const html = `<header class="site-header"><div class="d-flex align-items-center"><a href="admin-dashboard.html" class="brand-logo-link"><img src="img/logo.png" alt="따릉이 로고" class="brand-logo-img"></a><div class="brand-subtext d-none d-sm-block d-lg-none d-xl-block">따릉이 관제<br><span class="brand-district">${roleName}</span></div><nav class="sh-nav ms-4 d-none d-lg-flex" aria-label="관리자 메뉴"><a href="admin-dashboard.html" class="nav-menu-item ${activeTab === 'map' ? 'active' : ''}"><i class="bi bi-map"></i> 관제 지도</a><a href="admin-dispatch.html" class="nav-menu-item ${activeTab === 'dispatch' ? 'active' : ''}"><i class="bi bi-card-checklist"></i> 지시서 관리</a><a href="admin-reports.html" class="nav-menu-item ${activeTab === 'reports' ? 'active' : ''}"><i class="bi bi-exclamation-triangle"></i> 고장 신고 관리</a><a href="admin-analytics.html" class="nav-menu-item ${activeTab === 'analytics' ? 'active' : ''}"><i class="bi bi-bar-chart-fill"></i> 데이터 분석</a></nav></div><div class="sh-right"><div class="weather-badge-wrap d-none d-lg-block"><div class="weather-badge" id="weatherToggleBtn">${w.badge}</div><div class="weather-popup" id="weatherPopup">${w.popup}</div></div><div class="position-relative"><button class="sh-icon-btn" id="sh-notif-btn"><i class="bi bi-bell"></i><span class="sh-dot" id="notif-dot"></span></button><div class="sh-dropdown sh-notif-menu" id="sh-notif-menu"><div class="sh-menu-head" id="notif-count">알림 0건</div><div id="notif-list" style="max-height:260px; overflow-y:auto;"></div></div></div><div class="user-profile-wrap d-none d-lg-flex" id="sh-user-btn"><div class="profile-icon header-profile-icon">${initial}</div><div class="profile-text-group"><div class="header-profile-name">${finalName}<span class="name-suffix">님</span></div></div><div class="sh-dropdown sh-user-menu" id="sh-user-menu" style="right: 0 !important; left: auto !important;"><div class="sh-menu-head"><div class="profile-menu-head-row"><span class="name header-dropdown-name">${finalName}<span class="name-suffix">님</span></span><span class="header-profile-role">${roleName}</span></div></div>${profileMenuHtml('settings.html')}</div></div><button class="hamburger-btn d-lg-none" id="mobileMenuBtn" aria-label="메뉴 열기"><span></span><span></span><span></span></button></div></header><div class="mobile-menu-overlay" id="mobileMenu"><div class="mobile-menu-content"><div class="mobile-menu-header"><div class="mobile-profile-wrap d-flex align-items-center gap-3"><div class="profile-icon header-profile-icon" style="width: 48px; height: 48px; font-size: 1.3rem;">${initial}</div><div class="profile-text-group"><div class="header-profile-name" style="font-size: 1.15rem;">${finalName}<span class="name-suffix">님</span></div><div class="header-profile-role" style="font-size: 0.85rem;">${roleName}</div></div></div><button class="mobile-close-btn" id="mobileCloseBtn"><i class="bi bi-x-lg"></i></button></div><div class="mobile-menu-body"><div class="mobile-weather-section"><div class="weather-badge mobile-weather-badge" id="mobileWeatherToggleBtn">${w.badge}</div><div class="mobile-weather-popup" id="mobileWeatherPopup">${w.popup}</div></div><nav class="mobile-nav"><a href="admin-dashboard.html" class="mobile-nav-item ${activeTab === 'map' ? 'active' : ''}"><i class="bi bi-map fs-5"></i> 관제 지도</a><a href="admin-dispatch.html" class="mobile-nav-item ${activeTab === 'dispatch' ? 'active' : ''}"><i class="bi bi-card-checklist fs-5"></i> 지시서 관리</a><a href="admin-reports.html" class="mobile-nav-item ${activeTab === 'reports' ? 'active' : ''}"><i class="bi bi-exclamation-triangle fs-5"></i> 고장 신고 관리</a><a href="admin-analytics.html" class="mobile-nav-item ${activeTab === 'analytics' ? 'active' : ''}"><i class="bi bi-bar-chart-fill fs-5"></i> 데이터 분석</a></nav><div class="mobile-menu-divider"></div><nav class="mobile-nav">${mobileProfileMenuHtml('settings.html')}</nav></div></div></div>`;
    root.outerHTML = html; buildNotifications(user);
  }

  // [재배치 기사 전용 헤더]
  function renderDriverHeader(root, activeTab, user) {
    const initial = user.name ? user.name.charAt(0) : '기'; const districtName = user.district_name || '마포구';
    const roleName = '기사';
    const w = weatherLoadingHtml();

    const html = `<header class="site-header"><div class="d-flex align-items-center"><a href="driver-dashboard.html" class="brand-logo-link"><img src="img/logo.png" alt="따릉이 로고" class="brand-logo-img"></a><div class="brand-subtext d-none d-sm-block d-lg-none d-xl-block">따릉이 재배치<br><span class="brand-district">${districtName}</span></div><nav class="sh-nav ms-4 d-none d-lg-flex" aria-label="기사 메뉴"><a href="driver-dashboard.html" class="nav-menu-item ${activeTab === 'tasks' ? 'active' : ''}"><i class="bi bi-card-checklist"></i> 지시서 목록</a><a href="driver-map.html" class="nav-menu-item ${activeTab === 'route' ? 'active' : ''}"><i class="bi bi-signpost-2"></i> 경로 지도</a></nav></div><div class="sh-right"><div class="weather-badge-wrap d-none d-lg-block"><div class="weather-badge" id="weatherToggleBtn">${w.badge}</div><div class="weather-popup" id="weatherPopup">${w.popup}</div></div><div class="position-relative"><button class="sh-icon-btn" id="sh-notif-btn"><i class="bi bi-bell"></i><span class="sh-dot" id="notif-dot"></span></button><div class="sh-dropdown sh-notif-menu" id="sh-notif-menu"><div class="sh-menu-head" id="notif-count">알림 0건</div><div id="notif-list"></div></div></div><div class="user-profile-wrap d-none d-lg-flex" id="sh-user-btn"><div class="profile-icon driver">${initial}</div><div class="profile-text-group"><div class="header-profile-name">${user.name}<span class="name-suffix">님</span></div></div><div class="sh-dropdown sh-user-menu" id="sh-user-menu" style="right: 0 !important; left: auto !important;"><div class="sh-menu-head"><div class="profile-menu-head-row"><span class="name">${user.name}<span class="name-suffix">님</span></span><span class="header-profile-role">${roleName}</span></div></div>${profileMenuHtml('settings.html')}</div></div><button class="hamburger-btn d-lg-none" id="mobileMenuBtn" aria-label="메뉴 열기"><span></span><span></span><span></span></button></div></header><div class="mobile-menu-overlay" id="mobileMenu"><div class="mobile-menu-content"><div class="mobile-menu-header"><div class="mobile-profile-wrap d-flex align-items-center gap-3"><div class="profile-icon driver" style="width: 48px; height: 48px; font-size: 1.3rem;">${initial}</div><div class="profile-text-group"><div class="header-profile-name" style="font-size: 1.15rem;">${user.name}<span class="name-suffix">님</span></div><div class="header-profile-role" style="font-size: 0.85rem;">${roleName}</div></div></div><button class="mobile-close-btn" id="mobileCloseBtn"><i class="bi bi-x-lg"></i></button></div><div class="mobile-menu-body"><div class="mobile-weather-section"><div class="weather-badge mobile-weather-badge" id="mobileWeatherToggleBtn">${w.badge}</div><div class="mobile-weather-popup" id="mobileWeatherPopup">${w.popup}</div></div><nav class="mobile-nav"><a href="driver-dashboard.html" class="mobile-nav-item ${activeTab === 'tasks' ? 'active' : ''}"><i class="bi bi-card-checklist fs-5"></i> 지시서 목록</a><a href="driver-map.html" class="mobile-nav-item ${activeTab === 'route' ? 'active' : ''}"><i class="bi bi-signpost-2 fs-5"></i> 경로 지도</a></nav><div class="mobile-menu-divider"></div><nav class="mobile-nav">${mobileProfileMenuHtml('settings.html')}</nav></div></div></div>`;
    root.outerHTML = html; buildNotifications(user);
  }

  // [일반 회원 전용 헤더]
  function renderUserHeader(root, activeTab, user) {
    const initial = user.name ? user.name.charAt(0) : '홍';
    const roleName = '일반 회원';
    const w = weatherLoadingHtml();

    const html = `
      <header class="site-header">
        <div class="d-flex align-items-center">
          <a href="user-dashboard.html" class="brand-logo-link">
            <img src="img/logo.png" alt="따릉이 로고" class="brand-logo-img" onerror="this.style.display='none';">
          </a>
          <div class="brand-subtext d-none d-sm-block d-lg-none d-xl-block">따릉이<br><span class="brand-district">실시간 현황</span></div>
          <nav class="sh-nav ms-4 d-none d-lg-flex" aria-label="일반 회원 메뉴">
            <a href="user-dashboard.html" class="nav-menu-item ${activeTab === 'dashboard' || activeTab === 'home' ? 'active' : ''}"><i class="bi bi-geo-alt"></i> 대여소 지도</a>
            <a href="user-rental.html" class="nav-menu-item ${activeTab === 'rental' || activeTab === 'history' ? 'active' : ''}"><i class="bi bi-clock-history"></i> 대여 · 반납 이력</a>
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
              <div class="header-profile-name">${user.name}<span class="name-suffix">님</span></div>
            </div>
            <div class="sh-dropdown sh-user-menu" id="sh-user-menu" style="right: 0 !important; left: auto !important;">
              <div class="sh-menu-head"><div class="profile-menu-head-row"><span class="name">${user.name}<span class="name-suffix">님</span></span><span class="header-profile-role">${roleName}</span></div></div>
              ${profileMenuHtml('settings.html')}
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
                <div class="header-profile-name" style="font-size: 1.15rem;">${user.name}<span class="name-suffix">님</span></div>
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
              <a href="user-dashboard.html" class="mobile-nav-item ${activeTab === 'dashboard' || activeTab === 'home' ? 'active' : ''}"><i class="bi bi-house fs-5"></i> 홈</a>
              <a href="user-rental.html" class="mobile-nav-item ${activeTab === 'rental' || activeTab === 'history' ? 'active' : ''}"><i class="bi bi-clock-history fs-5"></i> 대여 · 반납</a>
            </nav>
            <div class="mobile-menu-divider"></div>
            <nav class="mobile-nav">${mobileProfileMenuHtml('settings.html')}</nav>
            <div class="mobile-menu-foot-links">
              <button type="button" class="sh-footer-link-btn" data-sh-footer-topic="support">고객센터</button><span class="dot-sep">·</span><button type="button" class="sh-footer-link-btn" data-sh-footer-topic="suggest">정류소 제안</button><span class="dot-sep">·</span><button type="button" class="sh-footer-link-btn" data-sh-footer-topic="privacy">개인정보처리방침</button>
            </div>
          </div>
        </div>
      </div>
    `;
    root.outerHTML = html;
    buildNotifications(user);
    ensureFooterInfoModal();
  }


  // 📱 4. 모바일 하단 팝업 (고객센터, 제안 등)

  var FOOTER_TOPICS = {
    support: { title: '고객센터', body: '<p>따릉이 이용 중 불편사항이나 문의사항은 아래로 연락해 주세요.</p><p class="fw-bold mb-0">1599-0120 (평일 09:00~18:00)</p>' },
    suggest: { title: '정류소 제안', body: '<p>새로운 대여소 설치가 필요한 위치가 있다면 알려주세요.</p><p class="text-muted mb-0">추천 위치와 사유를 홈페이지(bikeseoul.com) 제안 게시판에 남겨주시면 검토 후 반영됩니다.</p>' },
    privacy: { title: '개인정보처리방침', body: '<p>따릉이는 회원 가입 시 수집한 개인정보를 서비스 제공 목적으로만 이용하며, 관련 법령에 따라 안전하게 관리합니다.</p><p class="text-muted mb-0">자세한 내용은 홈페이지의 개인정보처리방침 전문을 참고해 주세요.</p>' }
  };

  function ensureFooterInfoModal() {
    if (document.getElementById('shInfoModal')) return;

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="sh-info-modal-backdrop" id="shInfoBackdrop"></div>' +
      '<div class="sh-info-modal" id="shInfoModal" role="dialog" aria-hidden="true">' +
        '<div class="sh-info-modal-header">' +
          '<span class="sh-info-modal-title" id="shInfoTitle">안내</span>' +
          '<button class="sh-info-modal-close" id="shInfoCloseBtn" type="button" aria-label="닫기">✕</button>' +
        '</div>' +
        '<div class="sh-info-modal-body" id="shInfoBody"></div>' +
      '</div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

    function closeInfo(e) {
      if (e) e.stopPropagation();
      document.getElementById('shInfoBackdrop').classList.remove('show');
      document.getElementById('shInfoModal').classList.remove('show');
    }
    document.getElementById('shInfoCloseBtn').addEventListener('click', closeInfo);
    document.getElementById('shInfoBackdrop').addEventListener('click', closeInfo);

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sh-footer-topic]');
      if (!btn) return;
      var topic = FOOTER_TOPICS[btn.getAttribute('data-sh-footer-topic')];
      if (!topic) return;
      e.stopImmediatePropagation();
      document.getElementById('shInfoTitle').textContent = topic.title;
      document.getElementById('shInfoBody').innerHTML = topic.body;
      document.getElementById('shInfoBackdrop').classList.add('show');
      document.getElementById('shInfoModal').classList.add('show');
    });
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


  // 🔔 5. 알림(Notification) 생성 및 처리 로직

  // [1] 관리자(Admin)용 알림: 재고 위험 대여소 + 지시서 미배정 고장 신고
  async function buildAdminNotifications() {
    const alerts = [];

    const stations = await api.get('/station/stations?stock_level=' + encodeURIComponent('고갈,과포화'));
    stations.forEach(st => {
      if (st.stock_level === '고갈') {
        alerts.push({
          urgent: true,
          html: `<div class="sh-notif-item urgent-notif"><div class="title fw-bold d-flex align-items-start"><span class="badge rounded-pill me-2 mt-1 px-2 py-1" style="color: #ef4545; background-color: #fef2f2;">고갈</span><span class="text-break" style="line-height: 1.4;">${st.name} 긴급 보충 요망</span></div></div>`
        });
      } else {
        alerts.push({
          urgent: false,
          html: `<div class="sh-notif-item"><div class="title fw-bold d-flex align-items-start"><span class="badge rounded-pill me-2 mt-1 px-2 py-1" style="color: #1f2937; background-color: #eef0f2;">과포화</span><span class="text-break" style="line-height: 1.4;">${st.name} 수거 요망</span></div></div>`
        });
      }
    });

    // dispatch_status가 없는 신고 = 아직 지시서로 연결 안 된 고장 신고 (routers/admin.py list_reports 참고)
    const reports = await api.get('/admin/reports');
    reports.filter(r => !r.dispatch_status).forEach(r => {
      alerts.push({
        urgent: false,
        html: `<div class="sh-notif-item"><div class="title fw-bold d-flex align-items-start"><span class="badge rounded-pill bg-warning-subtle text-warning-emphasis me-2 mt-1 px-2 py-1">고장</span><span class="text-break" style="line-height: 1.4;">${escapeHtml(r.station_name || '알 수 없는 대여소')} (${escapeHtml(r.issue)})</span></div></div>`
      });
    });

    return alerts;
  }

  // [2] 기사(Driver)용 알림: 아직 완료되지 않은 내 지시서
  async function buildDriverNotifications() {
    const orders = await api.get('/driver/orders?status=' + encodeURIComponent('대기,진행중'));
    // "긴급" 여부는 관리자가 지시서 작성 시 켠 긴급 토글(is_emergency)만을 기준으로 한다
    // (driver-dashboard.js와 동일한 기준; 대기 상태 자체는 긴급 여부와 무관하다).
    // 고장 자전거 수거 지시서(order_type === '고장수거')는 긴급 토글과 무관하게 "고장 수거"로 표시한다
    // (driver-dashboard.js의 긴급/고장 수거/일반 3분류와 동일하게 맞춤).
    return orders.map(o => {
      const isUrgent = !!o.is_emergency;
      const isBrokenPickup = o.order_type === '고장수거';
      const badge = isUrgent
        ? '<span class="badge rounded-pill bg-danger me-2 mt-1 px-2 py-1">긴급</span>'
        : isBrokenPickup
        ? '<span class="badge rounded-pill bg-warning-subtle text-warning-emphasis me-2 mt-1 px-2 py-1">고장 수거</span>'
        : '<span class="badge rounded-pill bg-success me-2 mt-1 px-2 py-1">일반</span>';
      return {
        urgent: isUrgent,
        html: `<div class="sh-notif-item ${isUrgent ? 'urgent-notif' : ''}"><div class="title fw-bold d-flex align-items-start">${badge}<span class="text-break" style="line-height: 1.4;">${o.to_station_name || ''}으로 이동</span></div></div>`
      };
    });
  }

  // [3] 일반 이용자(User)용 알림: 최근 반납 완료 내역 (오래된 이력까지 계속 쌓이지 않게 최근 5건만)
  async function buildUserNotifications() {
    const rentals = await api.get('/station/rentals/me');
    const completed = rentals.filter(r => r.status === '완료').slice(0, 5);

    if (completed.length === 0) {
      return [{
        urgent: false,
        html: `<div class="sh-notif-item">
                 <div class="title">
                   <div style="font-size: 0.8rem; margin-bottom: 4px;">
                     <span class="text-primary fw-bold">안내</span>
                   </div>
                   <div class="fw-bold" style="font-size: 0.95rem; color: #222;">
                     환영합니다! 따릉이와 함께 상쾌한 하루를 시작해 보세요.
                   </div>
                 </div>
               </div>`
      }];
    }

    return completed.map(r => {
      const returnDate = new Date(r.return_time);
      const month = returnDate.getMonth() + 1;
      const date = returnDate.getDate();
      const rawHour = returnDate.getHours();
      const ampm = rawHour < 12 ? '오전' : '오후';
      const hour = rawHour % 12 || 12;

      return {
        urgent: false,
        html: `<div class="sh-notif-item">
                 <div class="title">
                   <div style="font-size: 0.8rem; margin-bottom: 4px;">
                     <span class="text-success fw-bold">반납 완료</span>
                     <span class="text-secondary">(${month}.${date} | ${ampm} ${hour}시)</span>
                   </div>
                   <div class="fw-bold" style="font-size: 0.95rem; color: #222;">
                     총 ${r.distance_km}km 주행 완료
                   </div>
                 </div>
               </div>`
      };
    });
  }

  async function buildNotifications(user) {
    const listEl = document.getElementById('notif-list');
    const countEl = document.getElementById('notif-count');
    const dotEl = document.getElementById('notif-dot');
    if (!listEl || !countEl) return;

    let alerts = [];
    try {
      if (user.role === 'admin') alerts = await buildAdminNotifications();
      else if (user.role === 'driver') alerts = await buildDriverNotifications();
      else if (user.role === 'user') alerts = await buildUserNotifications();
    } catch (e) {
      // 알림은 헤더 부가 기능이라 조회 실패해도 페이지 사용 자체를 막지 않는다
      alerts = [];
    }

    alerts.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
    const notifHTML = alerts.map(a => a.html).join('');
    const count = alerts.length;

    // 세션 스토리지를 확인하여 사용자가 알림을 확인했는지 여부(빨간 점 표시) 결정
    const notifRead = sessionStorage.getItem('notifRead') === '1';

    if (count > 0) {
      countEl.textContent = `알림 ${count}건`;
      listEl.innerHTML = notifHTML;
      if (dotEl) dotEl.style.display = notifRead ? 'none' : 'block';
    } else {
      countEl.textContent = `알림 0건`;
      listEl.innerHTML = '<div class="sh-notif-item"><div class="title" style="color:#888;">새로운 알림이 없습니다.</div></div>';
      if (dotEl) dotEl.style.display = 'none';
    }
  }


  // 🖱️ 6. 상단 메뉴 드롭다운 상호작용

  function setupDropdowns() {
    const notifBtn = document.getElementById('sh-notif-btn'); const notifMenu = document.getElementById('sh-notif-menu');
    const userBtn = document.getElementById('sh-user-btn'); const userMenu = document.getElementById('sh-user-menu');
    const weatherBtn = document.getElementById('weatherToggleBtn'); const weatherPopup = document.getElementById('weatherPopup');
    const notifDot = document.getElementById('notif-dot');

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

    if (notifBtn && notifMenu) notifBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleMenu(notifMenu);
      sessionStorage.setItem('notifRead', '1');
      if (notifDot) notifDot.style.display = 'none';
    });

    if (userBtn && userMenu) userBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(userMenu); });
    if (weatherBtn && weatherPopup) weatherBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(weatherPopup); });

    document.addEventListener('click', closeAll);
  }

})();