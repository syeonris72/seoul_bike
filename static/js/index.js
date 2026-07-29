// index.js
// 서울자전거 따릉이 로그인/회원가입 페이지(index.html) 전용 스크립트.
// api.js를 통해 백엔드에 로그인/회원가입을 요청하고,
// 탭 전환·접속 권한 선택·총괄 구역 선택 등 화면 상태를 제어한다.

let currentTab = 'login';
let currentRole = '일반 회원';

const ROLE_KEY = {
    '관리자': 'admin',
    '기사': 'driver',
    '일반 회원': 'user'
};

// serving/district.py의 DISTRICTS와 동일 (고정 상수라 로그인 전에도 조회 없이 바로 렌더링)
const DISTRICTS = [
    { id: 1, name: '마포구' }, { id: 2, name: '강서구' },
    { id: 3, name: '송파구' }, { id: 4, name: '영등포구' }
];

/**
 * 좌측 패널의 통계 수치(총 대여소/운영 자전거/일일 대여)와
 * 총괄 구역 드롭다운 목록을 백엔드에서 불러와 렌더링한다.
 */
async function loadStats() {
    try {
        const summary = await api.get('/station/public/summary');
        document.getElementById('stat-stations').innerText = summary.station_count.toLocaleString();
        document.getElementById('stat-bikes').innerText = summary.total_bikes.toLocaleString();
        const rentals = summary.today_rentals;
        const formattedRentals = rentals >= 10000 ? (rentals / 10000).toFixed(1) + '만' : rentals.toLocaleString();
        document.getElementById('stat-rentals').innerText = formattedRentals;
    } catch (e) {
        // 랜딩 통계는 부가 정보라 실패해도 로그인/가입 자체는 막지 않는다
    }

    const districtList = document.getElementById('district-list');
    districtList.innerHTML = '';
    DISTRICTS.forEach((d, index) => {
        const isFirst = index === 0;
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.className = `dropdown-item d-flex justify-content-between align-items-center ${isFirst ? 'selected-item' : ''}`;
        link.href = '#';
        link.innerHTML = `${d.name} ${isFirst ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00965e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}`;
        link.addEventListener('click', function (e) {
            e.preventDefault();
            selectDistrict(d.name, link);
        });
        li.appendChild(link);
        districtList.appendChild(li);
    });
    document.getElementById('selected-district').innerText = DISTRICTS[0].name;
}

/**
 * 현재 선택된 접속 권한(currentRole)과 탭(currentTab)에 맞춰
 * 오른쪽 폼의 각 입력 그룹 노출 여부와 라벨/placeholder를 갱신한다.
 * - 총괄 구역 입력: 기사만 노출
 * - 이름/약관동의/비밀번호 확인/이메일: 회원가입 탭에서만 노출
 */
function updateFormVisibility() {
    const groupName = document.getElementById('group-name');
    const groupDistrict = document.getElementById('group-district');
    const groupPwConfirm = document.getElementById('group-pw-confirm');
    const groupTerms = document.getElementById('group-terms');
    const groupEmail = document.getElementById('group-email');
    const passwordRuleList = document.getElementById('password-rule-list');

    const idLabel = document.getElementById('id-label');
    const idInput = document.getElementById('empId');

    if (currentRole === '일반 회원') {
        idLabel.innerText = '아이디';
        idInput.placeholder = '아이디를 입력해주세요';
        groupDistrict.style.display = 'none';
    } else if (currentRole === '관리자') {
        idLabel.innerText = '사번';
        idInput.placeholder = '사번을 입력해주세요';
        groupDistrict.style.display = 'none';
    } else if (currentRole === '기사') {
        idLabel.innerText = '사번';
        idInput.placeholder = '사번을 입력해주세요';
        groupDistrict.style.display = 'block';
    }

    if (currentTab === 'login') {
        groupName.style.display = 'none';
        groupTerms.style.display = 'none';
        groupPwConfirm.style.display = 'none';
        groupEmail.style.display = 'none';
        passwordRuleList.classList.add('d-none');
    } else if (currentTab === 'signup') {
        groupName.style.display = 'block';
        groupTerms.style.display = 'block';
        groupPwConfirm.style.display = 'block';
        groupEmail.style.display = currentRole === '일반 회원' ? 'block' : 'none';
        passwordRuleList.classList.remove('d-none');
    }

    document.getElementById('pw-confirm-error').classList.add('d-none');
    checkPasswordRules();
}

