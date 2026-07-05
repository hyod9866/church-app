/**
 * member-profile.js
 * ------------------------------------------------------------------
 * 공용 "성도 상세 프로필 카드" 렌더링 모듈.
 *
 * 이전에는 openMemberHistoryModal() 안의 프로필 카드 HTML과
 * calculateAge / sortFamilyRelations / getDC / 간증 수정 로직이
 * app.js, member_management.js, visitation_history.js, counseling_history.js
 * 4개 파일에 각각 복사되어 있었고, 그 결과 페이지마다 조금씩 달라져 있었음
 * (주소 클릭 시 지도 모달 연결 여부, 가족 관계 안내 문구 유무 등).
 *
 * 이 파일이 "단일 진실 공급원(single source of truth)" 역할을 하며,
 * 4개 페이지 모두 이 스크립트를 <script src="/js/member-profile.js"> 로
 * 먼저 불러온 뒤 각자의 openMemberHistoryModal(id)에서
 * window.renderMemberProfileHeader(...) 를 호출해서 카드를 그린다.
 *
 * 주의: 출석 탭/심방기록 탭/상담기록 탭 등 페이지별로 고유한 로직은
 * 이 파일에 포함되어 있지 않다 (페이지마다 실제로 다른 기능이라 그대로 둠).
 * ------------------------------------------------------------------
 */

// ---- 공용 헬퍼 ----------------------------------------------------

function calculateAge(birthYear) {
    if (!birthYear) return '-';
    const year = parseInt(birthYear);
    return isNaN(year) ? '-' : (new Date().getFullYear() - year + 1);
}

function sortFamilyRelations(relationsArray) {
    const priority = (entry) => {
        const match = entry.match(/\(([^)]+)\)/);
        if (!match) return 999;
        const rel = match[1].trim();
        if (rel.includes('아내') || rel.includes('남편') || rel.includes('배우자') || rel.includes('부부')) return 1;
        if (rel.includes('자녀') || rel.includes('아들') || rel.includes('딸')) return 2;
        if (rel.includes('부모') || rel.includes('아버지') || rel.includes('어머니') || rel.includes('아빠') || rel.includes('엄마')) return 3;
        if (rel.includes('기타')) return 4;
        return 5;
    };
    return [...relationsArray].sort((a, b) => priority(a) - priority(b));
}

