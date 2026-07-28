// admin-analytics.js

var ROLE_LABEL = { admin: '관리자' };

function getCurrentUser() {
    var raw = localStorage.getItem('currentUser');
    var fallback = { id: 501, role: 'admin', name: '김관제', district_id: null };
    if (raw) {
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.role === 'admin') return parsed;
        } catch (e) { }
    }
    return fallback;
}

function fmtNum(n) { return Number(n).toLocaleString('ko-KR'); }

var CHART_COLORS = {
    green: '#00965e', red: '#ef4545', orange: '#fb933d', dark: '#1f2937', gray: '#adb5bd', blue: '#3b82f6'
};

var filterState = { districtId: null };
var allStations = [];
var districts = [];

function getDistrict(id) { return districts.find(function (d) { return d.id === id; }); }

function getScopedStations() {
    if (!filterState.districtId) return allStations;
    return allStations.filter(function (s) { return s.district_id === filterState.districtId; });
}

// district_id 필터가 걸려있으면 쿼리스트링에 붙여서 서버 쪽에서 이미 필터링된 결과를 받는다.
function withDistrict(path) {
    if (!filterState.districtId) return path;
    return path + (path.indexOf('?') === -1 ? '?' : '&') + 'district_id=' + filterState.districtId;
}

function destroyChart(id) {
    var el = document.getElementById(id);
    if (!el || !window.Chart) return;
    var existing = Chart.getChart(el);
    if (existing) existing.destroy();
}

// 데이터가 없을 때 캔버스 자리에 안내 문구를 보여주고, 데이터가 생기면 캔버스를 되살린다.
function renderChartOrEmpty(canvasId, hasData, buildFn) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var container = canvas.parentElement;
    if (!hasData) {
        destroyChart(canvasId);
        container.innerHTML = '<div class="d-flex align-items-center justify-content-center h-100 text-muted small">표시할 데이터가 없습니다.</div>';
        return;
    }
    if (!document.getElementById(canvasId)) {
        container.innerHTML = '<canvas id="' + canvasId + '"></canvas>';
        canvas = document.getElementById(canvasId);
    } else {
        destroyChart(canvasId);
    }
    buildFn(canvas);
}

async function safeGet(path, fallback) {
    try {
        return await api.get(path);
    } catch (e) {
        console.error('[데이터 분석] ' + path + ' 호출 실패:', e);
        return fallback;
    }
}

