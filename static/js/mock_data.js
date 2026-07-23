// mock_data.js
(function () {
  'use strict';

  var district = [
    { id: 1, name: '마포구' },
    { id: 2, name: '강서구' },
    { id: 3, name: '송파구' },
    { id: 4, name: '영등포구' }
  ];

  var districtMapPos = {
    1: { x: 220, y: 230 }, 2: { x: 150, y: 180 },
    3: { x: 640, y: 320 }, 4: { x: 260, y: 340 }
  };

  var account = [
    { id: 501, login_id: 'EMP-2024-0001', password: '1234', name: '김관제', role: 'seoul_admin', district_id: null, phone: '02-120-1234', email: 'control@seoul.go.kr', created_at: '2021-03-15T09:00:00' },
    { id: 901, login_id: 'DRV-2024-0001', password: '1234', name: '김마포', role: 'driver', district_id: 1, phone: '010-9876-5432', email: 'driver_mapo@seoul.go.kr', created_at: '2026-07-05T09:00:00' },
    { id: 902, login_id: 'DRV-2024-0002', password: '1234', name: '이강서', role: 'driver', district_id: 2, phone: '010-2345-6677', email: 'driver_gangseo@seoul.go.kr', created_at: '2025-11-10T09:00:00' },
    { id: 903, login_id: 'DRV-2024-0003', password: '1234', name: '박송파', role: 'driver', district_id: 3, phone: '010-5566-7788', email: 'driver_songpa@seoul.go.kr', created_at: '2025-09-01T09:00:00' },
    { id: 904, login_id: 'DRV-2024-0004', password: '1234', name: '정영등포', role: 'driver', district_id: 4, phone: '010-7788-9900', email: 'driver_ydp@seoul.go.kr', created_at: '2025-12-12T09:00:00' },
    { id: 1, login_id: 'user1234', password: '1234', name: '홍길동', role: 'user', district_id: null, phone: '010-1111-2222', email: 'hong@example.com', created_at: '2026-07-21T10:00:00' },
    { id: 2, login_id: 'user5678', password: '1234', name: '김민지', role: 'user', district_id: null, phone: '010-3333-4444', email: 'minji@example.com', created_at: '2026-06-02T14:20:00' }
  ];

  account.forEach(function (a) {
    var d = district.filter(function (x) { return x.id === a.district_id; })[0];
    a.district_name = d ? d.name : null;
  });

  var districtDongMap = {
    1: ['상암동', '성산1동', '성산2동', '연남동', '서교동', '망원1동', '망원2동', '합정동', '서강동', '신수동', '대흥동', '염리동', '아현동', '공덕동', '용강동', '도화동'],
    2: ['방화1동', '방화2동', '방화3동', '공항동', '가양1동', '가양2동', '가양3동', '등촌1동', '등촌2동', '등촌3동', '염창동', '발산동', '우장산동', '화곡본동', '화곡1동', '화곡2동', '화곡3동', '화곡4동', '화곡6동', '화곡8동'],
    3: ['풍납1동', '풍납2동', '잠실본동', '잠실2동', '잠실3동', '잠실4동', '잠실6동', '잠실7동', '삼전동', '석촌동', '송파1동', '송파2동', '방이1동', '방이2동', '오륜동', '오금동', '가락본동', '가락1동', '가락2동', '문정1동', '문정2동', '장지동', '위례동', '마천1동', '마천2동', '거여1동', '거여2동'],
    4: ['양평1동', '양평2동', '당산1동', '당산2동', '문래1동', '문래2동', '영등포1동', '영등포2동', '영등포3동', '여의도동', '도림1동', '도림2동', '신길1동', '신길2동', '신길3동', '신길4동', '신길5동', '신길6동', '신길7동', '대림1동', '대림2동', '대림3동']
  };

  function classifyStockLevel(total, capacity) {
    var pct = total / capacity;
    if (pct >= 0.9) return '과포화';
    if (total <= 1) return '고갈심각';
    if (total <= 3) return '부족경고';
    return '적정';
  }

  var station = [];
  var stationIdCounter = 1;

  Object.keys(districtDongMap).forEach(function (dId) {
    var dIdNum = parseInt(dId, 10);
    var basePos = districtMapPos[dIdNum] || { x: 300, y: 300 };
    var localIdx = 0; // 전체 스테이션 지도 표시 시 자치구 내에서 서로 겹치지 않도록 격자 배치용 인덱스

    districtDongMap[dId].forEach(function (dongName) {
      for (var i = 1; i <= 5; i++) {
        var cap = 25;

        var rem = stationIdCounter % 4;
        var generalCnt, sproutCnt;
        if (rem === 0) { generalCnt = 0; sproutCnt = 1; }
        else if (rem === 1) { generalCnt = 2; sproutCnt = 1; }
        else if (rem === 2) { generalCnt = 23; sproutCnt = 2; }
        else { generalCnt = 12; sproutCnt = 3; }

        var col = localIdx % 10;
        var row = Math.floor(localIdx / 10);

        station.push({
          id: stationIdCounter,
          name: dongName + ' ' + i + '호점',
          district_id: dIdNum,
          neighborhood_name: dongName,
          latitude: 37.5000 + (dIdNum * 0.02) + (i * 0.002),
          longitude: 126.8000 + (dIdNum * 0.03) + (i * 0.002),
          capacity: cap,
          general_bike_count: generalCnt,
          sprout_bike_count: sproutCnt,
          broken_bike_count: 0,
          map_x: basePos.x - 70 + col * 16,
          map_y: basePos.y - 60 + row * 16,
          stock_level: classifyStockLevel(generalCnt + sproutCnt, cap)
        });

        stationIdCounter++;
        localIdx++;
      }
    });
  });

  var bike = [
    { id: 1, bike_type: '일반', current_station_id: 1, status: 'available' },
    { id: 2, bike_type: '새싹', current_station_id: 1, status: 'available' },
    { id: 3, bike_type: '일반', current_station_id: 2, status: 'repair_waiting' },
    { id: 4, bike_type: '일반', current_station_id: 5, status: 'available' },
    { id: 5, bike_type: '새싹', current_station_id: 10, status: 'available' }
  ];

  var rental = [
    { id: 1, user_id: 1, bike_id: 1, rent_station_id: 1, return_station_id: 2, status: '완료', rent_time: '2026-07-18T14:32:00', return_time: '2026-07-18T15:07:00', distance_km: 4.2, duration_min: 35, carbon_reduction: 0.9 },
    { id: 2, user_id: 2, bike_id: 3, rent_station_id: 3, return_station_id: null, status: '대여중', rent_time: '2026-07-22T13:40:00', return_time: null, distance_km: null, duration_min: null, carbon_reduction: null }
  ];

  var bike_report = [
    { id: 1, bike_id: 3, station_id: 2, reported_by: 901, issue: '브레이크 소음', status: '수리대기', reported_at: '2026-07-21T17:40:00' }
  ];

  var environment_log = [
    { id: 1, district_id: 1, temperature: 23.0, pm10: 18, precipitation: 0, recorded_at: '2026-07-22T14:35:00' },
    { id: 2, district_id: 2, temperature: 24.1, pm10: 22, precipitation: 0, recorded_at: '2026-07-22T14:35:00' },
    { id: 3, district_id: 3, temperature: 23.6, pm10: 19, precipitation: 0, recorded_at: '2026-07-22T14:35:00' },
    { id: 4, district_id: 4, temperature: 22.8, pm10: 20, precipitation: 0, recorded_at: '2026-07-22T14:35:00' },
    { id: 5, district_id: 1, temperature: 23.5, pm10: 15, precipitation: 1, recorded_at: '2026-07-23T14:35:00' },
    { id: 6, district_id: 2, temperature: 24.5, pm10: 25, precipitation: 0, recorded_at: '2026-07-23T14:35:00' },
    { id: 7, district_id: 3, temperature: 23.5, pm10: 15, precipitation: 1, recorded_at: '2026-07-23T14:35:00' },
    { id: 8, district_id: 4, temperature: 22.5, pm10: 25, precipitation: 0, recorded_at: '2026-07-23T14:35:00' }
  ];

  // 다수의 지시서(대기, 진행중, 완료) 데이터를 기사(901)에게 할당
  var dispatch_order = [
    { id: 1, from_station_id: 1, to_station_id: 3, general_qty: 5, sprout_qty: 1, driver_id: 901, ordered_by: 501, ordered_at: '2026-07-23T08:15:00', pickup_completed_at: null, dropoff_completed_at: null, status: '대기' },
    { id: 2, from_station_id: 4, to_station_id: 2, general_qty: 8, sprout_qty: 2, driver_id: 901, ordered_by: 501, ordered_at: '2026-07-23T09:30:00', pickup_completed_at: '2026-07-23T09:45:00', dropoff_completed_at: null, status: '진행중' },
    { id: 3, from_station_id: 5, to_station_id: 7, general_qty: 2, sprout_qty: 1, driver_id: 901, ordered_by: 501, ordered_at: '2026-07-23T10:00:00', pickup_completed_at: '2026-07-23T10:20:00', dropoff_completed_at: '2026-07-23T10:40:00', status: '완료' },
    { id: 4, from_station_id: 12, to_station_id: 8, general_qty: 10, sprout_qty: 0, driver_id: 901, ordered_by: 501, ordered_at: '2026-07-23T11:15:00', pickup_completed_at: null, dropoff_completed_at: null, status: '대기' }
  ];

  var demand_prediction = [
    { id: 1, station_id: 1, predicted_at: '2026-07-22T18:00:00', predicted_general_rent_demand: 12, predicted_sprout_rent_demand: 3, predicted_general_return_demand: 2, predicted_sprout_return_demand: 0, predicted_general_shortage: -9, predicted_sprout_shortage: -2, model_created_at: '2026-07-22T13:00:00' }
  ];

  var favorite_station = [
    { id: 1, user_id: 1, station_id: 1 },
    { id: 2, user_id: 1, station_id: 10 }
  ];

  district.forEach(function (d) {
    d.total_bikes = station
      .filter(function (s) { return s.district_id === d.id; })
      .reduce(function (sum, s) { return sum + s.general_bike_count + s.sprout_bike_count; }, 0);
  });

  var todayRentals = {
    seoul: 18420,
    byDistrict: { 1: 4820, 2: 4500, 3: 5100, 4: 4000 }
  };

  window.DB = {
    district: district,
    account: account,
    station: station,
    bike: bike,
    rental: rental,
    bike_report: bike_report,
    environment_log: environment_log,
    dispatch_order: dispatch_order,
    demand_prediction: demand_prediction,
    favorite_station: favorite_station,
    districtMapPos: districtMapPos,
    districtDongMap: districtDongMap,
    todayRentals: todayRentals
  };
})();