// ------------------------------------------------------------------
// 출석 의무 대상 판정 공유 모듈 (2026-07-06 일원화)
//
// 예전에는 이 로직이 server.js / dashboard.js / member-profile.js 세 곳에
// 각각 복사돼 있었고, dashboard.js 버전이 나머지와 달라서
// "대시보드 출석률"과 "성도 상세 출석률"이 서로 다른 숫자를 보여주는
// 버그가 있었다. 프론트엔드는 이제 이 파일 하나만 사용한다.
//
// ⚠ server.js의 hasPositionAsOf / isMandatoryMeeting 과 반드시 동일한
//   규칙을 유지해야 한다. 규칙을 고칠 땐 server.js와 이 파일 두 곳만 고치면 된다.
//
// 규칙 요약:
// - 구역모임: 구역이 배정된 성도 전원 (구역 번호 일치)
// - 조모임(구역 단위): 그 구역 소속 "어머니회/은장회" 자매만
// - 교구전체모임: 모임을 만든 리더와 같은 교회(+서울중앙교회면 교구까지) 소속 전원
// - 전체조모임: 위 소속 범위의 "어머니회/은장회" 자매
// - 교구형제모임: 위 소속 범위의 "봉사회" 형제
// - 교구임원모임: "그 모임이 열린 날짜" 시점에 직분이 있었던 성도
// - 청년모임: 위 소속 범위의 "청년회" (id=270은 사용자 확인으로 의도적 제외)
// - 전도대상자(member_status='evangelism')는 교구 단위 모임 대상에서 제외
// ------------------------------------------------------------------

// 특정 날짜(asOfDate) 시점의 성도 소속/직분/활동상태를 member_records 이력으로 재구성 (server.js와 동일 규칙)
window.resolveMemberProfileAsOf = function (member, records, asOfDate) {
    if (!records || records.length === 0) return member;
    const sortedRecords = [...records].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.id || 0) - (b.id || 0);
    });

    let initData = null;
    const snapRec = sortedRecords.find(r => r.status === 'INITIAL_SNAPSHOT' && r.remark);
    if (snapRec) {
        try { initData = JSON.parse(snapRec.remark); } catch (e) {}
    }

    let currentChurch = (initData && initData.church) || member.church || '교회정보없음';
    let currentParish = (initData && initData.parish) || member.parish || '교구정보없음';
    let currentDistrict = (initData && initData.district) || member.district || '구역정보없음';
    let currentCategory = (initData && initData.category) || member.category || '봉사회';
    let currentStatus = (initData && initData.status) || member.status || 'active';

    const cutoff = asOfDate || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
    const activeRecords = sortedRecords.filter(rec =>
        rec.status !== 'INITIAL_SNAPSHOT' &&
        rec.status !== 'SYSTEM_GEMINI_KEY' &&
        (!rec.date || rec.date <= cutoff)
    );

    activeRecords.forEach(rec => {
        const remark = (rec.remark || '').trim();
        if (rec.status === 'DISTRICT') {
            currentDistrict = remark || '미배정';
        } else if (rec.status === 'CATEGORY') {
            if (remark) currentCategory = remark;
        } else if (rec.status === 'CHURCH_IN') {
            const parts = remark.split(' > ').map(s => s.trim());
            if (parts[0]) currentChurch = parts[0];
            currentParish = parts[1] || (parts[0] === '서울중앙교회' ? currentParish : '교구정보없음');
            currentDistrict = parts[2] || '미배정';
            currentStatus = 'active';
        } else if (rec.status === 'CHURCH_MOVE') {
            if (remark.startsWith('서울중앙교회')) {
                const parts = remark.split(' > ').map(s => s.trim());
                if (parts[0]) currentChurch = parts[0];
                if (parts[1]) currentParish = parts[1];
                currentDistrict = parts[2] || '미배정';
                currentStatus = 'active';
            } else if (remark) {
                currentChurch = remark;
                currentParish = '교구정보없음';
                currentDistrict = '미배정';
                currentStatus = 'active';
            }
        } else if (rec.status === 'PARISH_MOVE') {
            const parts = remark.split(' > ').map(s => s.trim());
            if (parts[0]) currentParish = parts[0];
            currentDistrict = parts[1] || '미배정';
        } else if (rec.status === 'FELLOWSHIP') {
            if (remark.includes('안나옴')) currentStatus = 'inactive';
            else if (remark.includes('나옴')) currentStatus = 'active';
        }
    });

    return {
        ...member,
        church: currentChurch,
        parish: currentParish,
        district: currentDistrict,
        category: currentCategory,
        status: currentStatus
    };
};

