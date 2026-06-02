# 설교 현황 배지 개선 및 디자인 통일 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설교 현황 목록의 배지 색상을 달력과 통일하고, 오늘 이후의 설교에 '예정' 강조 배지를 추가합니다.

**Architecture:** `public/js/sermon_history.js`의 `renderSermons` 함수를 수정하여 동적으로 배지 HTML을 생성합니다. Tailwind CSS를 사용하여 스타일을 적용하며, JavaScript의 `Date` 객체를 사용하여 오늘 날짜와 비교합니다.

**Tech Stack:** JavaScript, HTML (Vanilla), Tailwind CSS

---

### Task 1: 배지 색상 매핑 함수 및 예정 여부 판단 로직 구현

**Files:**
- Modify: `public/js/sermon_history.js`

- [ ] **Step 1: 모임 종류별 색상 매핑 유틸리티 함수 추가**

`loadSermons` 함수 위에 다음 함수를 추가합니다.

```javascript
const getBadgeStyles = (type) => {
    if (type === '설교') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (type.includes('조모임')) return 'bg-pink-100 text-pink-800 border-pink-200';
    if (type.includes('구역모임')) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (type.includes('형제')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (type.includes('청년')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (type.includes('봉사')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    // 교구전체, 임원, 기타 등
    return 'bg-sky-100 text-sky-800 border-sky-200';
};
```

- [ ] **Step 2: 예정 여부 판단 함수 추가**

```javascript
const isUpcoming = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const meetingDate = new Date(dateStr);
    meetingDate.setHours(0, 0, 0, 0);
    return meetingDate > today;
};
```

---

### Task 2: 설교 목록 렌더링 로직 업데이트

**Files:**
- Modify: `public/js/sermon_history.js:renderSermons`

- [ ] **Step 1: `renderSermons` 내 배지 생성 로직 교체**

기존 `typeBadge` 생성 부분을 아래와 같이 수정합니다.

```javascript
        sermonList.innerHTML = sermons.map(sermon => {
            const date = new Date(sermon.start);
            const formattedDate = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
            
            // 배지 스타일 결정
            const badgeClass = getBadgeStyles(sermon.type);
            const displayType = sermon.type === '설교' ? '외부/개인' : sermon.type;
            
            const typeBadge = `<span class="${badgeClass} px-2 py-0.5 rounded text-[10px] font-bold border">${displayType}</span>`;
            
            // 예정 배지 추가 (날짜 비교)
            const upcomingBadge = isUpcoming(sermon.start) 
                ? `<span class="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm animate-pulse ml-1">예정</span>` 
                : '';

            return `
                <div class="sermon-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row">
                    <div class="bg-gray-50 md:w-32 p-3 flex flex-col justify-center items-center border-b md:border-b-0 md:border-r border-gray-100 shrink-0">
                        <span class="text-xs font-bold text-gray-400 mb-0.5">${date.getFullYear()}</span>
                        <span class="text-xl font-black text-blue-600">${date.getMonth() + 1}/${date.getDate()}</span>
                    </div>
                    <div class="p-4 flex-1">
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
                            <div class="flex-1">
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">${sermon.sermon_title || sermon.title}</h3>
                                ${sermon.title !== sermon.sermon_title ? `<p class="text-xs text-gray-500 mt-1">${sermon.title}</p>` : ''}
                            </div>
                            <div class="flex items-center gap-1 shrink-0">
                                ${typeBadge}
                                ${upcomingBadge}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
```

---

### Task 3: 최종 검증

- [ ] **Step 1: 서버 재구동 확인 (3000번)**

`node server.js`가 실행 중인지 확인합니다.

- [ ] **Step 2: 브라우저에서 설교 현황 확인**

`http://localhost:3000/sermon_history.html`에 접속하여 다음 사항을 확인합니다.
1. 구역모임, 조모임 등 배지 색상이 달력과 동일하게 바뀌었는지 확인.
2. 미래 날짜의 설교에 파란색 '예정' 배지가 반짝이며 나타나는지 확인.
3. 기존 검색 및 필터 기능이 정상적으로 작동하는지 확인.