// 1. 흐름 시각화 (전체 자치구: 가로 막대 Top 10 / 특정 자치구: Sankey)
async function renderFlowChart() {
    var subtitleEl = document.getElementById('flowChartSubtitle');
    var edges = await safeGet(withDistrict('/analytics/flow?limit=30'), []);

    if (!filterState.districtId) {
        if (subtitleEl) subtitleEl.textContent = '서울시 전체 대여량이 가장 많은 주요 이동 경로 (Top 10, 완료된 실제 대여 기준)';
        var globalData = edges.slice().sort(function (a, b) { return b.flow - a.flow; }).slice(0, 10);
        var fromLabels = globalData.map(function (d) { return d.from_station_name || d.from_station_id; });
        var toLabels = globalData.map(function (d) { return d.to_station_name || d.to_station_id; });
        var values = globalData.map(function (d) { return d.flow; });

        renderChartOrEmpty('flowChart', values.length > 0, function (el) {
            new Chart(el, {
                type: 'bar',
                data: {
                    labels: fromLabels,
                    datasets: [{
                        label: '이동 건수',
                        data: values,
                        backgroundColor: CHART_COLORS.green,
                        borderRadius: 8,
                        barPercentage: 0.75,
                        categoryPercentage: 0.9
                    }]
                },
                plugins: [{
                    id: 'centerTextPlugin',
                    afterDatasetsDraw: function (chart) {
                        var ctx = chart.ctx;
                        chart.getDatasetMeta(0).data.forEach(function (datapoint, index) {
                            var value = chart.data.datasets[0].data[index];
                            ctx.save();
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = 'bold 13px Pretendard, sans-serif';
                            ctx.fillStyle = '#ffffff';
                            var startX = chart.scales.x.left;
                            var endX = datapoint.x;
                            var centerX = startX + (endX - startX) / 2;
                            ctx.fillText(value + '건', centerX, datapoint.y);
                            ctx.restore();
                        });
                    }
                }],
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { right: 10 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: function (ctx) { return ctx.parsed.x + '건'; } } }
                    },
                    scales: {
                        x: { display: false, grid: { display: false } },
                        y: { position: 'left', grid: { display: false }, ticks: { font: { size: 12, weight: 'bold' }, color: '#333' }, border: { display: false } },
                        y2: {
                            position: 'right',
                            type: 'category',
                            grid: { display: false },
                            ticks: {
                                font: { size: 12, weight: 'bold' },
                                color: '#333',
                                callback: function (value, index) { return toLabels[index]; }
                            },
                            border: { display: false }
                        }
                    }
                }
            });
        });
    } else {
        var districtName = getDistrict(filterState.districtId)?.name || '';
        if (subtitleEl) subtitleEl.textContent = districtName + ' 내 주요 거점 간 이동 경로 (선의 굵기가 이동량을 나타냅니다, 완료된 실제 대여 기준)';

        var sankeyData = edges.map(function (item) {
            return { from: item.from_station_name || item.from_station_id, to: item.to_station_name || item.to_station_id, flow: item.flow };
        });

        renderChartOrEmpty('flowChart', sankeyData.length > 0, function (el) {
            var palette = ['#fb933d', '#00965e', '#3b82f6', '#ef4545', '#1f2937', '#8b5cf6', '#eab308', '#0ea5e9'];
            var colorMap = {};
            var colorIndex = 0;

            sankeyData.forEach(function (d) {
                if (!colorMap[d.from]) colorMap[d.from] = palette[colorIndex++ % palette.length];
                if (!colorMap[d.to]) colorMap[d.to] = palette[colorIndex++ % palette.length];
            });

            new Chart(el, {
                type: 'sankey',
                data: {
                    datasets: [{
                        label: '자전거 이동 흐름',
                        data: sankeyData,
                        colorFrom: function (c) { return colorMap[c.raw?.from] || '#ccc'; },
                        colorTo: function (c) { return colorMap[c.raw?.to] || '#ccc'; },
                        colorMode: 'gradient',
                        borderWidth: 0,
                        nodePadding: 20
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        });
    }
}

// 2. 콤보 차트: 실제 대여량(막대) vs 유동인구 기반 예측 수요(점선)
async function renderComboChart() {
    var results = await Promise.all([
        safeGet(withDistrict('/analytics/hourly-demand'), []),
        safeGet(withDistrict('/analytics/foot-traffic-demand'), [])
    ]);
    var actualByHour = results[0], predByHour = results[1];
    var hasData = actualByHour.length > 0;

    renderChartOrEmpty('comboChart', hasData, function (el) {
        var actualDemand = actualByHour.map(function (d) { return d.value; });
        var predDemand = predByHour.map(function (d) { return d.value; });
        var labels = actualByHour.map(function (d) { return (d.hour < 10 ? '0' : '') + d.hour + '시'; });

        new Chart(el, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line', label: '예측 수요 (유동인구 기반)', data: predDemand,
                        borderColor: CHART_COLORS.red, backgroundColor: CHART_COLORS.red,
                        borderWidth: 2, borderDash: [5, 5], tension: 0.3, pointRadius: 0
                    },
                    {
                        type: 'bar', label: '실제 대여량', data: actualDemand,
                        backgroundColor: CHART_COLORS.green, borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' } } }
            }
        });
    });
}

// 3. 예측 모델 주요 변수 중요도 (target별 그룹 기여도, district 필터 없음 - 모델 자체 속성)
async function renderLagImportanceChart() {
    var groups = await safeGet('/analytics/feature-importance?target=general_rent_cnt', []);
    renderChartOrEmpty('lagImportanceChart', groups.length > 0, function (el) {
        var labels = groups.map(function (d) { return d.label; });
        var values = groups.map(function (d) { return d.value; });
        var maxVal = Math.max(50, Math.ceil(Math.max.apply(null, values) / 10) * 10);

        new Chart(el, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '모델 기여도 (%)',
                    data: values,
                    backgroundColor: CHART_COLORS.orange,
                    borderRadius: 4,
                    barPercentage: 0.6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (ctx) { return ctx.parsed.x + '%'; } } }
                },
                scales: {
                    x: { grid: { color: '#f0f0f0' }, max: maxVal, title: { display: true, text: '기여도 (%)' } },
                    y: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } }
                }
            }
        });
    });
}