function getDC(d) {
    if (!d || d === '-') return 'bg-gray-100 text-gray-400 border-gray-200';
    if (d.includes('581')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (d.includes('582')) return 'bg-green-100 text-green-800 border-green-200';
    if (d.includes('583')) return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
}

window.calculateAge = calculateAge;
window.sortFamilyRelations = sortFamilyRelations;
window.getDC = getDC;

// ---- 프로필 헤더 카드 렌더링 ---------------------------------------
// member, family: /api/members/:id/history 응답의 member/family
// calculatedPosArray: 현재 직분 배열, finalCalculatedSvc: 봉사 내역 문자열
window.renderMemberProfileHeader = function(member, family, calculatedPosArray, finalCalculatedSvc) {
    calculatedPosArray = calculatedPosArray || [];

    const fEnt = sortFamilyRelations((member.family_relation || '').split(',').map(s => s.trim()).filter(s => s));

    // 가족관계 대화형 카드 생성 (클릭 시 순간이동)
    const fDispHTML = fEnt.map(e => {
        const match = e.match(/^(.+?)\(/);
        const name = match ? match[1].trim() : e.trim();
        const found = family ? family.find(f => f.name.trim() === name) : null;
        if (found) {
            return `<button type="button" class="bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] px-2.5 py-1.5 rounded-full font-bold border border-blue-200 shadow-sm transition active:scale-[0.97]" onclick="openMemberHistoryModal(${found.id})">${e} ➔</button>`;
        }
        return `<span class="bg-gray-100 text-gray-600 text-[11px] px-2.5 py-1.5 rounded-full font-medium border border-gray-200 shadow-sm">${e}</span>`;
    }).join(' ') || '<span class="text-slate-400 italic text-xs">없음</span>';

    const initial = member.name ? member.name[0] : '';
    const avatarColors = member.bs === 'B'
        ? 'from-blue-500 to-indigo-600 shadow-blue-100'
        : 'from-pink-500 to-rose-600 shadow-rose-100';

    const badges = [
        member.church ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-place-of-worship mr-1 text-[10px]"></i>${member.church}</span>` : '',
        member.parish ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${member.parish}</span>` : '',
        member.district ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold ${getDC(member.district)} border">${member.district}</span>` : '',
        member.category ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${member.category}</span>` : '',
        member.marital_status ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">${member.marital_status}</span>` : '',
        ...calculatedPosArray.map(p => `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">${p}</span>`)
    ].filter(x => x).join(' ');

    return `
    <div class="col-span-2 md:col-span-4 flex flex-col md:flex-row items-center gap-5 pb-5 border-b border-slate-100 w-full">
        <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-tr ${avatarColors} flex items-center justify-center text-white text-2xl md:text-3xl font-black shadow-lg">
            ${initial}
        </div>
        <div class="flex-1 text-center md:text-left">
            <div class="flex flex-col md:flex-row items-center gap-2 mb-2">
                <h3 class="text-2xl font-black text-slate-800">${member.name}</h3>
                <span class="text-xs font-black text-slate-400 bg-slate-100/70 px-2 py-0.5 rounded-md">${member.bs === 'B' ? '형제' : '자매'} (${calculateAge(member.birth_year)}세, ${member.birth_year || '-'}년생)</span>
            </div>
            <div class="flex flex-wrap gap-1.5 justify-center md:justify-start">
                ${badges}
            </div>
        </div>
    </div>
    <div class="col-span-2 md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
        <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">구원일</span>
        <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
            <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            ${member.salvation_date || '-'}
        </span>
    </div>
    <div class="col-span-2 md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
        <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">연락처</span>
        <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
            <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
            ${member.phone || '-'}
        </span>
    </div>
    <div class="col-span-2 md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
        <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">가족 관계 <span class="text-[9px] text-slate-400 font-normal ml-1">(이름을 누르면 프로필로 바로 전환됩니다)</span></span>
        <div class="flex flex-wrap gap-1.5 mt-1">
            ${fDispHTML}
        </div>
    </div>
    <div class="col-span-2 md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
        <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">주소</span>
        <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
            <svg class="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            ${member.address
                ? `<span class="truncate cursor-pointer hover:underline hover:text-blue-600 font-semibold" onclick="triggerMapModal('${member.address.replace(/'/g, "\\'")}')" title="${member.address}">${member.address}</span>`
                : '-'}
        </span>
    </div>
    <div class="col-span-2 md:col-span-4 bg-blue-50/40 p-4 rounded-xl border border-blue-100/50 flex flex-col gap-1">
        <span class="text-blue-700 text-[10px] font-black uppercase tracking-wider">교회 봉사 내역</span>
        <span class="font-extrabold text-blue-900 text-sm">${finalCalculatedSvc}</span>
    </div>
    <div class="col-span-2 md:col-span-4 bg-yellow-50/30 p-4 rounded-xl border border-yellow-100/50 flex flex-col gap-1 relative group">
        <div class="flex items-center justify-between">
            <span class="text-yellow-700 text-[10px] font-black uppercase tracking-wider">메모</span>
            <button type="button" id="testimonyEditBtn" onclick="toggleTestimonyEdit(true)" class="text-yellow-700 hover:text-yellow-900 text-xs font-bold transition flex items-center gap-1">
                <i class="fa-regular fa-pen-to-square"></i> 수정
            </button>
        </div>
        <div id="testimonyViewMode" class="font-medium text-slate-700 text-xs whitespace-pre-wrap leading-relaxed mt-1">${member.testimony || '내용 없음'}</div>
        <div id="testimonyEditMode" class="hidden flex flex-col gap-2 mt-1">
            <textarea id="testimonyTextarea" class="w-full border border-slate-200 focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 rounded-xl px-3 py-2 h-24 outline-none text-xs leading-relaxed text-slate-700 transition duration-150 resize-y" placeholder="간증 및 기타 메모 내용을 입력하세요...">${member.testimony || ''}</textarea>
            <div class="flex justify-end gap-1.5">
                <button type="button" onclick="toggleTestimonyEdit(false)" class="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition active:scale-[0.97]">
                    취소
                </button>
                <button type="button" onclick="saveTestimonyDirect(${member.id})" class="px-2.5 py-1.5 text-[11px] font-bold text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg transition active:scale-[0.97] shadow-sm">
                    저장
                </button>
            </div>
        </div>
    </div>`;
};

// ---- 간증/메모 수정 (4개 페이지 100% 동일 로직) ---------------------

window.toggleTestimonyEdit = function(isEdit) {
    const viewMode = document.getElementById('testimonyViewMode');
    const editMode = document.getElementById('testimonyEditMode');
    const editBtn = document.getElementById('testimonyEditBtn');
    if (isEdit) {
        viewMode.classList.add('hidden');
        editMode.classList.remove('hidden');
        editBtn.classList.add('hidden');
        const textarea = document.getElementById('testimonyTextarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    } else {
        viewMode.classList.remove('hidden');
        editMode.classList.add('hidden');
        editBtn.classList.remove('hidden');
        document.getElementById('testimonyTextarea').value = currentMemberData.testimony || '';
    }
};

window.saveTestimonyDirect = async function(id) {
    try {
        const text = document.getElementById('testimonyTextarea').value;
        const updatedData = { ...currentMemberData, testimony: text };

        const response = await fetch(`/api/members/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });

        if (response.ok) {
            currentMemberData = updatedData;
            document.getElementById('testimonyViewMode').textContent = text || '내용 없음';
            window.toggleTestimonyEdit(false);
            // 페이지마다 목록 새로고침 함수 이름이 다르므로 있는 것만 호출
            if (typeof window.loadMemberList === 'function') window.loadMemberList();
            else if (typeof window.loadData === 'function') window.loadData();
            else if (typeof window.loadStatus === 'function') window.loadStatus();
        } else {
            alert('저장에 실패했습니다.');
        }
    } catch (e) {
        console.error(e);
        alert('에러가 발생했습니다.');
    }
};

