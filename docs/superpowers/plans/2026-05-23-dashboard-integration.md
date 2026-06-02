# Dashboard Member Info Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate detailed member information into the first column of the dashboard table in `public/js/dashboard.js` and remove any obsolete sidebar rendering logic.

**Architecture:** Update the `renderTable` function to include more member details (age, badges, district, category, family relations, church service, and attendance rate) in the first column. Ensure proper styling with Tailwind CSS for readability.

**Tech Stack:** JavaScript (ES6+), Tailwind CSS

---

### Task 1: Update `renderTable` first column

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: Update the first column of the table in `renderTable`**

Modify the `filteredMembers.forEach` loop to use the new HTML structure for the first `<td>`.

```javascript
        filteredMembers.forEach(member => {
            const age = getAge(member.birth_year);
            const { attendCount, totalMandatory, ratePercent, rateClass } = calculateAttendanceStats(member, filteredMeetings);
            const positionBadges = getPositionBadges(member);
            
            let row = `<tr class="hover:bg-blue-50 transition-colors" id="member-row-${member.id}">
                <td class="sticky-col p-3 border member-info bg-white align-top">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="font-bold text-blue-800 text-[15px]">${member.name}</span>
                            <span class="text-[11px] text-gray-500 font-bold ml-1">(${age}세)</span>
                            ${positionBadges}
                        </div>
                        <div class="text-[11px] font-bold px-1.5 py-0.5 rounded ${member.bs === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${member.bs || '-'}</div>
                    </div>
                    <div class="text-[12px] text-gray-700 font-bold mb-1">
                        <span class="text-blue-700 font-black">${member.district || ''}</span> | ${member.category || ''}
                    </div>
                    ${member.family_relation ? `<div class="text-[11px] text-gray-600 mt-1 font-bold italic">가족: ${member.family_relation}</div>` : ''}
                    ${member.church_service ? `<div class="text-[11px] text-green-800 font-black mt-1 mb-1">봉사: ${member.church_service}</div>` : ''}
                    <div class="mt-2">
                        <span class="attendance-rate-badge ${rateClass}">${attendCount}/${totalMandatory} (${ratePercent}%)</span>
                    </div>
                </td>`;
```

- [ ] **Step 2: Verify and remove obsolete code (if exists)**

Confirm `renderSidebarMemberList` and its call in `renderAll` are absent or remove them if present. (Already checked, but will double-check during implementation).

---

### Task 2: Verification

- [ ] **Step 1: Manually verify the dashboard rendering**

Since I cannot see the UI, I will verify the generated HTML string by adding a temporary log or checking the logic.
I will also run a small script to ensure no syntax errors were introduced.

- [ ] **Step 2: Run a test script to check dashboard API and JS logic**

I can create a small test script to simulate the data and check if `renderTable` (if it were exported) would work, or just verify the code structure.
Actually, I'll just verify the file content after the edit.
