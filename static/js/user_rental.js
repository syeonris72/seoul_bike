// user_rental.js

(function () {
  var raw = localStorage.getItem('loggedInUser');
  var currentUser = raw ? JSON.parse(raw) : null;

  if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'index.html';
      return;
  }

  if (typeof DB === 'undefined' || !DB.rental) {
      console.error("DB가 로드되지 않았습니다. mock_data.js 포함 여부를 확인하세요.");
      return;
  }

  var myRentals = DB.rental.filter(function(r) { return r.user_id === currentUser.id; });

  // 연-월(YYYY-M) 단위로 데이터 및 요약 구성
  var rentalData = {};
  var summaryRaw = {};

  function ensureBucket(key) {
    if (!rentalData[key]) rentalData[key] = [];
    if (!summaryRaw[key]) summaryRaw[key] = { count: 0, time: 0, dist: 0, carbon: 0 };
  }

  myRentals.forEach(function(r) {
      var dateObj = new Date(r.rent_time);
      var year = dateObj.getFullYear();
      var month = dateObj.getMonth() + 1;
      var key = year + '-' + month;
      ensureBucket(key);

      var startSt = DB.station.find(function(s) { return s.id === r.rent_station_id; });
      var endSt = DB.station.find(function(s) { return s.id === r.return_station_id; }) || { name: '이용 중' };

      var displayDuration = r.duration_min !== null ? r.duration_min + "분" : "이용 중";
      var displayDist = r.distance_km !== null ? r.distance_km + "km" : "이용 중";

      rentalData[key].push({
          date: r.rent_time.replace('T', ' '),
          fee: "기본요금",
          start: startSt ? startSt.name : '알 수 없음',
          end: endSt.name,
          duration: displayDuration,
          dist: displayDist
      });

      summaryRaw[key].count += 1;
      summaryRaw[key].time += r.duration_min || 0;
      summaryRaw[key].dist += r.distance_km || 0;
      summaryRaw[key].carbon += r.carbon_reduction || 0;
  });

  // 오늘(2026-07-23) 기준 현재 연-월은 데이터가 없어도 항상 선택 가능하도록 보장
  var todayYear = 2026, todayMonth = 7;
  ensureBucket(todayYear + '-' + todayMonth);

  var historyListEl = document.getElementById("historyList");
  var monthButtons = document.querySelectorAll(".month-tabs button");
  var yearSelect = document.getElementById('yearSelect');
  var monthSelect = document.getElementById('monthSelect');

  function formatSummary(key) {
    var s = summaryRaw[key] || { count: 0, time: 0, dist: 0, carbon: 0 };
    return {
      count: s.count + "회",
      time: s.time + "분",
      dist: s.dist.toFixed(1) + "km",
      carbon: s.carbon.toFixed(1) + "kg"
    };
  }

  function render(year, month) {
    var key = year + '-' + month;
    var items = rentalData[key] || [];
    var summary = formatSummary(key);

    document.getElementById("summaryCount").textContent = summary.count;
    document.getElementById("summaryTime").textContent = summary.time;
    document.getElementById("summaryDist").textContent = summary.dist;
    document.getElementById("summaryCarbon").textContent = summary.carbon;

    if (items.length === 0) {
      historyListEl.innerHTML = '<div class="empty">해당 월의 대여 내역이 없어요.</div>';
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
    }).join("");

    historyListEl.innerHTML = html;
  }

  // 모바일 월 탭 (당해 연도 기준)
  monthButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      monthButtons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var month = parseInt(btn.getAttribute("data-month"), 10);
      render(todayYear, month);
      if (yearSelect && monthSelect) { yearSelect.value = todayYear; monthSelect.value = month; }
    });
  });

  // 데스크탑 연도/월 선택
  if (yearSelect && monthSelect) {
    var years = Object.keys(rentalData).map(function (k) { return parseInt(k.split('-')[0], 10); });
    years = Array.from(new Set(years)).sort(function (a, b) { return b - a; });

    years.forEach(function (y) {
      var opt = document.createElement('option');
      opt.value = y; opt.textContent = y + '년';
      yearSelect.appendChild(opt);
    });

    for (var m = 1; m <= 12; m++) {
      var mOpt = document.createElement('option');
      mOpt.value = m; mOpt.textContent = m + '월';
      monthSelect.appendChild(mOpt);
    }

    yearSelect.value = todayYear;
    monthSelect.value = todayMonth;

    function onYearMonthChange() {
      var year = parseInt(yearSelect.value, 10);
      var month = parseInt(monthSelect.value, 10);
      render(year, month);
      monthButtons.forEach(function (b) { b.classList.toggle('active', year === todayYear && parseInt(b.getAttribute('data-month'), 10) === month); });
    }
    yearSelect.addEventListener('change', onYearMonthChange);
    monthSelect.addEventListener('change', onYearMonthChange);
  }

  // 초기 렌더링 (오늘 기준 연-월)
  render(todayYear, todayMonth);
})();
