// driver_profile.js

document.addEventListener('DOMContentLoaded', function () {
  var raw = localStorage.getItem('loggedInUser');
  var sessionUser = raw ? JSON.parse(raw) : null;

  if (!sessionUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'index.html';
      return;
  }

  // DB.account에서 현재 기사 상세 정보 완벽하게 조회
  var accountInfo = (typeof DB !== 'undefined' && DB.account) ? DB.account.find(function(acc) {
    return acc.id === sessionUser.id;
  }) : sessionUser;

  if (!accountInfo) accountInfo = sessionUser;

  // 로컬 스토리지에 업데이트된 개인정보가 있다면 덮어쓰기
  accountInfo.name = sessionUser.name || accountInfo.name;
  accountInfo.phone = sessionUser.phone || accountInfo.phone || '등록된 번호 없음';
  accountInfo.email = sessionUser.email || accountInfo.email || '등록된 이메일 없음';

  var districtName = accountInfo.district_name || '소속 없음';
  if (accountInfo.district_id && typeof DB !== 'undefined' && DB.district) {
    var dist = DB.district.find(function(d) { return d.id === accountInfo.district_id; });
    if (dist) districtName = dist.name;
  }

  // 공통 헤더 렌더링 호출
  if (window.renderHeader) {
    window.renderHeader('tasks', {
      role: 'driver',
      name: accountInfo.name,
      district_name: districtName
    });
  }

  // 화면 데이터 바인딩
  var drvId = accountInfo.login_id || '정보 없음';
  var userName = accountInfo.name || '알수없음';

  document.getElementById('profileAvatarInitial').textContent = userName.charAt(0);
  document.getElementById('profileNameDisplay').textContent = userName;
  document.getElementById('profileIdDisplay').textContent = drvId;

  document.getElementById('infoName').textContent = userName;
  document.getElementById('infoPhone').textContent = accountInfo.phone;
  document.getElementById('infoEmail').textContent = accountInfo.email;
  document.getElementById('infoEmpId').textContent = drvId;
  document.getElementById('infoDistrict').textContent = districtName;

  var joined = accountInfo.created_at ? accountInfo.created_at.split('T')[0] : '기록 없음';
  document.getElementById('infoJoinedDate').textContent = joined;

  var activityDistrictEl = document.getElementById('activityDistrict');
  if (activityDistrictEl) activityDistrictEl.textContent = districtName;

  // DB 연동하여 작업 현황 통계 동적 계산
  if (typeof DB !== 'undefined' && DB.dispatch_order) {
      var myOrders = DB.dispatch_order.filter(function(o) { return o.driver_id === accountInfo.id; });
      var completedOrders = myOrders.filter(function(o) { return o.status === '완료'; }).length;
      var totalBikes = 0;

      myOrders.forEach(function(o) {
           if(o.status === '완료') {
               totalBikes += (o.general_qty + o.sprout_qty);
           }
      });

      var activityBoxes = document.querySelectorAll('.activity-value');
      if (activityBoxes.length >= 4) {
           activityBoxes[0].textContent = '재배치 지시서 ' + completedOrders + '건';
           activityBoxes[1].textContent = '자전거 ' + totalBikes + '대';
      }
  }
});