// 회원가입 비밀번호 규칙 체크리스트 (8~16자 · 영문 · 숫자 · 특수문자 포함)
// settings.js의 비밀번호 변경 규칙과 동일 - 서버(schema/request.py SignupRequest)도 같은 기준으로 검증한다.
const PASSWORD_RULES = {
    ruleLength: (v) => v.length >= 8 && v.length <= 16,
    ruleLetter: (v) => /[A-Za-z]/.test(v),
    ruleNumber: (v) => /[0-9]/.test(v),
    ruleSpecial: (v) => /[^A-Za-z0-9]/.test(v)
};

function checkPasswordRules() {
    const input = document.getElementById('empPw');
    const v = input ? input.value : '';
    let allValid = true;
    Object.keys(PASSWORD_RULES).forEach(function (key) {
        const li = document.getElementById(key);
        if (!li) return;
        const valid = PASSWORD_RULES[key](v);
        li.classList.toggle('valid', valid);
        li.querySelector('i').className = valid ? 'bi bi-check-circle-fill' : 'bi bi-circle';
        if (!valid) allValid = false;
    });
    return allValid;
}

/**
 * 입력 폼의 모든 값을 비우고 에러 문구를 숨긴다.
 * (탭 전환, 접속 권한 변경 시 이전 입력값이 남지 않도록 호출)
 */
function resetFormInputs() {
    document.getElementById('userName').value = '';
    document.getElementById('empId').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('empPw').value = '';
    document.getElementById('empPwConfirm').value = '';
    document.getElementById('termsCheck').checked = false;
    document.getElementById('pw-confirm-error').classList.add('d-none');
}

/**
 * 로그인/회원가입 탭을 전환한다.
 * @param {'login'|'signup'} tabType 전환할 탭
 */
function switchTab(tabType) {
    currentTab = tabType;
    resetFormInputs();
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const mainTitle = document.getElementById('main-title');
    const mainSubtitle = document.getElementById('main-subtitle');
    const actionBtn = document.getElementById('action-btn');

    if (tabType === 'login') {
        tabLogin.classList.add('tab-active');
        tabSignup.classList.remove('tab-active');
        mainTitle.innerText = '로그인';
        mainSubtitle.innerText = '부여받은 계정 정보로 로그인해 주세요.';
        actionBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-2 text-white"></i>로그인';
    } else if (tabType === 'signup') {
        tabSignup.classList.add('tab-active');
        tabLogin.classList.remove('tab-active');
        mainTitle.innerText = '회원가입';
        mainSubtitle.innerText = '서비스 이용을 위한 정보를 입력해 주세요.';
        actionBtn.innerHTML = '<i class="bi bi-person-plus me-2 text-white"></i>회원가입';
    }

    updateFormVisibility();
}

/**
 * 접속 권한 카드(일반 회원/관리자/기사) 선택을 처리한다.
 * @param {HTMLElement} element 클릭된 role-card 엘리먼트
 */
function selectRole(element) {
    const cards = document.querySelectorAll('.role-card');
    cards.forEach(card => card.classList.remove('role-active'));
    element.classList.add('role-active');

    currentRole = element.querySelector('p').innerText;
    resetFormInputs();
    updateFormVisibility();
}

/**
 * 총괄 구역 드롭다운에서 항목 선택을 처리한다.
 * @param {string} districtName 선택된 구역명
 * @param {HTMLElement} element 클릭된 드롭다운 항목(a 태그)
 */
function selectDistrict(districtName, element) {
    document.getElementById('selected-district').innerText = districtName;

    const items = document.querySelectorAll('.custom-dropdown-menu .dropdown-item');
    items.forEach(item => {
        item.classList.remove('selected-item');
        const svg = item.querySelector('svg');
        if (svg) svg.remove();
    });

    element.classList.add('selected-item');
    const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00965e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    element.insertAdjacentHTML('beforeend', checkIcon);
}

/**
 * 로그인/회원가입 버튼(또는 폼 내 Enter 키) 실행 시 호출되는 메인 액션 핸들러.
 * currentTab 값에 따라 로그인 검증 또는 회원가입 처리를 수행한다.
 */
let _actionInFlight = false;

async function attemptAction() {
    // 버튼 연타/Enter 연타로 로그인·가입 요청이 중복 전송되는 것을 막는다.
    if (_actionInFlight) return;
    _actionInFlight = true;
    const actionBtn = document.getElementById('action-btn');
    if (actionBtn) actionBtn.disabled = true;
    try {
        await _attemptActionInner();
    } finally {
        _actionInFlight = false;
        if (actionBtn) actionBtn.disabled = false;
    }
}

