// driver_profile.js

document.addEventListener('DOMContentLoaded', function () {
  var raw = localStorage.getItem('loggedInUser');
  var sessionUser = raw ? JSON.parse(raw) : null;

  if (!sessionUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'index.html';
      return;
  }

  var accountInfo = (typeof DB !== 'undefined' && DB.account) ? DB.account.find(function(acc) {
    return acc.id === sessionUser.id;
  }) : sessionUser;

  if (!accountInfo) accountInfo = sessionUser;

  accountInfo.name = sessionUser.name || accountInfo.name;
  accountInfo.phone = sessionUser.phone || accountInfo.phone || '등록된 번호 없음';
  accountInfo.email = sessionUser.email || accountInfo.email || '등록된 이메일 없음';

  var districtName = accountInfo.district_name || '소속 없음';
  if (accountInfo.district_id && typeof DB !== 'undefined' && DB.district) {
    var dist = DB.district.find(function(d) { return d.id === accountInfo.district_id; });
    if (dist) districtName = dist.name;
  }

  if (window.renderHeader) {
    window.renderHeader('profile', accountInfo);
  }

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
  document.getElementById('activityDistrict').textContent = districtName;

  // 활동 현황 (mock_data 연동)
  if (typeof DB !== 'undefined' && DB.dispatch_order) {
    var todayStr = '2026-07-23';
    var myOrders = DB.dispatch_order.filter(function (o) { return o.driver_id === accountInfo.id; });
    var todayDone = myOrders.filter(function (o) { return o.status === '완료' && (o.ordered_at || '').indexOf(todayStr) === 0; }).length;
    var totalBikes = 0;
    myOrders.forEach(function (o) { if (o.status === '완료') totalBikes += (o.general_qty + o.sprout_qty); });
    var isWorking = myOrders.some(function (o) { return o.status === '진행중'; });

    document.getElementById('activityTodayDone').textContent = '재배치 지시서 ' + todayDone + '건';
    document.getElementById('activityTotalBikes').textContent = '자전거 ' + totalBikes + '대';
    var statusEl = document.getElementById('activityStatus');
    statusEl.textContent = isWorking ? '업무 수행 중' : '업무 대기 중';
    statusEl.className = 'activity-value ' + (isWorking ? 'text-primary' : 'text-success');
  }

  // 비밀번호 변경
  var savePasswordBtn = document.getElementById('savePasswordBtn');
  if (savePasswordBtn) {
    savePasswordBtn.addEventListener('click', function () {
      var newPw = document.getElementById('newPassword').value;
      var confirmPw = document.getElementById('confirmPassword').value;
      if (!newPw || newPw !== confirmPw) {
        alert('새 비밀번호가 일치하지 않습니다.');
        return;
      }
      alert('비밀번호가 성공적으로 변경되었습니다.');
      document.getElementById('passwordForm').reset();
      var modalEl = document.getElementById('passwordModal');
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    });
  }

  // 로그아웃
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
      }
    });
  }
});
