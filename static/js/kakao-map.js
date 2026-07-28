// kakao-map.js — 카카오맵 JS SDK를 백엔드에서 키를 받아와 동적으로 로드한다.
// api.js보다 뒤, 각 페이지의 지도 렌더링 스크립트보다 먼저 로드해야 한다.
(function () {
  var loadingPromise = null;

  window.loadKakaoMaps = function () {
    if (loadingPromise) return loadingPromise;

    if (window.kakao && window.kakao.maps && window.kakao.maps.LatLng) {
      loadingPromise = Promise.resolve(window.kakao);
      return loadingPromise;
    }

    loadingPromise = api.get('/config/kakao-js-key').then(function (res) {
      return new Promise(function (resolve, reject) {
        if (!res.key) { reject(new Error('카카오맵 API 키가 설정되지 않았습니다.')); return; }

        var settled = false;
        // dapi.kakao.com 요청이 네트워크 차단(방화벽/광고차단기)이나 미등록 도메인 등으로
        // onload/onerror 둘 다 안 걸리고 그냥 멈출 수 있어, 무한 대기를 막는 타임아웃.
        var timeoutId = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error('카카오맵 SDK 로드가 시간 초과됐습니다 (10초). 네트워크 또는 카카오 개발자 콘솔의 도메인 등록 상태를 확인하세요.'));
        }, 10000);

        var script = document.createElement('script');
        script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + res.key + '&autoload=false&libraries=services';
        script.onload = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          window.kakao.maps.load(function () { resolve(window.kakao); });
        };
        script.onerror = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reject(new Error('카카오맵 SDK 로드에 실패했습니다. (네트워크 또는 appkey 도메인 등록 문제일 수 있음)'));
        };
        document.head.appendChild(script);
      });
    }).catch(function (err) {
      loadingPromise = null; // 실패를 캐시하지 않음 - 재시도(페이지 새로고침 등) 시 다시 시도되도록
      throw err;
    });
    return loadingPromise;
  };
})();
