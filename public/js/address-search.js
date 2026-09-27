'use strict';
/* ════════════════════════════════════════════════════════════════════
   [2026-09-27] 성도 주소 입력칸에 "주소 검색"(카카오·다음 우편번호 서비스, 무료·키 불필요) 버튼을 붙인다.
   검색해서 고르면 "경기 의왕시 안골로 10 (고천동, 고천파크루체) " 처럼 시·군까지 들어간 표준 주소가
   채워지고, 뒤에 동·호수만 이어서 입력하면 된다. 이렇게 입력된 주소는 성도 분포 지도에서
   건물 단위로 정확히 찾힌다(시·군 없는 주소는 기본 지역으로 추정할 수밖에 없음).
   대상: name="address"인 입력칸 (성도 등록/수정 모달). 직접 타이핑하는 기존 방식도 그대로 된다.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  const SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  let loading = null;

  function loadPostcode() {
    if (window.daum && window.daum.Postcode) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_URL;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('주소 검색을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function composeAddress(data) {
    const base = data.userSelectedType === 'J' ? (data.jibunAddress || data.autoJibunAddress) : (data.roadAddress || data.autoRoadAddress);
    const extra = [];
    if (data.userSelectedType !== 'J') {
      if (data.bname && /[동로가]$/.test(data.bname)) extra.push(data.bname);
      if (data.buildingName) extra.push(data.buildingName);
    }
    return base + (extra.length ? ` (${extra.join(', ')})` : '');
  }

  function openSearch(input) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
      <div style="background:#fff;width:100%;max-width:460px;border-radius:14px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3);display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0f172a;color:#fff;">
          <span style="font-weight:800;font-size:13px;">주소 검색 <span style="font-weight:500;opacity:.7;font-size:11px;">— 도로명·아파트 이름·동으로 검색</span></span>
          <button type="button" data-close style="background:none;border:0;color:#cbd5e1;font-size:18px;cursor:pointer;line-height:1;">&times;</button>
        </div>
        <div data-wrap style="height:470px;max-height:70vh;"></div>
      </div>`;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', e => { if (e.target === overlay || e.target.hasAttribute('data-close')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    const wrap = overlay.querySelector('[data-wrap]');
    wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;font-size:13px;">불러오는 중...</div>';
    loadPostcode().then(() => {
      wrap.innerHTML = '';
      new window.daum.Postcode({
        width: '100%', height: '100%',
        oncomplete: data => {
          const v = composeAddress(data);
          input.value = v + ' ';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          close();
          input.focus();
          try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { }
          const hint = input.parentElement && input.parentElement.parentElement && input.parentElement.parentElement.querySelector('[data-addr-hint]');
          if (hint) { hint.textContent = '뒤에 동·호수를 이어서 입력하세요 (예: 103동 902호)'; hint.style.display = 'block'; }
        }
      }).embed(wrap);
    }).catch(err => {
      wrap.innerHTML = `<div style="padding:24px;text-align:center;color:#b91c1c;font-size:13px;">${err.message}</div>`;
    });
  }

  function enhance(input) {
    if (input.dataset.addrSearch) return;
    input.dataset.addrSearch = '1';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:stretch;';
    input.parentNode.insertBefore(row, input);
    row.appendChild(input);
    input.style.flex = '1';
    input.style.minWidth = '0';
    input.placeholder = input.placeholder || '주소 검색을 누르거나 직접 입력';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 주소 검색';
    btn.className = 'text-xs font-bold px-3 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30 whitespace-nowrap';
    btn.addEventListener('click', () => openSearch(input));
    row.appendChild(btn);
    const hint = document.createElement('div');
    hint.setAttribute('data-addr-hint', '');
    hint.style.cssText = 'display:none;margin-top:4px;font-size:11px;color:#2563eb;';
    row.parentNode.insertBefore(hint, row.nextSibling);
    input.addEventListener('blur', () => { hint.style.display = 'none'; });
  }

  function init() {
    document.querySelectorAll('input[name="address"]').forEach(enhance);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