// 특정 날짜 시점에 그 성도가 "임원"이었는지를 인적사항(POSITION/POSITION_DISMISS) 이력으로 판정.
window.hasPositionAsOf = function (positionRecords, dateStr) {
    if (!positionRecords || positionRecords.length === 0) return false;
    const sorted = [...positionRecords].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.id || 0) - (b.id || 0);
    });
    let positions = [];
    sorted.forEach(rec => {
        if (rec.date > dateStr) return; // 모임 날짜 이후의 임명/면직은 아직 반영 전으로 취급
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
};

window.isMandatoryMeeting = function (member, meeting, leaderProfile, memberRecords) {
    const effMember = (memberRecords && memberRecords.length > 0 && meeting && meeting.date)
        ? window.resolveMemberProfileAsOf(member, memberRecords, meeting.date)
        : member;

    if (effMember.status === 'inactive') return false;

    const mType = meeting.type || '';
    const mDistMatch = mType.match(/\d+/);
    const mDistNum = mDistMatch ? mDistMatch[0] : null;
    const memDistNum = (effMember.district || '').replace(/[^0-9]/g, '');
    const isGroupEligibleSister = effMember.bs === 'S' && (effMember.category === '어머니회' || effMember.category === '은장회');

    // 교회/교구 소속 확인 (구역모임·조모임·교구 단위 모임 모두 포함 — 전출자는 이전 교구 모임에서 제외)
    const effectiveChurch = meeting.leader_church_snapshot || (leaderProfile && leaderProfile.church) || null;
    const effectiveParish = meeting.leader_parish_snapshot || (leaderProfile && leaderProfile.parish) || null;
    if (effectiveChurch) {
        if ((effMember.church || '').trim() !== effectiveChurch.trim()) return false;
        if (effectiveChurch.trim() === '서울중앙교회' && effectiveParish &&
            (effMember.parish || '').trim() !== effectiveParish.trim()) return false;
    }

    // 구역모임: 구역 배정자 전원
    if (mType.includes('구역모임')) {
        return mDistNum ? (mDistNum === memDistNum) : (memDistNum.length > 0);
    }

    // 조모임(구역 단위, "전체조모임"은 제외): 어머니회/은장회 자매만
    if (mType.includes('조모임') && !mType.includes('전체조모임')) {
        if (!isGroupEligibleSister) return false;
        return mDistNum ? (mDistNum === memDistNum) : (memDistNum.length > 0);
    }

    // 교구 단위 모임: 전도대상자(member_status='evangelism') 제외
    const isParishMeeting = mType.includes('교구전체모임') || mType.includes('교구형제모임') || mType.includes('전체조모임') || mType.includes('교구임원모임') || mType.includes('청년');
    if (isParishMeeting && effMember.member_status === 'evangelism') return false;

    if (mType.includes('교구전체모임')) return true;
    if (mType.includes('교구형제모임')) return effMember.bs === 'B' && effMember.category === '봉사회';
    if (mType.includes('전체조모임')) return isGroupEligibleSister;
    if (mType.includes('교구임원모임')) return window.hasPositionAsOf(memberRecords, meeting.date);
    // id=270: 청년모임 참석률이 낮아 의도적으로 제외된 케이스로 확인됨 (2026-07-05 사용자 확인, 유지)
    if (mType.includes('청년') && effMember.category === '청년회' && effMember.id !== 270) return true;

    return false;
};
