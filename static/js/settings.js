// settings.js — 통합 프로필/설정 페이지 (일반 회원·관리자·기사 공용)

var ROLE_LABEL = { admin: '관리자', driver: '기사', user: '일반 회원' };
var ROLE_CLASS = { admin: 'role-admin', driver: 'role-driver', user: 'role-user' };
var ROLE_BADGE_CLASS = {
  admin: 'bg-success-subtle text-success',
  driver: 'bg-warning-subtle text-warning-emphasis',
  user: 'bg-secondary-subtle text-secondary'
};
var BACK_LINK = {
  admin: { href: 'admin-dashboard.html', text: '대시보드로 돌아가기' },
  driver: { href: 'driver-dashboard.html', text: '내 작업으로 돌아가기' },
  user: { href: 'user-dashboard.html', text: '실시간 현황으로 돌아가기' }
};

function showFields(selector) {
  document.querySelectorAll(selector).forEach(function (el) { el.classList.remove('d-none'); });
}

function todayDateString() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

document.addEventListener('DOMContentLoaded', async function () {
  var raw = localStorage.getItem('currentUser');
  var sessionUser = raw ? JSON.parse(raw) : null;

  if (!sessionUser || !localStorage.getItem('accessToken')) {
    document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
    return;
  }

  var accountInfo;
  try {
    accountInfo = await api.get('/auth/me');
  } catch (e) {
    accountInfo = sessionUser;
  }

  var role = accountInfo.role || 'user';
  var roleName = ROLE_LABEL[role] || role;
  var roleClass = ROLE_CLASS[role] || 'role-user';

  if (window.renderHeader) {
    window.renderHeader('profile', accountInfo);
  }

  var bl = BACK_LINK[role] || BACK_LINK.user;
  var backLink = document.getElementById('profileBackLink');
  backLink.href = bl.href;
  document.getElementById('profileBackText').textContent = bl.text;

  var nameStr = accountInfo.name || '이름 없음';
  var idStr = accountInfo.login_id || '-';

  // 상단 카드 — 역할별 배너/아바타 색상 (일반 회원 회색 / 관리자 초록색 / 기사 주황색)
  document.getElementById('profileBanner').classList.add(roleClass);
  var avatarEl = document.getElementById('profileAvatarInitial');
  avatarEl.textContent = nameStr.charAt(0);
  avatarEl.classList.add(roleClass);

  document.getElementById('profileNameDisplay').textContent = nameStr;
  var badge = document.getElementById('profileRoleBadge');
  badge.textContent = roleName;
  badge.className = 'badge fw-semibold px-2 py-1 ' + (ROLE_BADGE_CLASS[role] || ROLE_BADGE_CLASS.user);

  document.getElementById('infoLoginId').textContent = idStr;
  document.getElementById('infoName').textContent = nameStr;

  var joined = accountInfo.created_at ? accountInfo.created_at.split('T')[0] : '기록 없음';
  document.getElementById('infoJoinedDate').textContent = joined;
  document.getElementById('infoJoinedLabel').textContent = role === 'user' ? '가입일' : '입사일';

  if (role === 'user') {
    // 일반 회원: 회원정보 수정 + 이용 통계
    showFields('.role-field-user-only');
    document.getElementById('infoEmail').textContent = accountInfo.email || '등록된 이메일 없음';

    try {
      var myRentals = await api.get('/station/rentals/me');
      var totalMin = 0, totalDist = 0, totalCarbon = 0;
      myRentals.forEach(function (r) {
        totalMin += r.duration_min || 0;
        totalDist += r.distance_km || 0;
        totalCarbon += r.carbon_reduction || 0;
      });
      document.getElementById('statTotalMin').textContent = totalMin + ' 분';
      document.getElementById('statTotalDist').textContent = totalDist.toFixed(2) + ' km';
      document.getElementById('statTotalCarbon').textContent = totalCarbon.toFixed(2) + ' kg';
    } catch (e) { /* 통계는 부가 정보라 실패해도 페이지는 그대로 둔다 */ }
  } else {
    // 관리자 / 기사: 연락처 + 활동 현황
    showFields('.role-field-contact');
    showFields('.role-field-activity');

    document.getElementById('infoPhone').textContent = accountInfo.phone || '등록된 번호 없음';
    document.getElementById('infoEmail').textContent = accountInfo.email || '등록된 이메일 없음';

    var districtName = accountInfo.district_name || '서울시 전체';

    if (role === 'driver') {
      showFields('.role-field-district');
      showFields('.role-field-driver-only');
      document.getElementById('infoDistrict').textContent = districtName;
      document.getElementById('activityDistrict').textContent = districtName;
      document.getElementById('activityCardTitle').textContent = '작업 활동 현황';
      document.getElementById('activitySecondaryTitle').textContent = '총 누적 수거/배치';

      try {
        var myOrders = await api.get('/driver/orders');
        var todayStr = todayDateString();
        var todayDone = myOrders.filter(function (o) { return o.status === '완료' && (o.ordered_at || '').indexOf(todayStr) === 0; }).length;
        var totalBikes = 0;
        myOrders.forEach(function (o) { if (o.status === '완료') totalBikes += (o.general_qty + o.sprout_qty); });
        var isWorking = myOrders.some(function (o) { return o.status === '진행중'; });

        document.getElementById('activityTodayDone').textContent = '재배치 지시서 ' + todayDone + '건';
        document.getElementById('activitySecondaryValue').textContent = '자전거 ' + totalBikes + '대';
        var statusEl = document.getElementById('activityStatus');
        statusEl.textContent = isWorking ? '업무 수행 중' : '업무 대기 중';
        statusEl.className = 'activity-value ' + (isWorking ? 'text-primary' : 'text-success');
      } catch (e) { /* 활동 통계는 부가 정보 */ }
    } else {
      document.getElementById('activityCardTitle').textContent = '활동 현황';
      document.getElementById('activitySecondaryTitle').textContent = '총 누적';

      try {
        var allOrders = await api.get('/admin/dispatch');
        var todayStr2 = todayDateString();
        var todayDone2 = allOrders.filter(function (o) { return o.status === '완료' && (o.ordered_at || '').indexOf(todayStr2) === 0; }).length;
        document.getElementById('activityTodayDone').textContent = '지시서 ' + todayDone2 + '건 처리';
        document.getElementById('activitySecondaryValue').textContent = '지시서 ' + allOrders.length + '건 발송';
      } catch (e) { /* 활동 통계는 부가 정보 */ }
    }
  }

  // 모달 열릴 때 현재 아이디 대입 (일반 회원 전용)
  var loginIdModal = document.getElementById('loginIdModal');
  if (loginIdModal) {
    loginIdModal.addEventListener('show.bs.modal', function () {
      document.getElementById('editLoginId').value = accountInfo.login_id || '';
    });
  }

  var saveLoginIdBtn = document.getElementById('saveLoginIdBtn');
  if (saveLoginIdBtn) {
    saveLoginIdBtn.addEventListener('click', async function () {
      var newLoginId = document.getElementById('editLoginId').value.trim();
      if (!newLoginId) return alert('아이디를 입력해주세요.');

      saveLoginIdBtn.disabled = true;
      try {
        await api.patch('/user/login-id', { new_login_id: newLoginId });
      } catch (e) {
        alert(e.message || '아이디 변경에 실패했습니다.');
        return;
      } finally {
        saveLoginIdBtn.disabled = false;
      }

      accountInfo.login_id = newLoginId;
      sessionUser.login_id = newLoginId;
      localStorage.setItem('currentUser', JSON.stringify(sessionUser));

      alert('아이디가 성공적으로 변경되었습니다.');
      location.reload();
    });
  }

  // 새 비밀번호 규칙 체크리스트 (8~16자 · 영문 · 숫자 · 특수문자 포함)
  var PASSWORD_RULES = {
    ruleLength: function (v) { return v.length >= 8 && v.length <= 16; },
    ruleLetter: function (v) { return /[A-Za-z]/.test(v); },
    ruleNumber: function (v) { return /[0-9]/.test(v); },
    ruleSpecial: function (v) { return /[^A-Za-z0-9]/.test(v); }
  };
  var newPasswordInput = document.getElementById('newPassword');
  function checkPasswordRules() {
    var v = newPasswordInput ? newPasswordInput.value : '';
    var allValid = true;
    Object.keys(PASSWORD_RULES).forEach(function (key) {
      var li = document.getElementById(key);
      if (!li) return;
      var valid = PASSWORD_RULES[key](v);
      li.classList.toggle('valid', valid);
      li.querySelector('i').className = valid ? 'bi bi-check-circle-fill' : 'bi bi-circle';
      if (!valid) allValid = false;
    });
    return allValid;
  }
  if (newPasswordInput) {
    newPasswordInput.addEventListener('input', checkPasswordRules);
  }
  var passwordModalEl = document.getElementById('passwordModal');
  if (passwordModalEl) {
    passwordModalEl.addEventListener('show.bs.modal', checkPasswordRules);
  }

  var savePasswordBtn = document.getElementById('savePasswordBtn');
  if (savePasswordBtn) {
    savePasswordBtn.addEventListener('click', async function () {
      var curPw = document.getElementById('currentPassword').value;
      var newPw = document.getElementById('newPassword').value;
      var newPwConfirm = document.getElementById('confirmPassword').value;

      if (!curPw) return alert('현재 비밀번호를 입력해주세요.');
      if (!newPw) return alert('새 비밀번호를 입력해주세요.');
      if (!checkPasswordRules()) return alert('새 비밀번호가 규칙(8~16자, 영문·숫자·특수문자 포함)을 만족하지 않습니다.');
      if (newPw !== newPwConfirm) return alert('새 비밀번호가 일치하지 않습니다.');

      savePasswordBtn.disabled = true;
      try {
        await api.patch('/user/password', { current_password: curPw, new_password: newPw });
      } catch (e) {
        alert(e.message || '비밀번호 변경에 실패했습니다.');
        return;
      } finally {
        savePasswordBtn.disabled = false;
      }

      alert('비밀번호가 성공적으로 변경되었습니다.');
      document.getElementById('passwordForm').reset();
      checkPasswordRules();

      var modalEl = document.getElementById('passwordModal');
      var modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    });
  }

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (confirm('로그아웃 하시겠습니까?')) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('accessToken');
        window.location.href = 'index.html';
      }
    });
  }

  var withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) {
    withdrawBtn.addEventListener('click', async function () {
      if (!confirm('정말 회원 탈퇴하시겠습니까? 데이터가 모두 삭제됩니다.')) return;
      withdrawBtn.disabled = true;
      try {
        await api.delete('/user/me');
      } catch (e) {
        alert(e.message || '회원 탈퇴에 실패했습니다.');
        return;
      } finally {
        withdrawBtn.disabled = false;
      }
      alert('회원 탈퇴가 완료되었습니다.');
      localStorage.removeItem('currentUser');
      localStorage.removeItem('accessToken');
      window.location.href = 'index.html';
    });
  }
});