// 4. 전일 실제 vs AI 예측량 비교 (야간 배치가 채워둔 demand_prediction_forecast)
async function renderActualVsPredChart() {
    var districtName = filterState.districtId ? (getDistrict(filterState.districtId)?.name || '서울시 전체') : '서울시 전체';
    var titleEl = document.getElementById('actualVsPredTitle');

    var monitoring = await safeGet(withDistrict('/analytics/model-monitoring'), null);
    var hasData = !!(monitoring && (monitoring.actual || []).some(function (d) { return d.value > 0; }));

    if (titleEl) {
        titleEl.textContent = monitoring
            ? districtName + ' ' + monitoring.as_of_label + ' 기준 실제 대여량 vs AI 예측량 비교'
            : districtName + ' 전일 기준 실제 대여량 vs AI 예측량 비교';
    }

    renderChartOrEmpty('actualVsPredChart', hasData, function (el) {
        var actualData = monitoring.actual.map(function (d) { return d.value; });
        var predData = (monitoring.predicted || []).map(function (d) { return d.value; });
        var labels = monitoring.actual.map(function (d) { return (d.hour < 10 ? '0' : '') + d.hour + '시'; });

        new Chart(el, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '실제 대여량', data: actualData,
                        borderColor: CHART_COLORS.green, backgroundColor: 'rgba(0, 150, 94, 0.1)',
                        borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3
                    },
                    {
                        label: 'AI 예측량', data: predData,
                        borderColor: CHART_COLORS.red, backgroundColor: 'transparent',
                        borderWidth: 2, borderDash: [5, 5], pointRadius: 3, tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: { x: { grid: { display: false } }, y: { grid: { color: '#f0f0f0' } } }
            }
        });
    });
}

// 5. 대여소 공간 과부족 히트맵 (실제 재고 - 정원의 절반 기준 과부족)
function renderHeatmapChart() {
    var stations = getScopedStations().filter(function (s) { return s.lat && s.lon; });
    var points = stations.map(function (s) {
        var diff = s.total_bikes - Math.round(s.capacity * 0.5);
        var isShortage = diff < 0;
        return {
            x: s.lon, y: s.lat, r: Math.min(30, Math.abs(diff) * 1.5 + 4),
            name: s.name, diff: diff,
            backgroundColor: isShortage ? 'rgba(239, 69, 69, 0.6)' : 'rgba(31, 41, 55, 0.6)'
        };
    });

    renderChartOrEmpty('heatmapChart', points.length > 0, function (el) {
        new Chart(el, {
            type: 'bubble',
            data: { datasets: [{ label: '대여소 과부족', data: points, backgroundColor: points.map(function (p) { return p.backgroundColor; }), borderColor: 'white', borderWidth: 1 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: 20 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                var p = ctx.raw;
                                var status = p.diff < 0 ? '부족' : '과잉';
                                return p.name + ' (' + Math.abs(p.diff) + '대 ' + status + ')';
                            }
                        }
                    }
                },
                scales: { x: { display: false }, y: { display: false } }
            }
        });
    });
}

// 6. 대여량 vs 자전거 날씨 지수 (다중 축)
async function renderMultiAxisChart() {
    var results = await Promise.all([
        safeGet(withDistrict('/analytics/hourly-demand'), []),
        safeGet(withDistrict('/analytics/weather-index'), [])
    ]);
    var actualByHour = results[0], weatherByHour = results[1];
    var hasData = actualByHour.length > 0;

    renderChartOrEmpty('multiAxisChart', hasData, function (el) {
        var actualDemand = actualByHour.map(function (d) { return d.value; });
        var weatherIndex = weatherByHour.map(function (d) { return d.value; });
        var labels = actualByHour.map(function (d) { return (d.hour < 10 ? '0' : '') + d.hour + '시'; });

        new Chart(el, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar', label: '대여량', data: actualDemand,
                        backgroundColor: CHART_COLORS.orange, borderRadius: 4, yAxisID: 'y'
                    },
                    {
                        type: 'line', label: '자전거 날씨 지수 (0~100)', data: weatherIndex,
                        borderColor: CHART_COLORS.dark, backgroundColor: CHART_COLORS.dark,
                        borderWidth: 2, tension: 0.4, pointRadius: 2, yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } },
                scales: {
                    x: { grid: { display: false } },
                    y: { type: 'linear', display: true, position: 'left', grid: { color: '#f0f0f0' }, title: { display: true, text: '대여량' } },
                    y1: { type: 'linear', display: true, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '날씨 지수' } }
                }
            }
        });
    });
}

// 상단 통계 카드 (실제 오늘자 요약)
async function renderStatCards() {
    var summary = await safeGet(withDistrict('/analytics/today-summary'), null);
    document.getElementById('statTodayRentals').textContent = summary ? fmtNum(summary.today_rentals) : '-';
    document.getElementById('statUrgentCount').textContent = summary ? summary.urgent_dispatch_count : '-';
    document.getElementById('statFullCount').textContent = summary ? summary.full_station_count : '-';
}

