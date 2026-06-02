# 대쉬보드 디자인 및 성도 목록 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대쉬보드에 메인 화면의 사이드바 디자인을 통합하고, 성도 카드에 출석률 정보를 추가하여 일관된 UI/UX를 제공합니다.

**Architecture:** `dashboard.html` 레이아웃을 `index.html`과 동일한 사이드바-메인 영역 구조로 변경합니다. `dashboard.js`에서 사이드바 필터와 대쉬보드 테이블 렌더링 로직을 결합하여 통합된 필터링 시스템을 구축합니다.

**Tech Stack:** HTML5, Tailwind CSS, Vanilla JavaScript (ES6+), SQLite3 (Backend)

---

### Task 1: HTML 레이아웃 구조 업데이트

**Files:**
- Modify: `public/dashboard.html`

- [ ] **Step 1: 상단 필터 바 제거 및 사이드바 구조 추가**
    - 기존 `<div class="bg-white border-b p-4 space-y-4">` 영역을 제거합니다.
    - `index.html`의 사이드바 구조(`aside#sidebar`)를 `header` 아래에 추가합니다.
    - 메인 테이블 컨테이너를 사이드바와 나란히 배치되도록 `flex` 구조로 감쌉니다.

```html
<!-- public/dashboard.html 수정 예시 -->
<body class="bg-gray-100 h-screen flex flex-col overflow-hidden">
    <!-- Header 유지 -->
    <header class="...">...</header>

    <div class="flex flex-1 overflow-hidden relative">
        <!-- index.html에서 복사한 Sidebar 추가 -->
        <aside id="sidebar" class="w-80 md:w-96 ...">
            <!-- 검색 및 필터 컨트롤 -->
            ...
            <div id="memberList" class="space-y-3">...</div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 p-4 overflow-auto">
            <!-- 기존의 attendanceTable 포함 -->
            ...
        </main>
    </div>
</body>
```

- [ ] **Step 2: 브라우저에서 레이아웃 확인**
    - `http://localhost:3000/dashboard.html` 접속하여 사이드바가 표시되는지 확인합니다.

---

### Task 2: 사이드바 및 필터 이벤트 연동

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: 사이드바 요소 변수 할당 및 이벤트 리스너 수정**
    - 기존 `districtFilter`, `categoryFilter`, `bsFilter` 변수를 사이드바의 요소 ID(`sidebarDistrictFilter` 등)로 업데이트합니다.
    - `memberSearch` 입력창에 대한 디바운스 검색 이벤트를 추가합니다.

```javascript
// public/js/dashboard.js 수정
const districtFilter = document.getElementById('sidebarDistrictFilter');
const categoryFilter = document.getElementById('sidebarCategoryFilter');
const bsFilter = document.getElementById('sidebarGenderFilter'); // index.html에서는 GenderFilter임
const searchInput = document.getElementById('memberSearch');

// 검색 이벤트 추가
let searchTimer;
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderAll, 300);
});

function renderAll() {
    renderTable();
    renderSidebarMemberList();
}
```

- [ ] **Step 2: 필터 변경 시 `renderAll` 호출 확인**
    - 사이드바 필터를 조작했을 때 `renderTable`이 다시 실행되는지 콘솔 로그 등으로 확인합니다.

---

### Task 3: 사이드바 성도 목록 렌더링 (출석률 포함)

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: `renderSidebarMemberList` 함수 구현**
    - `index.html`의 목록 렌더링 로직을 가져와서 `dashboard.js`에 맞게 수정합니다.
    - 각 카드 하단에 현재 `renderTable`에서 계산하는 출석률 배지 코드를 통합합니다.

```javascript
function renderSidebarMemberList() {
    const memberList = document.getElementById('memberList');
    // filteredMembers는 renderTable에서 사용되는 필터링된 목록 사용
    memberList.innerHTML = filteredMembers.map(member => {
        // 출석률 계산 로직 (renderTable에서 복사/추출 필요)
        const { attendCount, totalMandatory, ratePercent, rateClass } = calculateAttendanceStats(member);
        
        return `
            <div class="p-3 border rounded-xl bg-white shadow-sm mb-2">
                <div class="font-bold text-blue-800">${member.name}</div>
                <div class="text-[11px] text-gray-500">${member.district} | ${member.category}</div>
                <div class="mt-2">
                    <span class="attendance-rate-badge ${rateClass}">${attendCount}/${totalMandatory} (${ratePercent}%)</span>
                </div>
            </div>
        `;
    }).join('');
}
```

- [ ] **Step 2: 렌더링 결과 확인**
    - 사이드바에 성도 목록이 나타나고 출석률 정보가 올바르게 표시되는지 확인합니다.

---

### Task 4: 모바일 사이드바 토글 및 반응형 대응

**Files:**
- Modify: `public/dashboard.html`
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: 모바일 토글 버튼 및 스크립트 추가**
    - `index.html`에 있는 `toggleSidebar`, `closeSidebar` 버튼과 관련 이벤트를 `dashboard.html` 및 `js`에 추가합니다.

- [ ] **Step 2: 반응형 레이아웃 테스트**
    - 브라우저 너비를 줄여서 모바일 뷰에서 사이드바가 숨겨지고 버튼으로 열리는지 확인합니다.

---

### Task 5: 전체 기능 통합 및 최종 검증

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: 필터링 로직 일원화**
    - 검색어(`searchInput.value`)가 `renderTable`의 필터 조건에도 포함되도록 수정합니다.

- [ ] **Step 2: 최종 테스트**
    - 특정 이름을 검색했을 때 왼쪽 목록과 오른쪽 표가 동시에 해당 성도만 보여주는지 확인합니다.
    - 구역을 변경했을 때 두 영역이 일치하는지 확인합니다.
