// admin_settings.js

var ROLE_LABEL = { seoul_admin: '중앙 본부 관리자' };

function getCurrentUser() {
  var raw = localStorage.getItem('loggedInUser'); // 통합 세션 키
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

document.addEventListener('DOMContentLoaded', function () {
  var currentUser = getCurrentUser();

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  if (window.renderHeader) {
    window.renderHeader('settings', {
      subtitle: '서울시 전체',
      avatarInitial: (currentUser.name || '관').charAt(0),
      userName: currentUser.name,
      userRole: ROLE_LABEL[currentUser.role] || currentUser.role,
      userId: currentUser.login_id || ('EMP-' + (2000000 + currentUser.id))
    });
  }

  // 모달 오픈 시 기존 회원 정보 바인딩
  var profileModal = document.getElementById('profileModal');
  if (profileModal) {
    profileModal.addEventListener('show.bs.modal', function () {
      document.getElementById('profileName').value = currentUser.name || '';
      document.getElementById('profilePhone').value = currentUser.phone || '02-120-1234';
      document.getElementById('profileEmail').value = currentUser.email || 'control@seoul.go.kr';
    });
  }

  // 로그아웃 처리
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
      }
    });
  }

  // 프로필 편집 저장 처리
  var saveProfileBtn = document.getElementById('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', function () {
      currentUser.name = document.getElementById('profileName').value;
      currentUser.phone = document.getElementById('profilePhone').value;
      currentUser.email = document.getElementById('profileEmail').value;

      // 로컬 스토리지에 변경사항 저장
      localStorage.setItem('loggedInUser', JSON.stringify(currentUser));

      alert('회원 정보가 성공적으로 수정되었습니다.');

      var modalEl = document.getElementById('profileModal');
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      location.reload(); // 헤더 등 UI 반영을 위해 새로고침
    });
  }

  // 비밀번호 변경 저장 처리
  var savePasswordBtn = document.getElementById('savePasswordBtn');
  if (savePasswordBtn) {
    savePasswordBtn.addEventListener('click', function () {
      var newPw = document.getElementById('newPassword').value;
      var confirmPw = document.getElementById('confirmPassword').value;

      if (newPw !== confirmPw) {
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
});