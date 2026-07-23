// index.js

let currentTab = 'login';
let currentRole = '이용자';

const ROLE_KEY = {
    '관리자': 'admin', // DB 상에서는 seoul_admin(중앙 본부 관리자)
    '기사': 'driver',
    '이용자': 'user'
};

// 좌측 통계 데이터 렌더링 함수
function loadStats() {
    document.getElementById('stat-stations').innerText = DB.station.length.toLocaleString();

    const totalBikes = DB.district.reduce((sum, d) => sum + d.total_bikes, 0);
    document.getElementById('stat-bikes').innerText = totalBikes.toLocaleString();

    const rentals = DB.todayRentals.seoul;
    const formattedRentals = rentals >= 10000 ? (rentals / 10000).toFixed(1) + '만' : rentals.toLocaleString();
    document.getElementById('stat-rentals').innerText = formattedRentals;

    const districtList = document.getElementById('district-list');
    districtList.innerHTML = '';
    DB.district.forEach((d, index) => {
        const isFirst = index === 0;
        const li = document.createElement('li');
        li.innerHTML = `<a class="dropdown-item d-flex justify-content-between align-items-center ${isFirst ? 'selected-item' : ''}" href="#" onclick="selectDistrict('${d.name}', this); return false;">
            ${d.name} ${isFirst ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00965e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </a>`;
        districtList.appendChild(li);
    });
    document.getElementById('selected-district').innerText = DB.district[0].name;
}

// 화면 노출 로직 수정: 기사만 총괄 구역 유지, 나머지는 숨김
function updateFormVisibility() {
    const groupName = document.getElementById('group-name');
    const groupDistrict = document.getElementById('group-district');
    const groupPwConfirm = document.getElementById('group-pw-confirm');
    const groupTerms = document.getElementById('group-terms');
    const districtSelectArea = document.getElementById('district-select-area');
    const districtReadonlyArea = document.getElementById('district-readonly-area');

    const idLabel = document.getElementById('id-label');
    const idInput = document.getElementById('empId');

    if (currentRole === '이용자') {
        idLabel.innerText = '아이디';
        idInput.placeholder = '아이디를 입력해주세요.';
        groupDistrict.style.display = 'none'; // 이용자는 숨김
    } else if (currentRole === '관리자') {
        idLabel.innerText = '사번';
        idInput.placeholder = '아이디를 입력해주세요.';
        groupDistrict.style.display = 'none'; // 관리자는 숨김 (요청 사항)
    } else if (currentRole === '기사') {
        idLabel.innerText = '사번';
        idInput.placeholder = '아이디를 입력해주세요.';
        groupDistrict.style.display = 'block'; // 기사는 유지 (드롭다운 노출)
        districtSelectArea.style.display = 'block';
        districtReadonlyArea.style.display = 'none';
    }

    if (currentTab === 'login') {
        groupName.style.display = 'none';
        groupTerms.style.display = 'none';
        groupPwConfirm.style.display = 'none';
    } else if (currentTab === 'signup') {
        groupName.style.display = 'block';
        groupTerms.style.display = 'block';
        groupPwConfirm.style.display = 'block';
    }

    document.getElementById('pw-confirm-error').style.setProperty('display', 'none', 'important');
}

function resetFormInputs() {
    document.getElementById('userName').value = '';
    document.getElementById('empId').value = '';
    document.getElementById('empPw').value = '';
    document.getElementById('empPwConfirm').value = '';
    document.getElementById('termsCheck').checked = false;
    document.getElementById('pw-confirm-error').style.setProperty('display', 'none', 'important');
}

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

function selectRole(element) {
    const cards = document.querySelectorAll('.role-card');
    cards.forEach(card => card.classList.remove('role-active'));
    element.classList.add('role-active');

    currentRole = element.querySelector('p').innerText;
    updateFormVisibility();
}

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

function attemptAction() {
    const inputId = document.getElementById('empId').value;
    const inputPw = document.getElementById('empPw').value;
    const inputPwConfirm = document.getElementById('empPwConfirm').value;
    const pwConfirmError = document.getElementById('pw-confirm-error');
    pwConfirmError.style.setProperty('display', 'none', 'important');

    if (currentTab === 'login') {
        const matched = DB.account.find(function (acc) {
            if (currentRole === '관리자') {
                return acc.login_id === inputId && acc.role === 'seoul_admin';
            } else {
                return acc.login_id === inputId && acc.role === ROLE_KEY[currentRole];
            }
        });

        if (!matched) {
            alert('아이디, 비밀번호 또는 접속 권한이 일치하지 않습니다.');
            return;
        }

        const actualRole = matched.role;

        localStorage.setItem('loggedInUser', JSON.stringify({
            id: matched.id,
            role: actualRole,
            name: matched.name,
            district_id: matched.district_id,
            district_name: matched.district_name
        }));

        if (actualRole === 'seoul_admin') {
            window.location.href = 'admin_dashboard.html';
        } else if (actualRole === 'driver') {
            window.location.href = 'driver_dashboard.html';
        } else if (actualRole === 'user') {
            window.location.href = 'user_dashboard.html';
        }

    } else if (currentTab === 'signup') {
        const termsCheck = document.getElementById('termsCheck').checked;

        if (inputId === '' || inputPw === '' || inputPwConfirm === '') {
            alert('가입 필수 정보를 모두 입력해 주세요.');
            return;
        }
        if (inputPw !== inputPwConfirm) {
            pwConfirmError.style.setProperty('display', 'block', 'important');
            return;
        }
        if (!termsCheck) {
            alert('개인정보 수집 및 이용에 동의 시 회원가입이 가능합니다.');
            return;
        }

        alert('회원가입이 정상적으로 완료되었습니다.');
        switchTab('login');
    }
}

document.addEventListener('DOMContentLoaded', function () {
    loadStats();
    updateFormVisibility();
});