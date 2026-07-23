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

  // DB.account 조회 (혹은 설정에서 변경한 최신 localStorage 값 적용)
  var accountInfo = (typeof DB !== 'undefined' && DB.account) ? DB.account.find(function(acc) {
    return acc.id === sessionUser.id;
  }) : sessionUser;

  if (!accountInfo) accountInfo = sessionUser;

  accountInfo.name = sessionUser.name || accountInfo.name;
  accountInfo.phone = sessionUser.phone || accountInfo.phone;
  accountInfo.email = sessionUser.email || accountInfo.email;

  var roleName = ROLE_LABEL[accountInfo.role] || accountInfo.role;
  var districtName = '서울시 전체';

  // 공통 헤더 렌더링 호출
  if (window.renderHeader) {
    window.renderHeader('profile', {
      subtitle: districtName,
      avatarInitial: (accountInfo.name || '관').charAt(0),
      userName: accountInfo.name,
      userRole: roleName,
      userId: accountInfo.login_id || ('EMP-' + (2000000 + accountInfo.id)),
      district_name: districtName,
      role: accountInfo.role
    });
  }

  // 화면 데이터 바인딩
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
});