// ---- 주소 -> 길찾기 지도 모달 (member_management.js에만 있던 기능을 4곳 공통으로) ----
// 각 HTML에 #mapModal 마크업이 있어야 동작한다. DOMContentLoaded 시 자동 초기화.
document.addEventListener('DOMContentLoaded', function() {
    const mapModal = document.getElementById('mapModal');
    if (!mapModal) return; // 이 페이지에 지도 모달 마크업이 없으면 조용히 스킵

    const mapModalAddress = document.getElementById('mapModalAddress');
    const closeMapModal = document.getElementById('closeMapModal');
    const closeMapModalBtn = document.getElementById('closeMapModalBtn');
    const modalTmapLink = document.getElementById('modalTmapLink');
    const modalKakaomapLink = document.getElementById('modalKakaomapLink');
    const modalNavermapLink = document.getElementById('modalNavermapLink');
    const modalCopyAddressBtn = document.getElementById('modalCopyAddressBtn');

    window.triggerMapModal = function(addressText) {
        if (!addressText) return;
        mapModalAddress.textContent = addressText;
        modalTmapLink.href = `tmap://search?name=${encodeURIComponent(addressText)}`;
        modalKakaomapLink.href = `https://map.kakao.com/?q=${encodeURIComponent(addressText)}`;
        modalNavermapLink.href = `https://map.naver.com/v5/search/${encodeURIComponent(addressText)}`;
        mapModal.classList.remove('hidden');
    };

    function hideMapModal() {
        mapModal.classList.add('hidden');
    }

    if (closeMapModal) closeMapModal.addEventListener('click', hideMapModal);
    if (closeMapModalBtn) closeMapModalBtn.addEventListener('click', hideMapModal);
    mapModal.addEventListener('click', (e) => {
        if (e.target === mapModal) hideMapModal();
    });

    if (modalCopyAddressBtn) {
        modalCopyAddressBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const addressText = mapModalAddress.textContent;
            if (addressText) {
                navigator.clipboard.writeText(addressText)
                    .then(() => alert('주소가 복사되었습니다.'))
                    .catch(err => console.error('복사 실패:', err));
            }
        });
    }
});