// 만성 불균형 대여소 리스트 (실제 stock_level 기준)
function renderChronicList() {
    var dangerContainer = document.getElementById('dangerList');
    var fullContainer = document.getElementById('fullList');
    if (!dangerContainer || !fullContainer) return;

    dangerContainer.innerHTML = '';
    fullContainer.innerHTML = '';

    var stations = getScopedStations();

    var dangerStations = stations.filter(function (s) { return s.stock_level === '고갈'; })
        .sort(function (a, b) { return (a.total_bikes / a.capacity) - (b.total_bikes / b.capacity); })
        .slice(0, 10);

    var fullStations = stations.filter(function (s) { return s.stock_level === '과포화'; })
        .sort(function (a, b) { return (b.total_bikes / b.capacity) - (a.total_bikes / a.capacity); })
        .slice(0, 10);

    function createItemHtml(st, idx, isDanger) {
        var percent = st.capacity > 0 ? Math.round((st.total_bikes / st.capacity) * 100) : 0;
        var statLabel = isDanger ? '고갈' : '과포화';
        var statClass = isDanger ? 'stat-danger' : 'stat-warning';

        var div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML =
            '<div class="item-number">' + (idx + 1) + '</div>' +
            '<div class="flex-grow-1">' +
                '<div class="item-name">' + st.name + '</div>' +
                '<div class="item-district">' + (st.district_name || '') + (st.neighborhood_name ? ' · ' + st.neighborhood_name : '') + '</div>' +
            '</div>' +
            '<div class="item-stats d-none d-sm-flex">' +
                '<div class="' + statClass + '">' + st.total_bikes + '/' + st.capacity + '대 <span class="stat-sub">' + statLabel + ' (' + percent + '%)</span></div>' +
            '</div>';
        return div;
    }

    if (dangerStations.length === 0) {
        dangerContainer.innerHTML = '<div class="p-4 text-center text-muted small">현재 고갈 상태인 대여소가 없습니다.</div>';
    } else {
        dangerStations.forEach(function (st, idx) { dangerContainer.appendChild(createItemHtml(st, idx, true)); });
    }

    if (fullStations.length === 0) {
        fullContainer.innerHTML = '<div class="p-4 text-center text-muted small">현재 과포화 상태인 대여소가 없습니다.</div>';
    } else {
        fullStations.forEach(function (st, idx) { fullContainer.appendChild(createItemHtml(st, idx, false)); });
    }
}

function renderPageSubtitle() {
    var district = filterState.districtId ? getDistrict(filterState.districtId) : null;
    var label = district ? district.name : '서울시 전체';
    document.getElementById('pageSubtitleDistrict').textContent = label + ' 운영 현황 분석';
    document.title = '서울자전거 따릉이 - 데이터 분석(' + label + ')';
}

function renderDistrictDropdown() {
    var list = document.getElementById('districtDropdownList');
    if (!list) return;
    var options = [{ id: null, name: '전체 자치구' }].concat(districts);

    list.innerHTML = '';
    options.forEach(function (opt) {
        var isSelected = filterState.districtId === opt.id;
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#';
        a.className = 'dropdown-item' + (isSelected ? ' selected-item' : '');
        a.textContent = opt.name;
        a.addEventListener('click', function (e) {
            e.preventDefault();
            filterState.districtId = opt.id;
            renderAll();
        });
        li.appendChild(a);
        list.appendChild(li);
    });

    var labelEl = document.getElementById('selectedDistrictLabel');
    if (labelEl) labelEl.textContent = filterState.districtId ? (getDistrict(filterState.districtId)?.name || '전체 자치구') : '전체 자치구';
}

async function renderAll() {
    renderDistrictDropdown();
    renderPageSubtitle();
    renderChronicList();
    renderHeatmapChart();

    // 서로 독립적인 호출이라 병렬로 진행 (district 필터 변경 시마다 반복 호출됨)
    await Promise.all([
        renderStatCards(),
        renderFlowChart(),
        renderComboChart(),
        renderMultiAxisChart(),
        renderLagImportanceChart(),
        renderActualVsPredChart()
    ]);
}

document.addEventListener('DOMContentLoaded', async function () {
    var authRaw = localStorage.getItem('currentUser');
    var authUser = authRaw ? JSON.parse(authRaw) : null;
    if (!authUser || authUser.role !== 'admin' || !localStorage.getItem('accessToken')) {
        document.body.innerHTML = '<div class="guest-empty-state"><p>로그인이 필요한 페이지예요.</p><a href="index.html">로그인하러 가기</a></div>';
        return;
    }

    var user = getCurrentUser();
    if (window.renderHeader) {
        window.renderHeader('analytics', user);
    }

    try {
        var results = await Promise.all([api.get('/station/stations'), api.get('/station/districts')]);
        allStations = results[0];
        districts = results[1];
    } catch (e) {
        console.error('[데이터 분석] 대여소/자치구 목록 로드 실패:', e);
        allStations = [];
        districts = [];
    }

    renderAll();
});
