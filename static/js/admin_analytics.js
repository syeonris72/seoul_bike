// admin_analytics.js

var ROLE_LABEL = { seoul_admin: '중앙 본부 관리자' };

// 로그인 사용자 정보 가져오기 (대시보드와 동일한 세션 연동)
function getCurrentUser() {
    var raw = localStorage.getItem('loggedInUser'); // 통합 세션 키
    if (raw) {
        try { return JSON.parse(raw); } catch (e) { }
    }
    return { id: 501, role: 'seoul_admin', name: '김관제', district_id: null };
}

function fmtNum(n) { return Number(n).toLocaleString('ko-KR'); }
function getDistrict(id) { return DB.district.find(function (d) { return d.id === id; }); }
function getStation(id) { return DB.station.find(function (s) { return s.id === id; }); }

function isCrossDistrict(order) {
    var from = getStation(order.from_station_id), to = getStation(order.to_station_id);
    return !!(from && to && from.district_id !== to.district_id);
}

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

function getScopedStations() {
    return DB.station;
}

// 상단 통계 카드 (금일 총 대여량 / 긴급 출동 요망 / 과포화 수거 요망)
function renderStatCards() {
    document.getElementById('statTodayRentals').textContent = fmtNum(DB.todayRentals.seoul);

    var urgentCount = DB.dispatch_order.filter(function (o) {
        return o.status !== '완료' && isCrossDistrict(o);
    }).length;
    document.getElementById('statUrgentCount').textContent = urgentCount;

    var fullCount = getScopedStations().filter(function (s) { return classifyStation(s).level === 'full'; }).length;
    document.getElementById('statFullCount').textContent = fullCount;
}

// 만성 불균형 대여소 (현재 고갈/과포화 상태 대여소 목록)
function renderChronicList() {
    var container = document.getElementById('chronicList');
    container.innerHTML = '';

    var problemStations = getScopedStations()
        .map(function (s) { return { station: s, info: classifyStation(s) }; })
        .filter(function (row) { return row.info.level === 'danger' || row.info.level === 'full'; })
        .sort(function (a, b) {
            var priority = { danger: 0, full: 1 };
            return priority[a.info.level] - priority[b.info.level] || a.info.percent - b.info.percent;
        })
        .slice(0, 8);

    if (problemStations.length === 0) {
        container.innerHTML = '<p class="text-muted small mb-0">현재 고갈/과포화 상태인 대여소가 없습니다.</p>';
        return;
    }

    problemStations.forEach(function (row, idx) {
        var st = row.station, info = row.info;
        var district = getDistrict(st.district_id);
        var isDanger = info.level === 'danger';
        var statLabel = isDanger ? '고갈 심각' : '과포화';
        var statClass = isDanger ? 'stat-danger' : 'stat-warning';
        var recommendText = isDanger
            ? '거치대 재배치 요청 권장'
            : '거치대 ' + Math.max(2, Math.ceil((info.total - st.capacity) / 5) * 2) + '개 증설 권장';

        var div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML =
            '<div class="item-number">' + (idx + 1) + '</div>' +
            '<div class="flex-grow-1">' +
                '<div class="item-name">' + st.name + '</div>' +
                '<div class="item-district">' + (district ? district.name : '') + ' · ' + st.neighborhood_name + '</div>' +
            '</div>' +
            '<div class="item-stats d-none d-sm-flex">' +
                '<div class="' + statClass + '">' + info.total + '/' + st.capacity + '대 <span class="stat-sub">' + statLabel + ' (' + info.percent + '%)</span></div>' +
            '</div>' +
            '<div><button class="btn-recommend">' + recommendText + '</button></div>';
        container.appendChild(div);
    });
}

function renderPageSubtitle() {
    document.getElementById('pageSubtitleDistrict').textContent = '서울시 전체 운영 현황 분석';
    document.title = '데이터 분석 - 따릉이 관제 (서울시 전체)';
}

document.addEventListener('DOMContentLoaded', function () {
    var user = getCurrentUser();

    // 1. 공통 헤더 렌더링 호출 (관리자 - 데이터 분석 탭 활성화)
    if (window.renderHeader) {
        window.renderHeader('analytics', user);
    }

    if (window.DB) {
        renderPageSubtitle();
        renderStatCards();
        renderChronicList();
    }
});

// 탭 전환 함수
function switchTab(tabName) {
    const btnStatus = document.getElementById('tabBtnStatus');
    const btnWeather = document.getElementById('tabBtnWeather');
    const sectionStatus = document.getElementById('sectionStatus');
    const sectionWeather = document.getElementById('sectionWeather');

    if (tabName === 'status') {
        btnStatus.classList.add('active-tab');
        btnWeather.classList.remove('active-tab');
        sectionStatus.style.display = 'block';
        sectionWeather.style.display = 'none';
    } else if (tabName === 'weather') {
        btnWeather.classList.add('active-tab');
        btnStatus.classList.remove('active-tab');
        sectionStatus.style.display = 'none';
        sectionWeather.style.display = 'block';
    }
}
