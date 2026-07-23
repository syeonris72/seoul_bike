// user_profile.js

document.addEventListener('DOMContentLoaded', function () {
  // 1. 로컬 스토리지에서 현재 로그인한 유저 세션 가져오기
  var raw = localStorage.getItem('loggedInUser');
  var sessionUser = raw ? JSON.parse(raw) : null;

  if (!sessionUser) {
    alert('로그인이 필요합니다.');
    window.location.href = 'index.html';
    return;
  }

  // 2. DB.account에서 현재 로그인한 유저의 진짜 상세 정보 조회
  var accountInfo = null;
  if (typeof DB !== 'undefined' && DB.account) {
      accountInfo = DB.account.find(function(acc) {
          return acc.id === sessionUser.id;
      });
  }

  // DB에서 못 찾았으면 세션 정보로 대체
  if (!accountInfo) accountInfo = sessionUser;

  // 로컬 스토리지에 이름 등 변경된 내역이 있다면 덮어쓰기
  accountInfo.name = sessionUser.name || accountInfo.name;

  // 3. 공통 헤더 렌더링 호출
  if (window.renderHeader) {
    window.renderHeader('profile', accountInfo);
  }

  // 4. 화면 데이터 바인딩 (하드코딩 제거)
  var nameStr = accountInfo.name || '알 수 없음';
  var loginIdStr = accountInfo.login_id || '알 수 없음';

  // 날짜 데이터가 있으면 T를 기준으로 자르고, 없으면 기록 없음 처리
  var joinedDateStr = accountInfo.created_at ? accountInfo.created_at.split('T')[0] : '기록 없음';

  document.getElementById('profileAvatarInitial').textContent = nameStr.charAt(0);
  document.getElementById('profileNameDisplay').textContent = nameStr;
  document.getElementById('profileIdDisplay').textContent = loginIdStr;
  document.getElementById('infoLoginId').textContent = loginIdStr;
  document.getElementById('infoName').textContent = nameStr;
  document.getElementById('infoJoinedDate').textContent = joinedDateStr;

  // 5. DB.rental을 기반으로 유저 통계 계산 및 바인딩
  if (typeof DB !== 'undefined' && DB.rental) {
      var myRentals = DB.rental.filter(function(r) { return r.user_id === accountInfo.id; });
      var totalMin = 0, totalDist = 0, totalCarbon = 0;

      myRentals.forEach(function(r) {
          totalMin += r.duration_min || 0;
          totalDist += r.distance_km || 0;
          totalCarbon += r.carbon_reduction || 0;
      });

      var statRows = document.querySelectorAll('.stat-row b');
      if (statRows.length >= 4) {
          statRows[0].textContent = totalMin + ' 분';
          statRows[1].textContent = totalDist.toFixed(2) + ' km';
          statRows[2].textContent = (totalMin * 5.5).toFixed(2) + ' kcal'; // 임의 칼로리 계산
          statRows[3].textContent = totalCarbon.toFixed(2) + ' kg';
      }
  }

  // 모달 열릴 때 현재 이름 대입
  var profileModal = document.getElementById('profileModal');
  if (profileModal) {
    profileModal.addEventListener('show.bs.modal', function () {
      document.getElementById('editLoginId').value = accountInfo.login_id || '';
      document.getElementById('editName').value = accountInfo.name || '';
    });
  }

  // 아이디/이름 수정 저장
  var saveProfileBtn = document.getElementById('saveProfileBtn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', function () {
      var newLoginId = document.getElementById('editLoginId').value.trim();
      var newName = document.getElementById('editName').value.trim();
      if (!newLoginId) return alert('아이디를 입력해주세요.');
      if (!newName) return alert('이름을 입력해주세요.');

      var duplicate = typeof DB !== 'undefined' && DB.account.some(function (acc) {
        return acc.login_id === newLoginId && acc.id !== accountInfo.id;
      });
      if (duplicate) return alert('이미 사용 중인 아이디입니다.');

      accountInfo.login_id = newLoginId;
      sessionUser.name = newName;
      sessionUser.login_id = newLoginId;
      localStorage.setItem('loggedInUser', JSON.stringify(sessionUser));

      alert('회원정보가 성공적으로 수정되었습니다.');
      location.reload();
    });
  }

  // 비밀번호 변경 저장
  var savePasswordBtn = document.getElementById('savePasswordBtn');
  if (savePasswordBtn) {
    savePasswordBtn.addEventListener('click', function () {
      var curPw = document.getElementById('curPw').value;
      var newPw = document.getElementById('newPw').value;
      var newPwConfirm = document.getElementById('newPwConfirm').value;

      if (!curPw) return alert('현재 비밀번호를 입력해주세요.');
      if (!newPw) return alert('새 비밀번호를 입력해주세요.');
      if (newPw !== newPwConfirm) return alert('새 비밀번호가 일치하지 않습니다.');
      if (newPw.length < 8) return alert('새 비밀번호는 8자 이상이어야 합니다.');

      alert('비밀번호가 성공적으로 변경되었습니다.');
      document.getElementById('passwordForm').reset();

      var modalEl = document.getElementById('passwordModal');
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    });
  }

  // 로그아웃 버튼
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
      }
    });
  }

  // 회원 탈퇴 버튼
  var withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', function () {
      if (confirm('정말 회원 탈퇴하시겠습니까? 데이터가 모두 삭제됩니다.')) {
        alert('회원 탈퇴가 완료되었습니다.');
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
      }
    });
  }
});