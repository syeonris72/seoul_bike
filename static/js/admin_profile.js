// admin_profile.js

var ROLE_LABEL = { seoul_admin: '중앙 본부 관리자' };

function getCurrentUser() {
  var raw = localStorage.getItem('loggedInUser'); // 통합 세션 키
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { }
  }
  return { id: 501, role: 'seoul_admin', name: '김관제', district_id: null };
}

document.addEventListener('DOMContentLoaded', function () {
  var sessionUser = getCurrentUser();
  if (!sessionUser) {
    window.location.href = 'index.html';
    return;
  }

  var accountInfo = (typeof DB !== 'undefined' && DB.account) ? DB.account.find(function (acc) {
    return acc.id === sessionUser.id;
  }) : sessionUser;

  if (!accountInfo) accountInfo = sessionUser;

  accountInfo.name = sessionUser.name || accountInfo.name;
  accountInfo.phone = sessionUser.phone || accountInfo.phone;
  accountInfo.email = sessionUser.email || accountInfo.email;

  var roleName = ROLE_LABEL[accountInfo.role] || accountInfo.role;
  var districtName = '서울시 전체';

  if (window.renderHeader) {
    window.renderHeader('profile', accountInfo);
  }

  var empId = accountInfo.login_id || ('EMP-' + (2000000 + accountInfo.id));
  document.getElementById('profileAvatarInitial').textContent = (accountInfo.name || '관').charAt(0);
  document.getElementById('profileNameDisplay').textContent = accountInfo.name || '김관제';
  document.getElementById('profileRoleBadge').textContent = roleName;
  document.getElementById('profileIdDisplay').textContent = empId;

  document.getElementById('infoName').textContent = accountInfo.name || '김관제';
  document.getElementById('infoPhone').textContent = accountInfo.phone || '02-120-1234';
  document.getElementById('infoEmail').textContent = accountInfo.email || 'control@seoul.go.kr';
  document.getElementById('infoEmpId').textContent = empId;
  document.getElementById('infoRole').textContent = roleName;
  document.getElementById('infoDistrict').textContent = districtName;

  var joined = accountInfo.created_at ? accountInfo.created_at.split('T')[0] : '2021-03-15';
  document.getElementById('infoJoinedDate').textContent = joined;
  document.getElementById('activityJoinedDate').textContent = joined;
  document.getElementById('activityDistrict').textContent = districtName;

  // 활동 현황 (mock_data 연동)
  if (typeof DB !== 'undefined' && DB.dispatch_order) {
    var todayStr = '2026-07-23';
    var todayDone = DB.dispatch_order.filter(function (o) { return o.status === '완료' && (o.ordered_at || '').indexOf(todayStr) === 0; }).length;
    var totalOrders = DB.dispatch_order.length;
    document.getElementById('activityTodayDone').textContent = '지시서 ' + todayDone + '건 처리';
    document.getElementById('activityTotalOrders').textContent = '지시서 ' + totalOrders + '건 발송';
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