async function _attemptActionInner() {
    const inputId = document.getElementById('empId').value;
    const inputPw = document.getElementById('empPw').value;
    const inputPwConfirm = document.getElementById('empPwConfirm').value;
    const pwConfirmError = document.getElementById('pw-confirm-error');
    pwConfirmError.classList.add('d-none');

    if (currentTab === 'login') {
        if (inputId === '' || inputPw === '') {
            alert('아이디와 비밀번호를 입력해 주세요.');
            return;
        }

        let res;
        try {
            res = await api.post('/auth/login', {
                login_id: inputId,
                password: inputPw,
                role: ROLE_KEY[currentRole]
            });
        } catch (e) {
            // 네트워크/연결 실패(file://로 직접 열었거나 서버 다운 등)는 fetch가
            // TypeError를 던진다 - 이걸 "비밀번호 오류"로 오인시키면 안 되므로 구분한다.
            if (e instanceof TypeError) {
                alert('서버에 연결할 수 없습니다. http://로 시작하는 주소로 접속했는지, 서버가 실행 중인지 확인해 주세요.');
            } else {
                alert(e.message || '아이디, 비밀번호 또는 접속 권한이 일치하지 않습니다.');
            }
            return;
        }

        localStorage.setItem('accessToken', res.access_token);
        localStorage.setItem('currentUser', JSON.stringify({
            id: res.user_id,
            role: res.role,
            name: res.name,
            district_id: res.district_id,
            district_name: res.district_name
        }));

        if (res.role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else if (res.role === 'driver') {
            window.location.href = 'driver-dashboard.html';
        } else if (res.role === 'user') {
            window.location.href = 'user-dashboard.html';
        }

    } else if (currentTab === 'signup') {
        const termsCheck = document.getElementById('termsCheck').checked;
        const inputName = document.getElementById('userName').value.trim();
        const inputEmail = document.getElementById('userEmail').value.trim();

        if (inputId === '' || inputPw === '' || inputPwConfirm === '' || inputName === '') {
            alert('가입 필수 정보를 모두 입력해 주세요.');
            return;
        }
        if (currentRole === '일반 회원' && inputEmail === '') {
            alert('이메일을 입력해 주세요.');
            return;
        }
        if (!checkPasswordRules()) {
            alert('비밀번호가 규칙(8~16자, 영문·숫자·특수문자 포함)을 만족하지 않습니다.');
            return;
        }
        if (inputPw !== inputPwConfirm) {
            pwConfirmError.classList.remove('d-none');
            return;
        }
        if (!termsCheck) {
            alert('개인정보 수집 및 이용에 동의 시 회원가입이 가능합니다.');
            return;
        }
        if (currentRole !== '일반 회원') {
            alert('관리자/기사 계정은 자체 가입이 불가합니다. 담당자에게 문의해 주세요.');
            return;
        }

        try {
            await api.post('/auth/signup', {
                login_id: inputId,
                password: inputPw,
                password_confirm: inputPwConfirm,
                name: inputName,
                email: inputEmail
            });
        } catch (e) {
            alert(e.message || '회원가입에 실패했습니다.');
            return;
        }

        alert('회원가입이 정상적으로 완료되었습니다.');
        switchTab('login');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    updateFormVisibility();

    const empPwInput = document.getElementById('empPw');
    if (empPwInput) {
        empPwInput.addEventListener('input', checkPasswordRules);
    }

    document.getElementById('tab-login').addEventListener('click', function () {
        switchTab('login');
    });
    document.getElementById('tab-signup').addEventListener('click', function () {
        switchTab('signup');
    });

    document.querySelectorAll('.role-card').forEach(function (card) {
        card.addEventListener('click', function () {
            selectRole(card);
        });
    });

    document.getElementById('action-btn').addEventListener('click', attemptAction);

    var rightPanel = document.querySelector('.right-panel');
    var mobileLogoBar = document.querySelector('.mobile-logo-bar');
    if (rightPanel && mobileLogoBar) {
        rightPanel.addEventListener('scroll', function () {
            mobileLogoBar.classList.toggle('logo-hidden', rightPanel.scrollTop > 4);
        });
    }

    var enterSubmitInputs = ['userName', 'empId', 'userEmail', 'empPw', 'empPwConfirm'];
    enterSubmitInputs.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                attemptAction();
            }
        });
    });
});
