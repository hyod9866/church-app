# Dashboard Sidebar Member List & Attendance Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a detailed sidebar member list with attendance stats in the dashboard and refactor existing code for consistency and maintainability.

**Architecture:** Logic for attendance calculation, position badges, and age calculation will be extracted into helper functions. Filtering logic will be unified into a single function used by both the table and sidebar.

**Tech Stack:** JavaScript (Vanilla), Tailwind CSS.

---

### Task 1: Refactor Helper Functions and Filtering Logic

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: Extract helper functions**
Move common logic for age, positions, and attendance stats into reusable functions inside the `DOMContentLoaded` listener.

```javascript
// Add these at the top of DOMContentLoaded in public/js/dashboard.js
function getAge(birthYear) {
    return birthYear ? (2026 - parseInt(birthYear) + 1) : '-';
}

function getPositionBadges(member) {
    const positions = (member.position || '').split(',').filter(p => p);
    positions.sort((a, b) => (a === '집사' ? -1 : b === '집사' ? 1 : 0));
    return positions.map(p => {
        const badgeClass = p === '집사' ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-yellow-100 text-yellow-800 border-yellow-200";
        return `<span class="${badgeClass} text-[10px] px-1 py-0 rounded border font-bold">${p}</span>`;
    }).join('');
}

function calculateAttendanceStats(member, filteredMeetings) {
    let attendCount = 0;
    let totalMandatory = 0;
    
    filteredMeetings.forEach(m => {
        const rec = member.attendance[m.id];
        let isMandatory = false;
        const mType = m.type || '';
        const mDistMatch = mType.match(/\d+/);
        const mDistNum = mDistMatch ? mDistMatch[0] : null;
        const memDistNum = (member.district || '').replace(/[^0-9]/g, '');

        if (mType.includes('구역모임') && mDistNum === memDistNum) isMandatory = true;
        else if (mType.includes('조모임') && mDistNum === memDistNum) isMandatory = true;
        else if (mType.includes('교구전체모임') || mType.includes('교구형제모임') || mType.includes('교구임원모임')) {
            if (mType.includes('임원') && (member.position || '').trim() === '') isMandatory = false;
            else isMandatory = true;
        }

        if (isMandatory) {
            totalMandatory++;
            if (rec && rec.is_present) attendCount++;
        } else {
            if (rec && rec.is_present) attendCount++;
        }
    });

    const ratePercent = totalMandatory > 0 ? Math.round((attendCount / totalMandatory) * 100) : 0;
    let rateClass = 'rate-low';
    if (ratePercent >= 80) rateClass = 'rate-high';
    else if (ratePercent >= 50) rateClass = 'rate-mid';

    return { attendCount, totalMandatory, ratePercent, rateClass };
}
```

- [ ] **Step 2: Implement unified filtering logic**
Create `getFilteredData` to handle all filtering and sorting.

```javascript
function getFilteredData() {
    const district = sidebarDistrictFilter.value;
    const category = sidebarCategoryFilter.value;
    const bs = sidebarGenderFilter.value;
    const query = (searchInput ? searchInput.value : '').trim();
    const selectedTypes = Array.from(document.querySelectorAll('.meeting-type-checkbox:checked')).map(cb => cb.value);

    const filteredMeetings = allData.meetings.filter(meeting => {
        const matchesType = selectedTypes.some(type => meeting.type.includes(type));
        if (!matchesType) return false;
        if (district === '전체') return true;
        const selectedDistNum = district.replace(/[^0-9]/g, '');
        const meetingDistMatch = meeting.type.match(/\d+/);
        if (meetingDistMatch) return meetingDistMatch[0] === selectedDistNum;
        return true;
    });

    const filteredMembers = allData.members.filter(member => {
        if ((member.position || '').includes('전도사')) return true;
        if (bs !== '전체' && member.bs !== bs) return false;
        if (district !== '전체') {
            const normFilterDist = district.replace(/[^0-9]/g, '');
            const normMemberDist = (member.district || '').replace(/[^0-9]/g, '');
            if (normFilterDist !== normMemberDist) return false;
        }
        if (category !== '전체') {
            const normFilterCat = category.replace(/회$/, '');
            const normMemberCat = (member.category || '').replace(/회$/, '');
            if (normFilterCat !== normMemberCat) return false;
        }
        if (query !== '' && !member.name.includes(query)) return false;
        return true;
    }).sort((a, b) => {
        if (a.bs !== b.bs) return (a.bs || 'Z').localeCompare(b.bs || 'Z');
        const distA = parseInt((a.district || '').replace(/[^0-9]/g, '')) || 999;
        const distB = parseInt((b.district || '').replace(/[^0-9]/g, '')) || 999;
        if (distA !== distB) return distA - distB;
        return a.name.localeCompare(b.name, 'ko');
    });

    return { filteredMembers, filteredMeetings };
}
```

- [ ] **Step 3: Commit**
```bash
git add public/js/dashboard.js
git commit -m "refactor: extract helper functions and unify filtering logic in dashboard.js"
```

---

### Task 2: Update Table and Sidebar Rendering

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: Update `renderTable` to use helpers**
Simplify `renderTable` by accepting filtered data and using the new helpers. Replace the old filtering and stats calculation code.

- [ ] **Step 2: Implement `renderSidebarMemberList`**
Render the detailed cards with attendance badges using the pre-filtered data.

- [ ] **Step 3: Update `renderAll`**
Connect everything by calling `getFilteredData()` and passing results to renderers.

- [ ] **Step 4: Commit**
```bash
git add public/js/dashboard.js
git commit -m "feat: update dashboard table and sidebar rendering with detailed cards and attendance stats"
```

---

### Task 3: Verification

- [ ] **Step 1: Manual verification**
1. Verify sidebar member list cards render with Name, Age, BS, District|Category, Attendance Rate, and Positions.
2. Verify table rows still render correctly.
3. Verify filters update both sidebar and table.
4. Verify sidebar card click scrolls to the table row.

- [ ] **Step 2: Commit**
```bash
git commit --allow-empty -m "test: verified dashboard sidebar and table consistency"
```
