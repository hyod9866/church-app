'use strict';
/* ════════════════════════════════════════════════════════════════════
   [2026-09-27] 성도 분포 지도
   전도사님이 주신 "성도분포도_만들기_v1.0.html"의 지도·필터·명단 기능을 프로그램 안으로 옮긴 것.
   달라진 점:
    - 엑셀 업로드 대신 성도 DB(/api/distribution)를 바로 읽는다.
    - 주소 → 좌표 변환은 서버가 카카오로 한 번 하고 DB에 저장한다(키는 서버에만 있음).
      이 화면은 "변환 대기"가 있으면 관리자일 때 자동으로 변환을 돌리고 진행률을 보여준다.
    - 직분은 우리 프로그램 기준 5단계: 구역임원 / 교구임원 / 집사 / 기타 직분 / 직분 없음.
    - "직분자" 숫자는 모든 곳에서 같은 기준(직분 없음이 아닌 사람)으로 센다.
    - HTML로 저장·좌표 엑셀 받기는 뺐다(이름·주소가 밖으로 나가지 않도록).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  const C = { navy: '#1D4E73', ocean: '#0B2E4A', sky: '#3FA9DC', mid: '#24688C', teal: '#2A9D8F', faint: '#D8DEE4', white: '#FFFFFF' };
  /* 구역 색 24개 (원본 도구와 동일) */
  const PAL = ['#0E4B78', '#167FCA', '#77B7F1', '#4B320A', '#8B5F12', '#CA933E',
    '#1A674C', '#20A479', '#58E1AD', '#7A1759', '#CF2098', '#F388C7',
    '#6E24BA', '#A263F8', '#CCB8F5', '#691114', '#C11B26', '#F0726C',
    '#10484E', '#18808A', '#4ABAC6', '#4A5715', '#798E1B', '#AEC84C'];
  const AGE = [['어린이/청소년', C.sky], ['청년', C.mid], ['장년', C.ocean]];
  const AGEC = Object.fromEntries(AGE);
  const RANKN = ['구역임원', '교구임원', '집사', '기타 직분', '직분 없음'];
  const RANKC = [C.navy, C.teal, C.sky, C.faint, 'transparent'];
  const RE_ZONE_LEAD = /구역장|조장|구역총무|조총무/;
  const G_ORDER = ['봉사회', '어머니회', '청년회', '은장회', '교회학교', '어린이'];
  const RE_CHILD = /어린이|초등|중등|고등|유치|유아|유년|아동|주일학교|교회학교|청소년/;
  const RE_YOUTH = /청년|대학/;
  const LS_COL = 'dm-zone-colors';
  const FAR_KM = 40;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };
  const $ = id => document.getElementById(id);
  const zoneLabel = z => (/^\d+$/.test(z) ? z + '구역' : z);

  /* ── 우리 DB 값 → 지도 레코드 ─────────────────────────────────── */
  const splitPos = p => String(p || '').split(',').map(s => s.trim()).filter(Boolean);
  function rankFromPositions(list) {
    if (list.some(x => RE_ZONE_LEAD.test(x))) return 0;
    if (list.some(x => x.startsWith('교구'))) return 1;
    if (list.some(x => x.includes('집사'))) return 2;
    return list.length ? 3 : 4;
  }
  const zoneOf = d => {
    const t = String(d || '').trim();
    if (!t || t === '구역정보없음') return '미지정';
    return t.replace(/구역$/, '').trim() || '미지정';
  };
  const ageOf = g => RE_CHILD.test(g) ? '어린이/청소년' : RE_YOUTH.test(g) ? '청년' : '장년';

  function toPerson(m) {
    const pos = splitPos(m.position);
    const rk = rankFromPositions(pos);
    let role = '';
    if (rk === 0) role = pos.find(x => RE_ZONE_LEAD.test(x)) || '';
    else if (rk === 1) role = pos.find(x => x.startsWith('교구')) || '';
    else role = pos[0] || '';
    return {
      id: m.id, n: m.name, s: m.bs === 'S' ? '여' : (m.bs === 'B' ? '남' : ''),
      z: zoneOf(m.district), g: (m.category && m.category !== '모름') ? m.category : '소속 없음',
      pos, rk, role, p: pos.join(', '), a: ageOf(m.category || ''),
      addr: m.address || '', lat: m.lat, lon: m.lon, prec: m.precision,
      dong: m.dong || '', apt: m.apt || '', matched: m.matched || '', region: m.region || ''
    };
  }

  /* ── 상태 ─────────────────────────────────────────────────────── */
  let RAW = null, DATA = null, ALLM = [], ZONES = [], GROUPS = [], BUCKET_OF = {};
  let map, gDim, gAct, gIn, gLab, core = [], CORESET = new Set();
  let mode = 'density', sizeK = 1, markKind = 'name';
  const sel = new Set(), selR = new Set(), selG = new Set();
  let ZC = {};
  let isGuest = true;
  let geocoding = false;

  const zc = z => ZC[z] || C.navy;
  const fc = m => (m.s === '여' ? ' f' : '');
  const mZ = m => sel.size === 0 || sel.has(m.z);
  const mR = m => selR.size === 0 || selR.has(m.rk);
  const mG = m => selG.size === 0 || selG.has(BUCKET_OF[m.g]);
  const inSel = m => mZ(m) && mR(m) && mG(m);
  const hhVis = () => DATA.households.map(h => ({ ...h, ms: h.ms.filter(inSel) })).filter(h => h.ms.length);
  const rank = (ms, key) => {
    const c = {}; ms.forEach(m => c[m[key]] = (c[m[key]] || 0) + 1);
    return Object.entries(c).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  const rad = n => (4.2 + Math.sqrt(n) * 2.9) * sizeK;

  function jitter(key, amt) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
    const r = Math.sqrt(((h >>> 12) % 1000) / 1000) * amt;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /* ── 데이터 구성 ──────────────────────────────────────────────── */
  function build(members) {
    const people = members.map(toPerson);
    const located = people.filter(p => p.lat != null && p.lon != null);
    // 다른 사람들 한가운데서 40km 넘게 떨어진 "추정" 위치는 잘못 잡힌 것으로 보고 뺀다(건물 단위는 유지)
    if (located.length >= 8) {
      const md = xs => { const s = xs.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
      const mlat = md(located.map(p => p.lat)), mlon = md(located.map(p => p.lon));
      const rr = mlat * Math.PI / 180;
      located.forEach(p => {
        if (p.prec === 'exact') return;
        const d = Math.hypot((p.lat - mlat) * 111, (p.lon - mlon) * 111 * Math.cos(rr));
        if (d > FAR_KM) p.drop = `다른 지역(${Math.round(d)}km)으로 잡혀 제외`;
      });
    }
    const hh = {}, unlocated = [];
    people.forEach(p => {
      if (p.lat == null || p.lon == null || p.drop) { unlocated.push(p); return; }
      const h = hh[p.addr] || (hh[p.addr] = { addr: p.addr, lat: p.lat, lon: p.lon, prec: p.prec, dong: p.dong, apt: p.apt, matched: p.matched, region: p.region, ms: [] });
      h.ms.push(p);
    });
    // 같은 좌표(같은 건물)에 여러 세대가 겹치면 살짝 벌린다
    const byPt = {};
    Object.values(hh).forEach(h => { const k = h.lat.toFixed(5) + ',' + h.lon.toFixed(5); (byPt[k] = byPt[k] || []).push(h); });
    Object.values(byPt).forEach(list => {
      if (list.length === 1 && list[0].prec !== 'approx') return;
      const amt = list[0].prec === 'approx' ? 0.0035 : 0.00022;
      list.forEach(h => { const [dy, dx] = jitter(h.addr, amt); h.lat += dy; h.lon += dx; });
    });
    const households = Object.values(hh).sort((a, b) => b.ms.length - a.ms.length);
    ALLM = households.flatMap(h => h.ms).concat(unlocated);
    ZONES = [...new Set(ALLM.map(m => m.z))].sort((a, b) => {
      if (a === '미지정') return 1; if (b === '미지정') return -1;
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return String(a).localeCompare(String(b), 'ko');
    });
    GROUPS = [...new Set(ALLM.map(m => m.g))].sort((a, b) => {
      const ia = G_ORDER.indexOf(a), ib = G_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib; if (ia >= 0) return -1; if (ib >= 0) return 1;
      return String(a).localeCompare(String(b), 'ko');
    });
    BUCKET_OF = {}; GROUPS.forEach((g, i) => BUCKET_OF[g] = i);
    const prec = {};
    households.forEach(h => prec[h.prec] = (prec[h.prec] || 0) + 1);
    DATA = {
      households, unlocated, total: people.length,
      located: households.reduce((s, h) => s + h.ms.length, 0),
      officers: ALLM.filter(m => m.rk <= 3).length, prec,
      noaddr: unlocated.filter(m => m.prec === 'noaddr').length,
      pending: unlocated.filter(m => m.prec === 'pending').length,
      fail: unlocated.filter(m => m.prec === 'fail').length,
      dropped: unlocated.filter(m => m.drop).length,
      guessed: ALLM.filter(m => m.region && m.lat != null && !m.drop).length
    };
  }

  /* ── 지도 그리기 ─────────────────────────────────────────────── */
  function fillOf(ms) {
    if (mode === 'age') return AGEC[rank(ms, 'a')[0][0]] || C.navy;
    if (mode === 'zone') return zc(rank(ms, 'z')[0][0]);
    return sel.size ? zc(rank(ms, 'z')[0][0]) : C.navy;
  }
  const colored = () => mode === 'zone' || (mode === 'density' && sel.size > 0);

  function popup(h) {
    const ms = h.ms.slice().sort((a, b) => (BUCKET_OF[a.g] ?? 99) - (BUCKET_OF[b.g] ?? 99) || a.rk - b.rk);
    const pn = { exact: '', near: '도로·건물명 기준 위치', approx: '동 중심 추정 위치' }[h.prec] || '';
    const guess = h.region ? `시·군이 없어 ${h.region}으로 추정` : '';
    return `<div class="dm-pop-h"><div class="t">${esc(h.dong || '위치')}${h.apt ? ' · ' + esc(h.apt) : ''}</div>`
      + `<div class="s">${esc(h.addr)}${pn ? ' · ' + pn : ''}${guess ? '<br>' + esc(guess) : ''}`
      + `${h.matched ? '<br>찾은 위치: ' + esc(h.matched) : ''}</div></div>`
      + '<div class="dm-pop-b">' + ms.map(m =>
        `<div class="dm-pop-m"><span class="dm-pop-z" style="background:${zc(m.z)}">${esc(m.z)}</span>`
        + `<span><span class="nm${fc(m)}">${esc(m.n)}</span>`
        + `<span class="mt">${esc([m.g, m.a].filter(Boolean).join(' · '))}`
        + (m.p ? ` · <b>${esc(m.p)}</b>` : '') + '</span></span></div>').join('') + '</div>';
  }
  const zmix = hs => '<div class="dm-zmix">' + rank(hs.flatMap(h => h.ms), 'z')
    .map(([z, n]) => `<span style="background:${zc(z)}">${esc(z)} ${n}</span>`).join('') + '</div>';

  const MC = document.createElement('canvas').getContext('2d');
  const tw = (t, f) => { MC.font = f; return MC.measureText(t).width; };
  const F_N = "800 11.5px Pretendard, -apple-system, sans-serif";
  const F_R = "400 9.5px Pretendard, -apple-system, sans-serif";
  let LABSTAT = { shown: 0, total: 0 };

  function drawDim() {
    if (!sel.size && !selR.size && selG.size === 0) return;
    DATA.households.forEach(h => {
      if (h.ms.some(inSel)) return;
      L.circleMarker([h.lat, h.lon], { radius: rad(h.ms.length) * .72, stroke: false, fillColor: C.faint, fillOpacity: 1, interactive: false }).addTo(gDim);
    });
  }
  function drawDots() {
    hhVis().forEach(h => {
      const r = rad(h.ms.length), zs = rank(h.ms, 'z');
      L.circleMarker([h.lat, h.lon], {
        radius: r, color: C.white, weight: 1.6, opacity: 1, fillColor: fillOf(h.ms),
        fillOpacity: h.prec === 'approx' ? .42 : .86, dashArray: h.prec === 'approx' ? '2,2' : null
      }).bindPopup(popup(h)).addTo(gAct);
      if (colored() && zs.length > 1 && r > 6)
        L.circleMarker([h.lat, h.lon], { radius: r * .45, stroke: false, interactive: false, fillColor: zc(zs[1][0]), fillOpacity: .95 }).addTo(gIn);
    });
  }
  function drawNames() {
    const LH = 13, PADX = 11, PADY = 4, GAP = 2, MAXL = 4, SQ = 12;
    const items = hhVis().map(h => {
      const ms = h.ms.slice().sort((a, b) => a.rk - b.rk || (BUCKET_OF[a.g] ?? 99) - (BUCKET_OF[b.g] ?? 99));
      const lines = ms.slice(0, MAXL).map(m => ({ m, role: m.role.length > 9 ? m.role.slice(0, 8) + '…' : m.role }));
      const rest = ms.length - lines.length;
      const w = lines.length ? Math.ceil(Math.max(...lines.map(l => tw(l.m.n, F_N) + (l.role ? tw(l.role, F_R) + 4 : 0)))) + PADX + SQ : 0;
      return {
        h, ms, lines, rest, w, ht: (lines.length + (rest ? 1 : 0)) * LH + PADY,
        p: map.latLngToLayerPoint([h.lat, h.lon]),
        key: (ms.length ? Math.min(...ms.map(m => m.rk)) : 9) * 1000 - ms.length
      };
    });
    items.sort((a, b) => a.key - b.key);
    const placed = []; let shown = 0;
    const hit = r => placed.some(q => r.x < q.x + q.w + GAP && q.x < r.x + r.w + GAP && r.y < q.y + q.h + GAP && q.y < r.y + r.h + GAP);
    items.forEach(it => {
      const col = zc(rank(it.h.ms, 'z')[0][0]);
      const R = 4.5 * sizeK;
      L.marker([it.h.lat, it.h.lon], { interactive: false, icon: L.divIcon({ className: 'dm-ndot', html: `<i style="background:${col}"></i>`, iconSize: [7, 7], iconAnchor: [3.5, 3.5] }) }).addTo(gLab);
      if (!it.lines.length) return;
      const E = R + 4, V = R + 3;
      const cands = [[E, -it.ht / 2], [-E - it.w, -it.ht / 2], [-it.w / 2, -V - it.ht], [-it.w / 2, V], [E, -V - it.ht], [-E - it.w, -V - it.ht], [E, V], [-E - it.w, V]];
      for (const [dx, dy] of cands) {
        const r = { x: it.p.x + dx, y: it.p.y + dy, w: it.w, h: it.ht };
        if (hit(r)) continue;
        placed.push(r);
        L.marker([it.h.lat, it.h.lon], {
          icon: L.divIcon({
            className: 'dm-nlab', iconSize: [it.w, it.ht], iconAnchor: [-dx, -dy],
            html: `<div class="box" style="border-left-color:${col}${it.h.prec === 'approx' ? ';border-style:dashed' : ''}">`
              + it.lines.map(l => '<div class="ln">'
                + `<span class="mk" style="background:${RANKC[l.m.rk]}"></span>`
                + `<span class="n${fc(l.m)}${l.m.rk === 0 ? ' ld' : ''}">${esc(l.m.n)}</span>`
                + (l.role ? `<span class="r">${esc(l.role)}</span>` : '') + '</div>').join('')
              + (it.rest ? `<div class="ln"><span class="mk"></span><span class="r">+${it.rest}명</span></div>` : '')
              + '</div>'
          })
        }).bindPopup(popup(it.h)).addTo(gLab);
        shown++;
        break;
      }
    });
    LABSTAT = { shown, total: items.filter(i => i.lines.length).length };
  }
  function drawArea() {
    const g = {};
    hhVis().forEach(h => {
      const d = h.dong || '기타';
      const o = g[d] || (g[d] = { n: 0, la: 0, lo: 0, hs: [] });
      o.n += h.ms.length; o.la += h.lat * h.ms.length; o.lo += h.lon * h.ms.length; o.hs.push(h);
    });
    const vs = Object.values(g); if (!vs.length) return;
    const mx = Math.max(...vs.map(o => o.n));
    Object.entries(g).sort((a, b) => b[1].n - a[1].n).forEach(([d, o]) => {
      const la = o.la / o.n, lo = o.lo / o.n, r = (12 + Math.sqrt(o.n / mx) * 34) * sizeK;
      const zs = rank(o.hs.flatMap(h => h.ms), 'z');
      L.circleMarker([la, lo], { radius: r, color: C.white, weight: 2, fillOpacity: .68, fillColor: sel.size ? zc(zs[0][0]) : C.navy })
        .bindPopup(`<div class="dm-pop-h"><div class="t">${esc(d)}</div><div class="s">${o.n}명 · ${o.hs.length}세대</div></div><div class="dm-pop-b">${zmix(o.hs)}</div>`).addTo(gAct);
      L.marker([la, lo], { interactive: false, icon: L.divIcon({ className: 'dm-cnt', html: String(o.n), iconSize: [46, 14], iconAnchor: [23, 7] }) }).addTo(gLab);
    });
  }
  function drawMap() {
    if (!map) return;
    [gDim, gAct, gIn, gLab].forEach(g => g.clearLayers());
    if (mode === 'area') { drawArea(); return; }
    drawDim();
    markKind === 'name' ? drawNames() : drawDots();
  }

  /* ── 사이드바 ─────────────────────────────────────────────────── */
  function stat() {
    const n = hhVis().reduce((s, h) => s + h.ms.length, 0);
    const e = DATA.prec.exact || 0, nr = DATA.prec.near || 0, ap = DATA.prec.approx || 0;
    const missing = DATA.total - DATA.located;
    $('dmStat').innerHTML =
      (sel.size ? `<b class="text-white">${esc([...sel].map(zoneLabel).join('·'))} ${n}명</b> 강조 중<br>` : '')
      + `성도 <b class="text-white">${DATA.total}명</b> · 직분자 <b class="text-white">${DATA.officers}명</b> · 지도 표시 <b class="text-white">${DATA.located}명</b><br>`
      + `위치 정확도(세대): 건물 ${e} · 도로·건물명 ${nr} · 동 중심 ${ap}`
      + (missing ? `<br>지도에 없는 ${missing}명: 주소 없음 ${DATA.noaddr} · 못 찾음 ${DATA.fail}${DATA.pending ? ' · 변환 대기 ' + DATA.pending : ''}${DATA.dropped ? ' · 먼 위치 제외 ' + DATA.dropped : ''}` : '');
  }
  function legend() {
    const el = $('dmLegend');
    if (mode === 'age') {
      const c = {}; hhVis().forEach(h => h.ms.forEach(m => c[m.a] = (c[m.a] || 0) + 1));
      el.innerHTML = '<div class="dm-leg">' + AGE.map(([k, col]) =>
        `<div class="dm-legrow"><span class="sw2" style="background:${col}"></span>${esc(k)}<span class="ct">${c[k] || 0}명</span></div>`).join('') + '</div>';
    } else if (mode === 'area') {
      el.innerHTML = '<div class="dm-note"><p>원의 <b>크기</b>가 그 동의 인원입니다. 원을 누르면 어느 구역이 섞여 있는지 나옵니다.</p></div>';
    } else if (markKind === 'name') {
      el.innerHTML = '<div class="dm-mleg"><div class="row">'
        + RANKN.slice(0, 4).map((n, i) => `<span class="it"><i style="background:${RANKC[i]}"></i>${n}</span>`).join('')
        + '</div><div class="row"><span class="it"><b class="m">홍길동</b> 형제</span><span class="it"><b class="f">홍길순</b> 자매</span>'
        + '<span class="it"><b class="m" style="text-decoration:underline;text-underline-offset:2px">밑줄</b> 구역임원</span></div>'
        + `<span class="x">이름표 <b>${LABSTAT.shown}</b>／${LABSTAT.total}세대`
        + (LABSTAT.shown < LABSTAT.total ? ' — <b>확대하면</b> 나머지도 나옵니다.' : ' 모두 표시.') + '</span></div>';
    } else {
      el.innerHTML = '<div class="dm-note"><p>점의 <b>크기</b>가 그 세대 인원입니다. 구역을 고르면 그 구역만 색으로 살아납니다.</p></div>';
    }
  }
  function facet(keyFn, others) {
    const c = {};
    ALLM.forEach(m => { if (others.every(f => f(m))) { const k = keyFn(m); c[k] = (c[k] || 0) + 1; } });
    return c;
  }
  function chips() {
    const c = facet(m => m.z, [mR, mG]);
    $('dmZoneChips').innerHTML = ZONES.map(z =>
      `<div class="dm-chip ${sel.has(z) ? 'on' : ''}" data-z="${esc(z)}">`
      + `<input type="color" class="dm-sw" value="${zc(z)}" data-z="${esc(z)}" title="${esc(zoneLabel(z))} 색 바꾸기">`
      + `<span>${esc(zoneLabel(z))}</span><span class="n">${c[z] || 0}</span></div>`).join('');
    document.querySelectorAll('#dmZoneChips .dm-chip').forEach(el => el.onclick = e => {
      if (e.target.tagName === 'INPUT') return;
      toggle(sel, el.dataset.z);
    });
    document.querySelectorAll('#dmZoneChips input.dm-sw').forEach(el => {
      el.onclick = e => e.stopPropagation();
      el.oninput = () => { ZC[el.dataset.z] = el.value.toUpperCase(); lsSet(LS_COL, JSON.stringify(ZC)); render(); };
    });
  }
  function rchips() {
    const c = facet(m => m.rk, [mZ, mG]);
    $('dmRankChips').innerHTML = RANKN.map((n, i) =>
      `<div class="dm-chip ${selR.has(i) ? 'on' : ''}" data-r="${i}">`
      + `<span class="rk" style="background:${RANKC[i]}${i === 4 ? ';box-shadow:inset 0 0 0 1px #94a3b8' : ''}"></span>`
      + `<span>${n}</span><span class="n">${c[i] || 0}</span></div>`).join('');
    document.querySelectorAll('#dmRankChips .dm-chip').forEach(el => el.onclick = () => toggle(selR, +el.dataset.r));
  }
  function gchips() {
    const c = facet(m => BUCKET_OF[m.g], [mZ, mR]);
    $('dmGroupChips').innerHTML = GROUPS.map((g, i) =>
      `<div class="dm-chip ${selG.has(i) ? 'on' : ''}" data-g="${i}"><span class="ck"></span>`
      + `<span>${esc(g)}</span><span class="n">${c[i] || 0}</span></div>`).join('');
    document.querySelectorAll('#dmGroupChips .dm-chip').forEach(el => el.onclick = () => toggle(selG, +el.dataset.g));
  }
  function fsum() {
    const hitN = ALLM.filter(inSel).length;
    const onMapN = DATA.households.reduce((s, h) => s + h.ms.filter(inSel).length, 0);
    const part = [
      sel.size ? [...sel].map(zoneLabel).join('·') : '전체 구역',
      selR.size ? [...selR].sort().map(i => RANKN[i]).join('·') : '직분 전체',
      selG.size === 0 || selG.size === GROUPS.length ? '소속 전체' : [...selG].sort((a, b) => a - b).map(i => GROUPS[i]).join('·')
    ];
    $('dmFsum').innerHTML = `<div class="row"><span class="it">${esc(part.join('  ·  '))}</span></div>`
      + `<span class="x">해당 <b>${hitN}명</b> · 지도 표시 <b>${onMapN}명</b>`
      + (hitN - onMapN > 0 ? ` (위치 없는 ${hitN - onMapN}명 제외)` : '') + '</span>';
  }
  function roster() {
    const zs = sel.size ? ZONES.filter(z => sel.has(z)) : [];
    $('dmRosterTitle').textContent = zs.length ? `— ${zs.map(zoneLabel).join(' · ')}` : '';
    const el = $('dmRoster');
    if (!zs.length) {
      el.innerHTML = '<div class="dm-note"><p>위에서 <b>구역을 고르면</b> 그 구역 명단이 소속별로 나옵니다. 여러 구역을 한꺼번에 고를 수 있습니다.</p></div>';
      return;
    }
    el.innerHTML = zs.map(z => {
      const ppl = ALLM.filter(m => m.z === z && mR(m) && mG(m));
      const officers = ppl.filter(m => m.rk <= 3).length;
      const head = `<div class="dm-rzh"><span class="z" style="color:${zc(z)}">${esc(zoneLabel(z))}</span>`
        + `<span class="m">${ppl.length}명 · 직분자 <b>${officers}명</b></span></div>`;
      const body = GROUPS.map((gn, bi) => {
        const mem = ppl.filter(m => BUCKET_OF[m.g] === bi).sort((a, b) => a.rk - b.rk || String(a.n).localeCompare(String(b.n), 'ko'));
        if (!mem.length) return '';
        return `<div class="dm-rb"><div class="dm-rbh">${esc(gn)}<span class="c">${mem.length}명</span></div>`
          + mem.map(m => `<div class="dm-rp${m.rk === 0 ? ' lead' : ''}">`
            + `<span class="mk" style="background:${RANKC[m.rk]}${m.rk === 4 ? ';box-shadow:inset 0 0 0 1px #cbd5e1' : ''}"></span>`
            + `<span class="nm${fc(m)}">${esc(m.n)}</span>`
            + `<span class="po">${esc(m.p)}${m.lat == null || m.drop ? ' <span style="opacity:.7">(위치 없음)</span>' : ''}</span></div>`).join('') + '</div>';
      }).join('');
      return `<div class="dm-rz">${head}${body}</div>`;
    }).join('')
      + '<div class="dm-rkey">' + RANKN.map((n, i) => `<span><i style="background:${RANKC[i]}${i === 4 ? ';box-shadow:inset 0 0 0 1px #cbd5e1' : ''}"></i>${n}</span>`).join('') + '</div>';
  }
  function tables() {
    const d = {}, z = {}, zo = {}, zd = {};
    DATA.households.forEach(h => h.ms.forEach(m => {
      const dg = h.dong || '기타';
      if (inSel(m)) d[dg] = (d[dg] || 0) + 1;
    }));
    // 구역별 인원·직분자는 위치가 없는 사람도 포함해 센다(명단과 같은 기준). 흩어짐(동 수)만 위치 있는 사람 기준.
    ALLM.forEach(m => {
      if (!(mR(m) && mG(m))) return;
      z[m.z] = (z[m.z] || 0) + 1;
      if (m.rk <= 3) zo[m.z] = (zo[m.z] || 0) + 1;
    });
    DATA.households.forEach(h => h.ms.forEach(m => {
      if (mR(m) && mG(m)) (zd[m.z] = zd[m.z] || new Set()).add(h.dong || '기타');
    }));
    const dr = Object.entries(d).sort((a, b) => b[1] - a[1]);
    const mxd = Math.max(...dr.map(r => r[1]), 1);
    $('dmDongBars').innerHTML = dr.map(([nm, v]) =>
      `<div class="dm-bar" data-n="${esc(nm)}"><span class="nm">${esc(nm)}</span>`
      + `<span class="tr"><span class="fl" style="width:${(v / mxd * 100).toFixed(1)}%"></span></span>`
      + `<span class="ct">${v}</span></div>`).join('') || '<div class="dm-note">해당 없음</div>';
    const mxz = Math.max(...ZONES.map(k => z[k] || 0), 1);
    $('dmZoneBars').innerHTML = ZONES.map(k =>
      `<div class="dm-bar zn" data-n="${esc(k)}"><span class="dot" style="background:${zc(k)}"></span>`
      + `<span class="nm">${esc(zoneLabel(k))}</span>`
      + `<span class="tr"><span class="fl" style="width:${((z[k] || 0) / mxz * 100).toFixed(1)}%;background:${zc(k)}"></span></span>`
      + `<span class="ct">${z[k] || 0}</span>`
      + `<span class="lg" style="color:${zc(k)}">직분자 ${zo[k] || 0}</span>`
      + `<span class="sp">${zd[k] ? zd[k].size : 0}동</span></div>`).join('');
    document.querySelectorAll('#dmDongBars .dm-bar').forEach(el => el.onclick = () => {
      const hs = DATA.households.filter(h => (h.dong || '기타') === el.dataset.n);
      if (hs.length) map.flyToBounds(L.latLngBounds(hs.map(h => [h.lat, h.lon])).pad(.3), { duration: .6 });
    });
    document.querySelectorAll('#dmZoneBars .dm-bar').forEach(el => el.onclick = () => toggle(sel, el.dataset.n));
  }
  function unlocatedList() {
    const groups = [
      ['주소가 비어 있음', ALLM.filter(m => m.prec === 'noaddr'), '성도 현황에서 주소를 입력하면 지도에 나옵니다.'],
      ['주소로 위치를 못 찾음', ALLM.filter(m => m.prec === 'fail'), '주소에 시·군과 도로명(또는 아파트 이름)이 있는지 확인해 주세요.'],
      ['먼 곳으로 잡혀 제외', ALLM.filter(m => m.drop), '주소를 더 정확히 고치면 다시 찾습니다.'],
      ['변환 대기', ALLM.filter(m => m.prec === 'pending'), isGuest ? '관리자가 이 화면을 열면 자동으로 위치를 찾습니다.' : ''],
      ['기본 지역으로 추정 (시·군 없는 주소)', ALLM.filter(m => m.region && m.lat != null && !m.drop), '위치가 맞는지 지도에서 확인해 주세요. 시·군까지 적으면 더 정확해집니다.']
    ].filter(g => g[1].length);
    $('dmUnloc').innerHTML = groups.length ? groups.map(([title, ms, hint]) => {
      const by = {};
      ms.forEach(m => (by[m.addr || '(주소 없음)'] = by[m.addr || '(주소 없음)'] || []).push(m));
      return `<div class="mb-3"><span class="ua">${esc(title)} · ${ms.length}명</span>`
        + (hint ? `<span class="un">${esc(hint)}</span>` : '')
        + (title.startsWith('주소가 비어')
          ? `<div class="un" style="margin-top:4px">${esc(ms.map(m => `${m.n}(${zoneLabel(m.z)})`).join(', '))}</div>`
          : Object.entries(by).map(([a, list]) => `<div class="un" style="margin-top:4px"><span style="color:var(--dm-ink)">${esc(a)}</span> — ${esc(list.map(m => m.n).join(', '))}`
            + (list[0].drop ? ` <span style="color:var(--dm-female)">(${esc(list[0].drop)})</span>` : '')
            + (list[0].matched && title.startsWith('기본') ? `<br><span style="opacity:.8">→ ${esc(list[0].matched)}</span>` : '') + '</div>').join(''))
        + '</div>';
    }).join('') : '<div class="dm-note"><p>모든 성도의 위치를 찾았습니다.</p></div>';
  }

  function fitToSel() {
    if (!map) return;
    map.invalidateSize();
    let hs = (sel.size || selR.size || selG.size) ? DATA.households.filter(h => h.ms.some(inSel)) : core;
    const inC = hs.filter(h => CORESET.has(h));
    if (inC.length >= Math.max(3, hs.length * .6)) hs = inC;
    if (!hs.length) hs = core;
    if (!hs.length) return;
    const bb = L.latLngBounds(hs.map(h => [h.lat, h.lon])).pad(sel.size ? .16 : .05);
    map.fitBounds(bb, { animate: false });
    if (map.getZoom() < 6) map.setView(bb.getCenter(), 12, { animate: false });
    if (map.getZoom() > 17) map.setZoom(16);
  }
  function toggle(set, v) { set.has(v) ? set.delete(v) : set.add(v); render(); fitToSel(); }

  function render() {
    drawMap(); stat(); legend(); chips(); rchips(); gchips(); fsum(); roster(); tables(); unlocatedList();
  }

  /* ── 지도 준비 ────────────────────────────────────────────────── */
  function pct(arr, p) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))]; }
  function setupMap() {
    const lats = DATA.households.map(h => h.lat), lons = DATA.households.map(h => h.lon);
    if (lats.length) {
      const b = { a: pct(lats, .03), b: pct(lats, .97), c: pct(lons, .03), d: pct(lons, .97) };
      core = DATA.households.filter(h => h.lat >= b.a - .02 && h.lat <= b.b + .02 && h.lon >= b.c - .02 && h.lon <= b.d + .02);
      if (core.length < 3) core = DATA.households;
    } else core = [];
    CORESET = new Set(core);
    if (!map) {
      map = L.map('dmMap').setView(core.length ? [core[0].lat, core[0].lon] : [37.345, 126.968], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      gDim = L.layerGroup().addTo(map); gAct = L.layerGroup().addTo(map);
      gIn = L.layerGroup().addTo(map); gLab = L.layerGroup().addTo(map);
      map.on('zoomend moveend', () => { if (mode !== 'area' && markKind === 'name') { drawMap(); legend(); } });
      let rz;
      window.addEventListener('resize', () => {
        clearTimeout(rz);
        rz = setTimeout(() => { map.invalidateSize(); if (mode !== 'area' && markKind === 'name') { drawMap(); legend(); } }, 200);
      });
    }
    $('dmEmpty').classList.toggle('hidden', DATA.households.length > 0);
    if (!DATA.households.length) {
      $('dmEmpty').textContent = DATA.pending
        ? '주소를 좌표로 바꾸는 중이거나 아직 바꾸지 않았습니다. 잠시 후 다시 확인해 주세요.'
        : '지도에 표시할 수 있는 주소가 없습니다. 성도 현황에서 주소를 입력해 주세요.';
    }
  }

  function bindControls() {
    const seg = (id, attr, fn) => {
      $(id).onclick = e => {
        const b = e.target.closest('button'); if (!b || !b.dataset[attr]) return;
        document.querySelectorAll(`#${id} button`).forEach(x => x.classList.toggle('on', x === b));
        fn(b.dataset[attr]);
      };
    };
    seg('dmMode', 'm', v => { mode = v; render(); });
    seg('dmTiles', 't', v => $('dmMap').classList.toggle('gray', v === 'gray'));
    seg('dmMarks', 'k', v => { markKind = v; render(); });
    seg('dmSize', 's', v => { sizeK = parseFloat(v); render(); });
    $('dmAllZ').onclick = () => { sel.clear(); render(); fitToSel(); };
    $('dmInvZ').onclick = () => {
      const inv = ZONES.filter(z => !sel.has(z));
      sel.clear(); inv.forEach(z => sel.add(z));
      if (sel.size === ZONES.length) sel.clear();
      render(); fitToSel();
    };
    $('dmFit').onclick = () => { fitToSel(); render(); };
    $('dmResetC').onclick = () => { ZC = {}; ZONES.forEach((z, i) => ZC[z] = PAL[i % PAL.length]); lsSet(LS_COL, '{}'); render(); };
    $('dmOfficers').onclick = () => { selR.clear(); selR.add(0); selR.add(1); selG.clear(); render(); fitToSel(); };
    $('dmClear').onclick = () => { selR.clear(); selG.clear(); render(); fitToSel(); };
    $('dmRetryFail').onclick = () => runGeocode({ retryFailed: true });
    $('dmSaveRegions').onclick = async () => {
      const list = $('dmRegions').value.split(',').map(s => s.trim()).filter(Boolean);
      if (!list.length) return;
      const btn = $('dmSaveRegions'); btn.disabled = true;
      try {
        const r = await fetch('/api/settings/geo_default_regions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: list.join(', ') }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        await runGeocode({ redo: 'region' });
      } catch (e) {
        showNotice('기본 지역 저장 실패: ' + e.message);
      } finally { btn.disabled = false; }
    };
  }

  function showNotice(msg) {
    const el = $('dmNotice');
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  /* ── 주소 → 좌표 변환 (관리자) ────────────────────────────────── */
  async function runGeocode(opts) {
    if (geocoding || isGuest || !RAW || !RAW.key_configured) return;
    geocoding = true;
    const box = $('dmGeoBox'), bar = $('dmGeoBar'), txt = $('dmGeoTxt');
    box.classList.remove('hidden');
    let first = true, total = 0, done = 0, counts = { exact: 0, near: 0, approx: 0, fail: 0 };
    try {
      for (let guard = 0; guard < 200; guard++) {
        const body = first ? (opts || {}) : {};
        first = false;
        const r = await fetch('/api/distribution/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (!total) total = j.total || 0;
        done += j.processed || 0;
        ['exact', 'near', 'approx', 'fail'].forEach(k => counts[k] += j[k] || 0);
        bar.style.width = total ? Math.round(done / total * 100) + '%' : '100%';
        txt.textContent = `주소 → 위치 변환 ${done} / ${total}곳 · 건물 ${counts.exact} · 도로·건물명 ${counts.near} · 동 중심 ${counts.approx} · 못 찾음 ${counts.fail}`;
        if (!j.remaining || !j.processed) break;
      }
      txt.textContent += ' — 완료';
      await load(false);
    } catch (e) {
      showNotice('위치 변환 중 문제가 생겼습니다: ' + e.message);
    } finally {
      geocoding = false;
      setTimeout(() => box.classList.add('hidden'), 4000);
    }
  }

  /* ── 불러오기 ─────────────────────────────────────────────────── */
  async function load(allowAutoGeocode) {
    const r = await fetch('/api/distribution', { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    RAW = j;
    build(j.members || []);
    if (!Object.keys(ZC).length) {
      ZONES.forEach((z, i) => ZC[z] = PAL[i % PAL.length]);
      try { Object.assign(ZC, JSON.parse(lsGet(LS_COL) || '{}')); } catch (e) { }
    } else {
      ZONES.forEach((z, i) => { if (!ZC[z]) ZC[z] = PAL[i % PAL.length]; });
    }
    $('dmRegions').value = (j.regions || []).join(', ');
    $('dmAdmin').classList.toggle('hidden', isGuest || !j.key_configured);
    if (!j.key_configured) {
      showNotice(isGuest ? '' : '카카오 REST API 키가 아직 설정되지 않아 주소를 위치로 바꾸지 못합니다. Vercel 환경변수에 KAKAO_REST_API_KEY를 넣고 다시 배포해 주세요.');
    } else if (j.pending && isGuest) {
      showNotice(`위치를 아직 찾지 않은 주소가 ${j.pending}명 있습니다. 관리자가 이 화면을 열면 자동으로 찾습니다.`);
    } else {
      showNotice('');
    }
    setupMap();
    render();
    const settle = () => { if (map) { map.invalidateSize(); fitToSel(); } };
    requestAnimationFrame(() => { settle(); requestAnimationFrame(settle); });
    setTimeout(settle, 300);
    if (allowAutoGeocode && j.pending && j.key_configured && !isGuest) runGeocode();
  }

  async function init() {
    try {
      const s = await fetch('/api/session').then(r => r.ok ? r.json() : null);
      isGuest = !s || s.role === 'guest';
    } catch (e) { isGuest = true; }
    bindControls();
    try {
      await load(true);
    } catch (e) {
      $('dmStat').textContent = '불러오지 못했습니다: ' + e.message;
      $('dmEmpty').textContent = '성도 분포 데이터를 불러오지 못했습니다. (DB 준비 SQL을 실행했는지 확인해 주세요)';
      $('dmEmpty').classList.remove('hidden');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
