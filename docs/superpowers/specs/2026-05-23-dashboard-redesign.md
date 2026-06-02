# Design Doc: Dashboard Sidebar Member List & Attendance Stats Refactoring

## 1. Goal
The objective is to enhance the dashboard sidebar by rendering a detailed member list that includes attendance statistics, while refactoring the existing code to eliminate duplication and ensure consistency between the main table and the sidebar.

## 2. Proposed Changes

### 2.1. Helper Functions
I will introduce three helper functions within the `DOMContentLoaded` listener in `public/js/dashboard.js`:
- `calculateAttendanceStats(member, filteredMeetings)`: Extracts the attendance logic from `renderTable`. Returns `{ attendCount, totalMandatory, ratePercent, rateClass }`.
- `getPositionBadges(member)`: Standardizes the generation of position badge HTML (e.g., '집사').
- `getAge(birthYear)`: Standardizes age calculation.

### 2.2. Unified Filtering Logic
- `getFilteredData()`: A new function that returns `{ filteredMembers, filteredMeetings }` based on current UI filter states (District, Category, Gender, Meeting Types, and Search query).
- This function will be used by both `renderTable` and `renderSidebarMemberList`.

### 2.3. Updated Render Functions
- `renderTable(filteredMembers, filteredMeetings)`: Now accepts pre-filtered data and uses helper functions.
- `renderSidebarMemberList(filteredMembers, filteredMeetings)`: 
    - Renders member cards in the sidebar.
    - Card design: `bg-white`, `border`, `rounded-xl`, `p-3`, `shadow-sm`, `mb-2`, `hover:bg-blue-50`.
    - Content: Name, Age, BS badge, District | Category, Attendance Rate Badge, and Position Badges.
    - Behavior: `onclick` scrolls the main table to the corresponding member row.

### 2.4. Control Flow
- `renderAll()` will call `getFilteredData()` once and pass the results to both `renderTable` and `renderSidebarMemberList`.

## 3. Visual Design (Sidebar Card)
The card will look like this (conceptual HTML):
```html
<div class="p-3 border rounded-xl hover:bg-blue-50 cursor-pointer transition member-item shadow-sm bg-white mb-2" onclick="...">
    <div class="flex justify-between items-start mb-1">
        <div class="flex items-center">
            <span class="font-bold text-blue-800 text-sm">${m.name}</span>
            <span class="text-[10px] text-gray-400 font-normal ml-1">(${age}세)</span>
        </div>
        <div class="text-[10px] font-bold px-1.5 py-0.5 rounded ${bsClass}">${m.bs}</div>
    </div>
    <div class="text-[11px] text-gray-500 mb-2">
        <span class="font-bold text-gray-700">${m.district}</span> | ${m.category}
    </div>
    <div class="flex items-center justify-between">
        <div class="attendance-rate-badge ${rateClass}">
            ${attendCount}/${totalMandatory} (${ratePercent}%)
        </div>
        <div class="flex gap-1">${positionBadges}</div>
    </div>
</div>
```

## 4. Acceptance Criteria
- Sidebar member list renders with detailed cards.
- Attendance statistics are displayed on both the table and sidebar.
- Code is refactored to avoid duplication.
- Filtering in the sidebar matches the table.
- Clicking a sidebar card scrolls to the table row.
