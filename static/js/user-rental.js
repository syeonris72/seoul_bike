// user-rental.js
// "대여 · 반납" 페이지 전용 스크립트.
// 1) 공통 헤더 렌더링, 2) 대여 내역 데이터 가공 및 연도/월 필터링 렌더링을 담당한다.

// 0. 로그인 확인 — 비로그인 상태면 헤더/본문 없이 안내 메시지만 표시한다.
var rentalGuardRaw = localStorage.getItem('currentUser');
var rentalGuardUser = rentalGuardRaw ? JSON.parse(rentalGuardRaw) : null;

if (!rentalGuardUser || rentalGuardUser.role !== 'user' || !localStorage.getItem('accessToken')) {
  document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
} else {

// 1. 공통 헤더 렌더링
//    header.js가 먼저 로드되어 있어야 하며(renderHeader 함수 제공)
window.onload = function () {
  var fallbackUser = { role: 'user', name: '홍길동', id: 1 };
  var headerUser = rentalGuardUser.role === 'user' ? rentalGuardUser : fallbackUser;
  if (typeof renderHeader === 'function') {
    renderHeader('rental', headerUser);
  }
};

// 2. 대여 · 반납 내역
(async function () {

  var currentUser = rentalGuardUser;

  var myRentals;
  try {
    myRentals = await api.get('/station/rentals/me');
  } catch (e) {
    myRentals = [];
  }

  // ----- 2-2. 연-월(YYYY-M) 단위로 원본 데이터 가공 -----
  // rentalData: { "YYYY-M": [화면에 표시할 내역 객체, ...] }
  // summaryRaw: { "YYYY-M": { count, time, dist, carbon } } - 연-월별 합계
  var rentalData = {};
  var summaryRaw = {};

  // 해당 연-월 버킷이 없으면 빈 상태로 미리 만들어 둔다.
  function ensureBucket(key) {
    if (!rentalData[key]) rentalData[key] = [];
    if (!summaryRaw[key]) summaryRaw[key] = { count: 0, time: 0, dist: 0, carbon: 0 };
  }

  myRentals.forEach(function (r) {
    var dateObj = new Date(r.rent_time);
    var year = dateObj.getFullYear();
    var month = dateObj.getMonth() + 1;
    var key = year + '-' + month;
    ensureBucket(key);

    // 반납 전(대여 중)인 건은 duration/distance가 null로 내려온다.
    // distance_km은 5.0처럼 정수형 값도 오므로 toFixed(1)로 소수 자릿수를 항상 맞춘다(요약 카드와 표기 통일).
    var displayDuration = r.duration_min !== null ? r.duration_min + '분' : '이용 중';
    var displayDist = r.distance_km !== null ? r.distance_km.toFixed(1) + 'km' : '이용 중';

    rentalData[key].push({
      date: r.rent_time.replace('T', ' '),
      fee: '기본요금',
      start: r.rent_station_name || '알 수 없음',
      end: r.return_station_name || '이용 중',
      duration: displayDuration,
      dist: displayDist
    });

    summaryRaw[key].count += 1;
    summaryRaw[key].time += r.duration_min || 0;
    summaryRaw[key].dist += r.distance_km || 0;
    summaryRaw[key].carbon += r.carbon_reduction || 0;
  });

  // 오늘 기준 현재 연-월은 대여 내역이 없어도 항상 선택 가능하도록 보장
  var now = new Date();
  ensureBucket(now.getFullYear() + '-' + (now.getMonth() + 1));

  // ----- 2-3. DOM 요소 참조 -----
  var historyListEl = document.getElementById('historyList');
  var yearList = document.getElementById('yearList');
  var monthList = document.getElementById('monthList');
  var yearSelectedLabel = document.getElementById('yearSelectedLabel');
  var monthSelectedLabel = document.getElementById('monthSelectedLabel');
  var monthDropdownBtn = document.getElementById('monthDropdownBtn');

  // 현재 선택된 연/월. 각각 숫자(특정 연/월) 또는 문자열 'all'(전체)을 가진다.
  // 기본값은 'all' + 'all' → 페이지 진입 시 전체 누적 내역을 보여준다.
  var selectedYear = 'all';
  var selectedMonth = 'all';

  // ----- 2-4. 요약/목록 렌더링 헬퍼 -----

  // 합계 객체(count/time/dist/carbon)를 화면 표시용 문자열로 변환
  function formatSummary(s) {
    return {
      count: s.count + '회',
      time: s.time + '분',
      dist: s.dist.toFixed(1) + 'km',
      carbon: s.carbon.toFixed(1) + 'kg'
    };
  }

  function renderSummary(summary) {
    document.getElementById('summaryCount').textContent = summary.count;
    document.getElementById('summaryTime').textContent = summary.time;
    document.getElementById('summaryDist').textContent = summary.dist;
    document.getElementById('summaryCarbon').textContent = summary.carbon;
  }

  // 내역 카드 목록을 그린다. items가 비어 있으면 emptyMessage를 보여준다.
  function renderList(items, emptyMessage) {
    if (items.length === 0) {
      historyListEl.innerHTML = '<div class="empty">' + (emptyMessage || '해당 대여 내역이 없어요.') + '</div>';
      return;
    }

    var html = items.map(function (item) {
      return (
        '<div class="history-row">' +
          '<div class="date-row">' +
            '<span class="date">' + item.date + '</span>' +
            '<span class="fee">' + item.fee + '</span>' +
          '</div>' +
          '<div class="route">' +
            '<div class="stop">' +
              '<div class="label">대여</div>' +
              '<div class="name">' + item.start + '</div>' +
            '</div>' +
            '<span class="arrow">→</span>' +
            '<div class="stop">' +
              '<div class="label">반납</div>' +
              '<div class="name">' + item.end + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="meta">' +
            '<span>이용시간 <b>' + item.duration + '</b></span>' +
            '<span>이용거리 <b>' + item.dist + '</b></span>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    historyListEl.innerHTML = html;
  }

  // 최신순 정렬 (날짜 문자열이 "YYYY-MM-DD HH:MM:SS" 형태라 문자열 비교로 충분)
  function sortByDateDesc(items) {
    return items.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  // ----- 2-5. 연도/월 선택 상태에 대응하는 3가지 렌더 모드 -----

  // 특정 연-월 하나만 보여준다.
  function render(year, month) {
    var key = year + '-' + month;
    renderSummary(formatSummary(summaryRaw[key] || { count: 0, time: 0, dist: 0, carbon: 0 }));
    renderList(sortByDateDesc(rentalData[key] || []), '해당 월의 대여 내역이 없어요.');
  }

  // 특정 연도의 모든 월을 합산해서 보여준다.
  function renderYearHistory(year) {
    var items = [];
    var total = { count: 0, time: 0, dist: 0, carbon: 0 };

    Object.keys(rentalData).forEach(function (key) {
      if (parseKey(key).year !== year) return;
      items = items.concat(rentalData[key]);
      var s = summaryRaw[key];
      total.count += s.count;
      total.time += s.time;
      total.dist += s.dist;
      total.carbon += s.carbon;
    });

    renderSummary(formatSummary(total));
    renderList(sortByDateDesc(items), '해당 연도의 대여 내역이 없어요.');
  }

  // 연-월 구분 없이 전체 내역을 합산해서 보여준다.
  function renderAllHistory() {
    var items = [];
    var total = { count: 0, time: 0, dist: 0, carbon: 0 };

    Object.keys(rentalData).forEach(function (key) {
      items = items.concat(rentalData[key]);
      var s = summaryRaw[key];
      total.count += s.count;
      total.time += s.time;
      total.dist += s.dist;
      total.carbon += s.carbon;
    });

    renderSummary(formatSummary(total));
    renderList(sortByDateDesc(items), '대여 내역이 없어요.');
  }

  // "YYYY-M" 형태의 키를 { year, month } 숫자 쌍으로 분리
  function parseKey(key) {
    var parts = key.split('-');
    return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
  }

  // 내역이 존재하는 연-월 키 목록(최신순), 그리고 여기서 파생된 연도 목록(최신순)
  var sortedKeys = Object.keys(rentalData).sort(function (a, b) {
    var pa = parseKey(a);
    var pb = parseKey(b);
    return (pb.year - pa.year) || (pb.month - pa.month);
  });
  var years = Array.from(new Set(sortedKeys.map(function (k) { return parseKey(k).year; })))
    .sort(function (a, b) { return b - a; });

  // ----- 2-6. 선택 상태 → 화면 반영 -----

  // selectedYear/selectedMonth 값을 기준으로 요약 카드, 내역 목록, 드롭다운 라벨/체크
  // 표시를 한 번에 갱신한다. 연도/월 선택이 바뀔 때마다 이 함수 하나만 호출하면 된다.
  function applySelection() {
    if (selectedYear === 'all') {
      renderAllHistory();
    } else if (selectedMonth === 'all') {
      renderYearHistory(selectedYear);
    } else {
      render(selectedYear, selectedMonth);
    }

    // 드롭다운 버튼 라벨 갱신
    if (yearSelectedLabel) yearSelectedLabel.textContent = selectedYear === 'all' ? '전체' : selectedYear + '년';
    if (monthSelectedLabel) monthSelectedLabel.textContent = selectedMonth === 'all' ? '전체' : selectedMonth + '월';

    // 드롭다운 목록에서 현재 선택 항목 하이라이트
    if (yearList) {
      yearList.querySelectorAll('.dropdown-item').forEach(function (item) {
        item.classList.toggle('selected-item', item.getAttribute('data-year') === String(selectedYear));
      });
    }
    if (monthList) {
      monthList.querySelectorAll('.dropdown-item').forEach(function (item) {
        item.classList.toggle('selected-item', item.getAttribute('data-month') === String(selectedMonth));
      });
    }

    // 연도가 '전체'일 때는 월 필터가 의미가 없으므로 월 드롭다운을 비활성화한다.
    // 네이티브 disabled 속성을 사용해 마우스뿐 아니라 키보드로도 열 수 없게 막는다.
    if (monthDropdownBtn) monthDropdownBtn.disabled = (selectedYear === 'all');
  }

  // 연도 선택 시: 해당 연도의 전체 월을 우선 보여주고(월='전체'), 화면을 갱신한다.
  function selectYear(year) {
    selectedYear = year;
    selectedMonth = 'all';
    applySelection();
  }

  // 월 선택 시: 연도가 아직 '전체'라면 월만 단독으로 고를 수 없으므로 무시한다.
  function selectMonth(month) {
    if (selectedYear === 'all') return;
    selectedMonth = month;
    applySelection();
  }

  // ----- 2-7. 연도/월 드롭다운 항목 구성 및 이벤트 바인딩 -----
  // 모바일/데스크탑 공통 UI이며, 각 목록 맨 위에 "전체" 항목을 둔다.
  if (yearList && monthList) {
    // 연도 목록: 전체 + 실제 내역이 있는 연도들(최신순)
    var allYearLi = document.createElement('li');
    allYearLi.innerHTML = '<a class="dropdown-item" href="#" data-year="all">전체</a>';
    yearList.appendChild(allYearLi);

    years.forEach(function (y) {
      var li = document.createElement('li');
      li.innerHTML = '<a class="dropdown-item" href="#" data-year="' + y + '">' + y + '년</a>';
      yearList.appendChild(li);
    });

    // 월 목록: 전체 + 1~12월 고정
    var allMonthLi = document.createElement('li');
    allMonthLi.innerHTML = '<a class="dropdown-item" href="#" data-month="all">전체</a>';
    monthList.appendChild(allMonthLi);

    for (var m = 1; m <= 12; m++) {
      var monthLi = document.createElement('li');
      monthLi.innerHTML = '<a class="dropdown-item" href="#" data-month="' + m + '">' + m + '월</a>';
      monthList.appendChild(monthLi);
    }

    // 이벤트 위임: 목록 전체에 리스너 하나만 걸고 클릭된 항목을 찾는다.
    yearList.addEventListener('click', function (e) {
      var item = e.target.closest('.dropdown-item');
      if (!item) return;
      e.preventDefault();
      var val = item.getAttribute('data-year');
      selectYear(val === 'all' ? 'all' : parseInt(val, 10));
    });

    monthList.addEventListener('click', function (e) {
      var item = e.target.closest('.dropdown-item');
      if (!item) return;
      e.preventDefault();
      var val = item.getAttribute('data-month');
      selectMonth(val === 'all' ? 'all' : parseInt(val, 10));
    });
  }

  // ----- 2-8. 초기 렌더링 -----
  // 기본 선택 상태(전체/전체)로 첫 화면을 그린다.
  applySelection();
})();

}
