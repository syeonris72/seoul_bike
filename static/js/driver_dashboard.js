// driver_dashboard.js

function renderDispatchOrders(driverId) {
    const listView = document.getElementById('listView');
    if (!listView) return;

    // 🟢 DB 참조 안정성 강화
    const db = window.DB;
    if (!db || !db.dispatch_order) {
        listView.innerHTML = `<div class="empty-state-box text-center shadow-sm py-5 rounded-4 bg-white text-danger fw-bold">데이터(mock_data)를 불러오지 못했습니다.<br>스크립트 연결 순서를 확인해주세요.</div>`;
        return;
    }

    // 🟢 강제 할당: 현재 어떤 계정으로 로그인되어 있든 무조건 901(김마포) 기사의 데이터를 보여주도록 설정
    const targetDriverId = 901;
    const myOrders = db.dispatch_order.filter(order => order.driver_id === targetDriverId);

    // 상단 탭 상태 요약 카운트 업데이트
    const countWaiting = myOrders.filter(o => o.status === '대기').length;
    const countDoing = myOrders.filter(o => o.status === '진행중').length;
    const countDone = myOrders.filter(o => o.status === '완료').length;

    if (document.getElementById('count-waiting')) document.getElementById('count-waiting').textContent = countWaiting;
    if (document.getElementById('count-doing')) document.getElementById('count-doing').textContent = countDoing;
    if (document.getElementById('count-done')) document.getElementById('count-done').textContent = countDone;

    let html = `
        <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 border-bottom pb-2">
            <span class="fw-bold fs-6 text-dark">전체 지시서</span>
            <span class="text-muted small">${myOrders.length}건</span>
        </div>
    `;

    if (myOrders.length === 0) {
        html += `<div class="empty-state-box text-center shadow-sm py-5 rounded-4 bg-white text-muted">수행할 지시서가 없습니다.</div>`;
    } else {
        // 최신 지시서 순으로 정렬하여 표시
        myOrders.sort((a,b) => new Date(b.ordered_at) - new Date(a.ordered_at)).forEach(order => {
            const fromStation = db.station.find(s => s.id === order.from_station_id);
            const toStation = db.station.find(s => s.id === order.to_station_id);
            const timeString = new Date(order.ordered_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const orderYear = new Date(order.ordered_at).getFullYear();

            // 이동 수량이 10대 이상이면 긴급 표시 부여
            const isUrgent = order.status === '대기' && (order.general_qty + order.sprout_qty >= 10);

            let badgeClass = 'bg-secondary-subtle text-secondary';
            if (order.status === '완료') badgeClass = 'bg-success-subtle text-success';
            else if (order.status === '진행중') badgeClass = 'bg-primary-subtle text-primary';

            html += `
            <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-body p-3 p-sm-4">
                    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
                        <div>
                            <span class="text-muted small fw-bold me-2">ORD-${orderYear}-${order.id.toString().padStart(3, '0')}</span>
                            ${isUrgent ? '<span class="badge rounded-pill bg-danger-subtle text-danger px-2 py-1">긴급</span>' : ''}
                        </div>
                        <span class="badge rounded-pill ${badgeClass} px-3 py-1">${order.status}</span>
                    </div>
                    <h5 class="fw-bold mb-4 text-dark lh-base">${fromStation ? fromStation.name : '알 수 없음'} &nbsp;<i class="bi bi-arrow-right text-muted fs-6"></i>&nbsp; ${toStation ? toStation.name : '알 수 없음'}</h5>
                    <div class="d-flex justify-content-between text-muted small mb-4">
                        <span>일반 ${order.general_qty}대 &nbsp; 새싹 ${order.sprout_qty}대</span>
                        <span>${timeString}</span>
                    </div>

                    <div class="d-flex flex-column flex-sm-row gap-2 gap-sm-3 mt-2">
                        <button class="btn btn-indigo w-100 fw-bold py-3 rounded-3" ${order.status === '완료' ? 'disabled' : ''}>
                            <i class="bi bi-qr-code-scan me-2"></i>QR 스캔 (0)
                        </button>
                        <button class="btn btn-soft-red w-100 fw-bold py-3 rounded-3" data-bs-toggle="modal" data-bs-target="#reportModal" ${order.status === '완료' ? 'disabled' : ''}>
                            <i class="bi bi-tools me-2"></i>고장 신고
                        </button>
                    </div>
                </div>
            </div>`;
        });
    }
    listView.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", function() {
    // 🟢 테스트 환경을 위해 로컬 스토리지에 관계없이 강제로 기사 계정(901)으로 덮어쓰기
    var accountInfo = (window.DB && window.DB.account)
        ? window.DB.account.find(acc => acc.id === 901)
        : { id: 901, role: 'driver', name: '김마포', district_name: '마포구' };

    if (typeof renderHeader === "function") {
        renderHeader('tasks', {
            role: 'driver',
            district_name: accountInfo.district_name,
            name: accountInfo.name,
            id: accountInfo.id
        });
    }

    // 지시서 렌더링 호출
    renderDispatchOrders(accountInfo.id);
});

// 탭 전환(목록 <-> 지도) 로직
function switchTab(tabName) {
    const listTab = document.getElementById('tab-list');
    const mapTab = document.getElementById('tab-map');
    const listView = document.getElementById('listView');
    const mapView = document.getElementById('mapView');

    if (tabName === 'list') {
        listTab.classList.add('active');
        mapTab.classList.remove('active');
        listView.classList.remove('d-none');
        mapView.classList.add('d-none');
    } else {
        mapTab.classList.add('active');
        listTab.classList.remove('active');
        mapView.classList.remove('d-none');
        listView.classList.add('d-none');
    }
}