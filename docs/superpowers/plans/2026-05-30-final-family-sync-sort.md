# 가족 정렬 및 동기화 최종 완성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가족 그룹 내 모든 구성원을 연쇄적으로 동기화하고, 사용자 지침에 따른 엄격한 위계 정렬(부부 우선 > 직분 위계 > 솔로 카테고리)을 완성합니다.

**Architecture:** 
1. 서버: `syncFamilyLinks` 함수를 전면 개편하여 그룹 내 모든 구성원의 관계를 동적으로 추론하고 한꺼번에 업데이트하는 '연쇄 거울 동기화'를 구현합니다.
2. 클라이언트: `renderTable`의 정렬 로직을 개편하여 '부부 전체 블록'을 '솔로 전체 블록'보다 항상 상단에 배치하고, 각 블록 내부에서 직분 및 카테고리 위계를 적용합니다.

**Tech Stack:** Node.js, Express, SQLite, JavaScript (Vanilla)

---

### Task 1: 서버 연쇄 거울 동기화 엔진 최종 개편

**Files:**
- Modify: `server.js`

- [ ] **Step 1: syncFamilyLinks 함수 수정**
이름 매칭 시 공백 및 접미사를 제거한 핵심 이름(Core Name)을 사용하고, 그룹 내 모든 구성원 간의 관계를 지능적으로 추론하여 업데이트하도록 수정합니다.

```javascript
function syncFamilyLinks(memberId, memberName, memberBs, familyRelation, providedFid, callback) {
  if (!familyRelation) return callback(null, providedFid);
  const entries = familyRelation.split(',').map(s => s.trim()).filter(s => s);
  const inputMap = {}; // 핵심 성명 -> 관계 태그
  entries.forEach(e => { 
    const m = e.match(/^(.+?)\((.+?)\)$/); 
    if (m) inputMap[m[1].trim().replace(/[DBS P]$/i, '').trim()] = m[2]; 
  });
  
  const familyCoreNames = Object.keys(inputMap);
  if (familyCoreNames.length === 0) return callback(null, providedFid);

  const myNameCore = memberName.trim().replace(/[DBS P]$/i, '').trim();
  const allCoreNames = [myNameCore, ...familyCoreNames];
  
  // 이름 정규화 쿼리 (공백 및 접미사 제거 후 비교)
  const queryConditions = allCoreNames.map(() => `REPLACE(REPLACE(REPLACE(REPLACE(TRIM(name), 'D', ''), 'B', ''), 'S', ''), 'P', '') = ?`).join(' OR ');

  db.all(`SELECT id, name, bs, family_id FROM members WHERE (${queryConditions}) AND status = 'active'`, allCoreNames, (err, groupMembers) => {
    if (err) return callback(err);
    
    const meId = parseInt(memberId);
    let fid = (providedFid && providedFid !== 'null' && providedFid !== '') ? parseInt(providedFid) : null;
    if (!fid) {
        const ex = groupMembers.find(m => m.family_id !== null && m.family_id !== '');
        if (ex) fid = parseInt(ex.family_id);
    }
    
    const finalizeSync = (targetFid) => {
      const tasks = [];
      groupMembers.forEach(target => {
        const others = groupMembers.filter(o => o.id !== target.id);
        const rels = others.map(other => {
          const targetCore = target.name.replace(/[DBS P]$/i, '').trim();
          const otherCore = other.name.replace(/[DBS P]$/i, '').trim();
          
          let r = '기타';
          if (target.id === meId) {
            r = inputMap[otherCore] || '기타';
          } else if (other.id === meId) {
            r = getSymmetricRelation(inputMap[targetCore] || '기타');
          } else {
            const myRelToTarget = inputMap[targetCore] || '기타';
            const myRelToOther = inputMap[otherCore] || '기타';
            if (myRelToTarget.includes('남편') || myRelToTarget.includes('아내')) r = myRelToOther;
            else if (myRelToOther.includes('남편') || myRelToOther.includes('아내')) r = getSymmetricRelation(myRelToTarget);
          }
          return `${other.name.trim()}(${r})`;
        });
        tasks.push({ q: "UPDATE members SET family_id = ?, family_relation = ? WHERE id = ?", p: [targetFid, rels.join(', '), target.id] });
      });
      
      let i = 0;
      const run = () => { 
        if (i >= tasks.length) return callback(null, targetFid); 
        const t = tasks[i++]; 
        db.run(t.q, t.p, (err) => { run(); });
      };
      run();
    };

    if (!fid) db.get("SELECT MAX(family_id) as maxFid FROM members", (err, row) => finalizeSync((parseInt(row?.maxFid) || 0) + 1));
    else finalizeSync(fid);
  });
}
```

### Task 2: 성도 종합 데이터 관리 정렬 로직 개편

**Files:**
- Modify: `public/js/member_management.js`

- [ ] **Step 1: 정렬 위계 규칙 수정**
사용자 지침에 따라 '부부 전체 > 솔로 전체'를 최우선으로 하고, 내부 위계를 적용합니다.

```javascript
            filteredMembersData.sort((a, b) => {
                if (a.district !== b.district) return a.district.localeCompare(b.district);
                
                // Rule 1: 부부 블록 vs 솔로 블록 (부부가 무조건 위)
                if (a._isC !== b._isC) return a._isC ? -1 : 1;
                
                if (a._isC) {
                    // Rule 2: 부부 내 직분 위계 (교구장-집사-구역장-조장-구역총무-조총무-기타-일반)
                    if (a._gR !== b._gR) return a._gR - b._gR;
                    if (a._gKey !== b._gKey) return a._gKey.localeCompare(b._gKey);
                    // Rule 3: 부부 내 남편 우선
                    return a.bs === 'B' ? -1 : 1;
                } else {
                    // Rule 4: 솔로 내 직분 위계
                    if (a._rank !== b._rank) return a._rank - b._rank;
                    // Rule 5: 솔로 내 회별 순서 (봉사-어머니-청년-은장)
                    if (a._catRank !== b._catRank) return a._catRank - b._catRank;
                    
                    const birthA = a.birth_year ? parseInt(a.birth_year) : 9999;
                    const birthB = b.birth_year ? parseInt(b.birth_year) : 9999;
                    if (birthA !== birthB) return birthA - birthB;
                    return a.name.localeCompare(b.name);
                }
            });
```

### Task 3: 최종 검증 및 데이터 정제

**Files:**
- Run: 임시 스크립트

- [ ] **Step 1: 모든 데이터의 family_id 강제 타입 교정**
모든 데이터를 숫자로 통발시키고 잘못된 태그를 정제합니다.

```javascript
// force_final_clean.cjs
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.serialize(() => {
    db.run("UPDATE members SET family_id = CAST(family_id AS INTEGER) WHERE family_id IS NOT NULL AND family_id != ''");
    db.run("UPDATE members SET family_id = NULL WHERE family_id = 0 OR family_id = '' OR family_id = 'null'");
    console.log("Data cleaned.");
});
```
