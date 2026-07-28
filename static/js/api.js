// api.js — 모든 페이지의 백엔드 호출 창구. header.js보다 먼저 로드해야 한다.
(function () {
  'use strict';

  function getToken() {
    return localStorage.getItem('accessToken');
  }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(path, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('currentUser');
      let detail = '인증에 실패했습니다.';
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch (e) { /* 본문이 JSON이 아닌 경우 기본 메시지 유지 */ }
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
        window.location.href = 'index.html';
      }
      throw new Error(detail);
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data.detail || detail;
      } catch (e) { /* 본문이 JSON이 아닌 경우 statusText 유지 */ }
      throw new Error(detail);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  window.api = {
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body); },
    patch: function (path, body) { return request('PATCH', path, body); },
    delete: function (path) { return request('DELETE', path); }
  };

  // innerHTML에 삽입하기 전 사용자 입력 문자열을 이스케이프한다 (XSS 방지).
  window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
})();
