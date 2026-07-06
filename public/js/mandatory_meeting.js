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

window.isMandatoryMeeting = function (member, meeting, leaderProfile, positionRecords) {
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
    if (mType.includes('교구임원모임')) return window.hasPositionAsOf(positionRecords, meeting.date);
    // id=270: 청년모임 참석률이 낮아 의도적으로 제외된 케이스로 확인됨 (2026-07-05 사용자 확인, 유지)
    if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

    return false;
};
