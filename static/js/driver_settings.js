// driver_settings.js

document.addEventListener('DOMContentLoaded', function () {
  var raw = localStorage.getItem('loggedInUser');
  var currentUser = raw ? JSON.parse(raw) : null;

  if (!currentUser) {
      alert('로그인이 필요합니다.');
      window.location.href = 'index.html';
      return;
  }

  // DB 최신 정보로 보정
  var accountInfo = (typeof DB !== 'undefined' && DB.account) ? DB.account.find(function(acc) {
    return acc.id === currentUser.id;
  }) : currentUser;

  if (!accountInfo) accountInfo = currentUser;

  var userName = currentUser.name || accountInfo.name;
  var userPhone = currentUser.phone || accountInfo.phone || '';
  var userEmail = currentUser.email || accountInfo.email || '';
  var districtName = currentUser.district_name || accountInfo.district_name || '소속 없음';

  if (window.renderHeader) {
    window.renderHeader('tasks', {
      role: 'driver',
      name: userName,
      district_name: districtName
    });
  }

  // 로그아웃 버튼 이벤트
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
      }
    });
  }

  // 프로필 정보 수정 모달 열릴 때 기존 데이터 바인딩
  var profileEditModal = document.getElementById('profileEditModal');
  if (profileEditModal) {
    profileEditModal.addEventListener('show.bs.modal', function () {
      document.getElementById('editName').value = userName;
      document.getElementById('editPhone').value = userPhone;
      document.getElementById('editEmail').value = userEmail;
    });
  }

  // 프로필 편집 저장 처리
  var saveProfileBtn = document.getElementById('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', function () {
      var newName = document.getElementById('editName').value.trim();
      var newPhone = document.getElementById('editPhone').value.trim();
      var newEmail = document.getElementById('editEmail').value.trim();

      if (!newName) {
          alert('이름을 입력해주세요.');
          return;
      }

      currentUser.name = newName;
      currentUser.phone = newPhone;
      currentUser.email = newEmail;

      // 변경된 정보 로컬 스토리지에 덮어쓰기
      localStorage.setItem('loggedInUser', JSON.stringify(currentUser));

      alert('회원 정보가 성공적으로 수정되었습니다.');

      var modalEl = document.getElementById('profileEditModal');
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      // 헤더 업데이트를 위해 새로고침
      location.reload();
    });
  }

  // 비밀번호 변경 저장 처리
  var savePasswordBtn = document.getElementById('savePasswordBtn');
  if (savePasswordBtn) {
    savePasswordBtn.addEventListener('click', function () {
      var newPw = document.getElementById('newPassword').value;
      var confirmPw = document.getElementById('confirmPassword').value;

      if (!newPw) {
          alert('새 비밀번호를 입력해주세요.');
          return;
      }

      if (newPw !== confirmPw) {
        alert('새 비밀번호가 일치하지 않습니다.');
        return;
      }

      alert('비밀번호가 성공적으로 변경되었습니다.');

      var passwordForm = document.getElementById('passwordForm');
      if (passwordForm) passwordForm.reset();

      var modalEl = document.getElementById('passwordModal');
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    });
  }
});