// ------------------------------------------------------------------
// 출석 탭 (통일본, 2026-07-05)
//
// 예전에는 4개 페이지가 "출석 의무 대상 판정 규칙"과 "출석 탭 화면"을
// 각자 따로 구현하고 있었음:
//  - 메인 화면(app.js)은 의무 대상 판정 자체가 아예 없어서 모든 모임을 다 카운트
//  - 성도 현황(member_management.js)만 필터 카드(전체/구역/조/기타)와
//    출석↔결석 클릭 토글이 있었고, 심방/상담 관리는 읽기 전용 표만 있었음
//  - "교구형제모임"은 형제이기만 하면 대상으로 잘못 카운트되고 있었음
//    (원래는 봉사회 소속 형제만 대상이어야 함)
//  - "교구전체모임" 등 교구 단위 모임은 다른 교구에서 만든 모임까지
//    같이 카운트될 수 있는 구조였음 (server.js의 집계 API에는 이미
//    있던 교회/교구 일치 검증이 개인 상세 화면에는 빠져 있었음)
//
// 아래 isMandatoryMeeting은 server.js의 동명 함수와 반드시 동일한 규칙을
// 유지해야 한다 (성도 현황 출석 탭과 attendance-rates 집계가 다른 숫자를
// 보여주면 안 되므로). 규칙을 고칠 땐 양쪽 다 고칠 것.
// ------------------------------------------------------------------

// 특정 날짜 시점에 그 성도가 "임원"이었는지를 인적사항(POSITION/POSITION_DISMISS) 이력으로 판정.
// (2026-07-05: server.js의 동명 함수와 동일 — 현재 직분만 보면 임기 중간에 임명된 사람이
//  임명 전 모임까지 참석 의무 대상으로 잘못 잡히는 문제가 있어서 날짜 인지 계산으로 변경)
function hasPositionAsOf(positionRecords, dateStr) {
    if (!positionRecords || positionRecords.length === 0) return false;
    const sorted = [...positionRecords].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.id || 0) - (b.id || 0);
    });
    let positions = [];
    sorted.forEach(rec => {
        if (rec.date > dateStr) return;
        if (rec.status === 'POSITION') {
            const newPos = (rec.remark || '').split(',').map(p => p.trim()).filter(p => p);
            positions = Array.from(new Set([...positions, ...newPos]));
        } else if (rec.status === 'POSITION_DISMISS') {
            const cleaned = (rec.remark || '').replace(/\[면직\]\s*|면직\s*/g, '');
            const removePos = cleaned.split(',').map(p => p.trim()).filter(p => p);
            positions = positions.filter(p => !removePos.includes(p));
        }
    });
    return positions.length > 0;
}
window.hasPositionAsOf = hasPositionAsOf;

window.isMandatoryMeeting = function(member, meeting, leaderProfile, positionRecords) {
    const mType = meeting.type || '';
    const mDistMatch = mType.match(/\d+/);
    const mDistNum = mDistMatch ? mDistMatch[0] : null;
    const memDistNum = (member.district || '').replace(/[^0-9]/g, '');
    const isGroupEligibleSister = member.bs === 'S' && (member.category === '어머니회' || member.category === '은장회');

    // 구역모임: 구역 배정자 전원
    if (mType.includes('구역모임')) {
        return !mDistNum || mDistNum === memDistNum;
    }

    // 조모임(구역 단위, "전체조모임"은 제외): 어머니회/은장회 자매만
    if (mType.includes('조모임') && !mType.includes('전체조모임')) {
        if (!isGroupEligibleSister) return false;
        return !mDistNum || mDistNum === memDistNum;
    }

    // 교구 단위 모임: 모임을 만든 리더와 같은 교회(+서울중앙교회면 교구까지) 소속만 대상
    const isParishMeeting = mType.includes('교구전체모임') || mType.includes('교구형제모임') || mType.includes('전체조모임') || mType.includes('교구임원모임') || mType.includes('청년');

    if (isParishMeeting) {
        if (member.member_status === 'evangelism') return false;
        const effectiveChurch = meeting.leader_church_snapshot || (leaderProfile && leaderProfile.church) || null;
        const effectiveParish = meeting.leader_parish_snapshot || (leaderProfile && leaderProfile.parish) || null;
        if (effectiveChurch) {
            if ((member.church || '').trim() !== effectiveChurch.trim()) return false;
            if (effectiveChurch.trim() === '서울중앙교회' && effectiveParish &&
                (member.parish || '').trim() !== effectiveParish.trim()) return false;
        }
    }

    if (mType.includes('교구전체모임')) return true;
    if (mType.includes('교구형제모임')) return member.bs === 'B' && member.category === '봉사회';
    if (mType.includes('전체조모임')) return isGroupEligibleSister;
    if (mType.includes('교구임원모임')) return hasPositionAsOf(positionRecords, meeting.date);
    // id=270: 청년모임 참석률이 낮아 의도적으로 제외된 케이스로 확인됨 (2026-07-05 사용자 확인, 유지)
    if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

    return false;
};

