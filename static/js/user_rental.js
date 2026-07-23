// user_rental.js

(function () {
  var raw = localStorage.getItem('loggedInUser');
  var currentUser = raw ? JSON.parse(raw) : null;

  if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'index.html';
      return;
  }

  // DB가 로드되지 않았을 경우를 대비한 안전 장치
  if (typeof DB === 'undefined' || !DB.rental) {
      console.error("DB가 로드되지 않았습니다. mock_data.js 포함 여부를 확인하세요.");
      return;
  }

  // 로그인한 유저의 대여기록만 가져오기
  var myRentals = DB.rental.filter(function(r) { return r.user_id === currentUser.id; });

  var rentalData = { "7": [], "6": [], "5": [] };
  var summaryData = {
      "7": { count: 0, time: 0, dist: 0, carbon: 0 },
      "6": { count: 0, time: 0, dist: 0, carbon: 0 },
      "5": { count: 0, time: 0, dist: 0, carbon: 0 }
  };

  // DB 데이터를 월별로 분류하여 rentalData와 summaryData 구성
  myRentals.forEach(function(r) {
      var dateObj = new Date(r.rent_time);
      var m = (dateObj.getMonth() + 1).toString();

      if (!rentalData[m]) rentalData[m] = [];
      if (!summaryData[m]) summaryData[m] = { count: 0, time: 0, dist: 0, carbon: 0 };

      var startSt = DB.station.find(function(s) { return s.id === r.rent_station_id; });
      var endSt = DB.station.find(function(s) { return s.id === r.return_station_id; }) || { name: '이용 중' };

      // 대여 중이라 값이 null일 경우를 대비한 예외 처리
      var displayDuration = r.duration_min !== null ? r.duration_min + "분" : "이용 중";
      var displayDist = r.distance_km !== null ? r.distance_km + "km" : "이용 중";

      rentalData[m].push({
          date: r.rent_time.replace('T', ' '),
          fee: "기본요금",
          start: startSt ? startSt.name : '알 수 없음',
          end: endSt.name,
          duration: displayDuration,
          dist: displayDist
      });

      summaryData[m].count += 1;
      summaryData[m].time += r.duration_min || 0;
      summaryData[m].dist += r.distance_km || 0;
      summaryData[m].carbon += r.carbon_reduction || 0;
  });

  // 요약 데이터 텍스트 포맷팅
  for (var key in summaryData) {
      summaryData[key].count = summaryData[key].count + "회";
      summaryData[key].time = summaryData[key].time + "분";
      summaryData[key].dist = summaryData[key].dist.toFixed(1) + "km";
      summaryData[key].carbon = summaryData[key].carbon.toFixed(1) + "kg";
  }

  var historyListEl = document.getElementById("historyList");
  var monthButtons = document.querySelectorAll(".month-tabs button");

  function render(month) {
    var items = rentalData[month] || [];
    var summary = summaryData[month] || { count: "0회", time: "0분", dist: "0.0km", carbon: "0.0kg" };

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

  monthButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      monthButtons.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      var month = btn.getAttribute("data-month");
      render(month);
    });
  });

  // 초기 렌더링 (7월)
  render("7");
})();