// 성도 상세 모달의 "출석 히스토리" 탭 전체(필터 카드 + 표 + 토글 + 간증 인라인수정)를
// 그려주는 공용 함수. 4개 페이지 모두 동일한 화면/동일한 계산 규칙을 쓰게 된다.
// history: /api/members/:id/history 가 내려주는 원본 history 배열 (심방/상담/설교 포함, 미필터)
window.renderAttendanceTab = async function(id, member, history, leaderProfile) {
    const attendanceTabContainer = document.getElementById('tabContent_attendance');
    if (!attendanceTabContainer) return;

    // 교구임원모임 의무 대상을 "모임 날짜 시점" 기준으로 정확히 판정하기 위한 직분 이력 조회
    // (2026-07-05: isMandatoryMeeting의 날짜 인지 판정과 함께 추가)
    let positionRecords = [];
    try {
        const recRes = await fetch(`/api/members/${id}/records`);
        const recs = await recRes.json();
        positionRecords = (recs || []).filter(r => r.status === 'POSITION' || r.status === 'POSITION_DISMISS');
    } catch (e) { console.error(e); }

    const todayStr = new Date().toISOString().split('T')[0];
    const rawFilteredHistory = history.filter(h => h.type !== '심방' && h.type !== '상담' && h.type !== '설교' && h.type !== '외부설교' && h.date <= todayStr);

    // 의무 대상 모임이거나, 실제로 참석(is_present)했던 기록만 카운트
    const filteredHistory = rawFilteredHistory.filter(h => window.isMandatoryMeeting(member, h, leaderProfile, positionRecords) || h.is_present);

    const getMeetingCategory = (type) => {
        if (type.includes('구역모임')) return 'district';
        if (type.includes('조모임')) return 'group';
        return 'other';
    };

    const stats = {
        all: { count: 0, present: 0 },
        district: { count: 0, present: 0 },
        group: { count: 0, present: 0 },
        other: { count: 0, present: 0 }
    };

    filteredHistory.forEach(h => {
        const cat = getMeetingCategory(h.type);
        stats.all.count++;
        if (h.is_present) stats.all.present++;
        stats[cat].count++;
        if (h.is_present) stats[cat].present++;
    });

    const getRate = (s) => s.count > 0 ? Math.round((s.present / s.count) * 100) : 0;

    attendanceTabContainer.innerHTML = `
        <div class="mb-5 grid grid-cols-4 gap-3">
            <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-blue-500 bg-blue-50/20 ring-2 ring-blue-100/50" data-filter="all">
                <span class="text-xl md:text-2xl mb-0.5">📊</span>
                <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">전체 모임</span>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.all)}%</span>
                    <span class="text-xs md:text-sm font-extrabold text-blue-600">(${stats.all.present}/${stats.all.count}회)</span>
                </div>
            </button>
            <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="district">
                <span class="text-xl md:text-2xl mb-0.5">🏠</span>
                <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">구역모임</span>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.district)}%</span>
                    <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.district.present}/${stats.district.count}회)</span>
                </div>
            </button>
            <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="group">
                <span class="text-xl md:text-2xl mb-0.5">👥</span>
                <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">조모임</span>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.group)}%</span>
                    <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.group.present}/${stats.group.count}회)</span>
                </div>
            </button>
            <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="other">
                <span class="text-xl md:text-2xl mb-0.5">⛪</span>
                <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">교구/기타</span>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.other)}%</span>
                    <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.other.present}/${stats.other.count}회)</span>
                </div>
            </button>
        </div>

        <div class="mb-6">
            <h4 class="font-extrabold mb-4 text-slate-800 border-l-4 border-emerald-600 pl-3 flex justify-between items-center text-sm md:text-base">
                <span id="attListTitle" class="font-black text-slate-800">전체 출석 히스토리</span>
                <div class="flex items-center gap-2">
                    <span class="text-xs md:text-sm font-semibold text-slate-500">선택 출석률</span>
                    <span id="memberAttendanceStats" class="text-xs md:text-sm font-black text-blue-700 bg-blue-50/80 border border-blue-150 px-3 py-1 rounded-full shadow-sm">${getRate(stats.all)}% (${stats.all.present}/${stats.all.count})</span>
                </div>
            </h4>
            <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table class="w-full text-sm text-left border-collapse bg-white">
                    <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                        <tr>
                            <th class="py-2 px-2.5 w-[110px] border-r text-center">날짜</th>
                            <th class="py-2 px-2.5 min-w-[150px] border-r text-center">모임정보</th>
                            <th class="py-2 px-2.5 text-center w-[90px] border-r">출석 여부</th>
                            <th class="py-2 px-2.5 text-center">간증</th>
                        </tr>
                    </thead>
                    <tbody id="historyTableBody" class="divide-y divide-slate-100"></tbody>
                </table>
            </div>
        </div>
    `;

    const renderAttendanceRows = (filterType) => {
        const historyTableBody = document.getElementById('historyTableBody');
        if (!historyTableBody) return;

        const listTitle = document.getElementById('attListTitle');
        const statsLabel = document.getElementById('memberAttendanceStats');

        const listMap = {
            all: '전체 출석 히스토리',
            district: '🏠 구역모임 히스토리',
            group: '👥 조모임 히스토리',
            other: '⛪ 기타/교구모임 히스토리'
        };
        if (listTitle) listTitle.textContent = listMap[filterType];
        if (statsLabel) {
            const s = stats[filterType];
            statsLabel.textContent = `${getRate(s)}% (${s.present}/${s.count})`;
        }

        const displayHistory = filterType === 'all'
            ? filteredHistory
            : filteredHistory.filter(h => getMeetingCategory(h.type) === filterType);

        historyTableBody.innerHTML = displayHistory.map(h => {
            const statusBadge = `
                <button type="button" class="toggle-attendance-btn inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold border transition duration-150 active:scale-95 cursor-pointer ${h.is_present ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}" data-meeting-id="${h.meeting_id}" data-member-id="${id}" data-present="${h.is_present ? 1 : 0}">
                    ${h.is_present ? '출석' : '결석'}
                </button>
            `;

            return `<tr class="text-sm border-b hover:bg-slate-50/50 transition-colors"><td class="py-1 px-2.5 text-slate-500 font-medium whitespace-nowrap">${h.date}</td><td class="py-1 px-2.5 font-bold text-slate-800">${h.title}</td><td class="py-1 px-2.5 text-center">${statusBadge.trim()}</td><td class="py-1 px-2.5 text-slate-650 dark:text-slate-300 font-medium text-xs md:text-sm leading-relaxed cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/40 rounded-lg transition-colors testimony-cell" data-meeting-id="${h.meeting_id}" data-member-id="${id}" data-testimony="${h.testimony_snapshot || ''}"><div class="flex items-center justify-between gap-2 group w-full"><span class="testimony-text whitespace-pre-wrap flex-1">${h.testimony_snapshot || '<span class="text-slate-350 dark:text-slate-600 italic font-normal">-</span>'}</span><span class="text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap">✏️ 수정</span></div></td></tr>`;
        }).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">출석 기록이 존재하지 않습니다.</td></tr>';

        // 출석 토글 이벤트 바인딩
        historyTableBody.querySelectorAll('.toggle-attendance-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const meetingId = btn.dataset.meetingId;
                const memberId = btn.dataset.memberId;
                const currentPresent = parseInt(btn.dataset.present);
                const newPresent = currentPresent === 1 ? 0 : 1;

                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin mr-1"></i> 저장`;

                try {
                    const response = await fetch('/api/attendance/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ member_id: memberId, meeting_id: meetingId, is_present: newPresent })
                    });

                    if (response.ok) {
                        openMemberHistoryModal(memberId);
                    } else {
                        alert('출석 상태 변경에 실패했습니다.');
                        btn.disabled = false;
                        btn.innerHTML = currentPresent === 1 ? '출석' : '결석';
                    }
                } catch (err) {
                    console.error('Toggle error:', err);
                    alert('서버 오류로 인해 실패했습니다.');
                    btn.disabled = false;
                    btn.innerHTML = currentPresent === 1 ? '출석' : '결석';
                }
            });
        });

        // 간증 인라인 편집 이벤트 바인딩
        historyTableBody.querySelectorAll('.testimony-cell').forEach(cell => {
            cell.addEventListener('click', function(e) {
                if (cell.querySelector('.testimony-edit-input')) return;
                if (e.target.closest('.save-testimony-btn') || e.target.closest('.cancel-testimony-btn')) return;

                const meetingId = cell.dataset.meetingId;
                const memberId = cell.dataset.memberId;
                const currentVal = cell.dataset.testimony || '';

                cell.innerHTML = `
                    <div class="flex flex-col gap-1.5 w-full">
                        <textarea class="testimony-edit-input w-full rounded-xl px-2.5 py-1.5 text-xs font-bold focus:ring-2 focus:ring-blue-500/25 focus:outline-none" rows="2">${currentVal}</textarea>
                        <div class="flex justify-end gap-1.5">
                            <button type="button" class="save-testimony-btn bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                            <button type="button" class="cancel-testimony-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
                        </div>
                    </div>
                `;

                const textarea = cell.querySelector('.testimony-edit-input');
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);

                cell.querySelector('.save-testimony-btn').addEventListener('click', async (evt) => {
                    evt.stopPropagation();
                    const newVal = textarea.value.trim();
                    const saveBtn = cell.querySelector('.save-testimony-btn');
                    saveBtn.disabled = true;
                    saveBtn.textContent = '저장중...';

                    try {
                        const response = await fetch('/api/attendance/testimony', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ member_id: memberId, meeting_id: meetingId, testimony: newVal })
                        });

                        if (response.ok) {
                            openMemberHistoryModal(memberId);
                        } else {
                            alert('간증 저장에 실패했습니다.');
                            openMemberHistoryModal(memberId);
                        }
                    } catch (err) {
                        console.error(err);
                        alert('간증 저장 중 에러가 발생했습니다.');
                        openMemberHistoryModal(memberId);
                    }
                });

                cell.querySelector('.cancel-testimony-btn').addEventListener('click', (evt) => {
                    evt.stopPropagation();
                    openMemberHistoryModal(memberId);
                });
            });
        });
    };

    renderAttendanceRows('all');

    const cards = attendanceTabContainer.querySelectorAll('.att-filter-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            cards.forEach(c => {
                c.classList.remove('border-blue-500', 'bg-blue-50/20', 'ring-2', 'ring-blue-100/50');
                c.classList.add('border-slate-200', 'hover:border-slate-300', 'hover:bg-slate-50/30');
                const countSpan = c.querySelector('span:nth-child(4)');
                if (countSpan) {
                    countSpan.classList.remove('text-blue-600');
                    countSpan.classList.add('text-slate-500');
                }
            });
            card.classList.add('border-blue-500', 'bg-blue-50/20', 'ring-2', 'ring-blue-100/50');
            card.classList.remove('border-slate-200', 'hover:border-slate-300', 'hover:bg-slate-50/30');
            const countSpan = card.querySelector('span:nth-child(4)');
            if (countSpan) {
                countSpan.classList.remove('text-slate-500');
                countSpan.classList.add('text-blue-600');
            }
            const filter = card.dataset.filter;
            renderAttendanceRows(filter);
        });
    });
};
