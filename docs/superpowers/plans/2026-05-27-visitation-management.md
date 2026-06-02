# 심방 현황 관리 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구역별 성도들의 최근 심방 날짜, 경과일, 총 횟수를 한눈에 확인하고 관리할 수 있는 전용 페이지를 구축한다.

**Architecture:** 백엔드에서 성도 정보와 심방 기록을 JOIN하여 집계 데이터를 제공하는 API를 만들고, 프론트엔드에서 이를 구역별로 그룹화하여 렌더링한다.

**Tech Stack:** Node.js (Express), SQLite3, Vanilla JS, Tailwind CSS

---

### Task 1: 백엔드 심방 현황 조회 API 구현

**Files:**
- Modify: `server.js`

- [ ] **Step 1: `/api/visitation/status` 엔드포인트 추가**

`server.js` 하단에 다음 코드를 추가합니다.

```javascript
app.get('/api/visitation/status', async (req, res) => {
  const query = `
    SELECT 
      m.id, m.name, m.district, m.category, m.position,
      MAX(mt.date) as last_visitation,
      COUNT(mt.id) as total_count
    FROM members m
    LEFT JOIN attendance a ON m.id = a.member_id
    LEFT JOIN meetings mt ON a.meeting_id = mt.id AND mt.type = '심방'
    GROUP BY m.id
    ORDER BY m.name ASC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching visitation status:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});
```

- [ ] **Step 2: API 작동 확인**

서버 실행 후 `http://localhost:3000/api/visitation/status` 접속하여 JSON 데이터가 정상적으로 출력되는지 확인합니다.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add visitation status api"
```

---

### Task 2: 심방 현황 페이지 HTML 작성

**Files:**
- Create: `public/visitation_history.html`

- [ ] **Step 1: `public/visitation_history.html` 파일 생성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>심방 현황 관리</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>
<body class="bg-gray-50 min-h-screen">
    <nav class="bg-white shadow-sm sticky top-0 z-10">
        <div class="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
            <div class="flex items-center gap-3">
                <a href="/" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-arrow-left text-xl"></i>
                </a>
                <h1 class="text-xl font-black text-gray-800">심방 현황 관리</h1>
            </div>
            <div class="flex items-center gap-2">
                <span id="visitationCount" class="text-xs font-bold bg-blue-100 text-blue-600 px-3 py-1 rounded-full">로딩 중...</span>
            </div>
        </div>
    </nav>

    <main class="max-w-5xl mx-auto px-4 py-6">
        <!-- Filters -->
        <div class="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-wrap gap-4 items-center">
            <div class="flex-1 min-w-[200px]">
                <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">구역 선택</label>
                <select id="districtFilter" class="w-full border-gray-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                    <option value="전체">전체 구역</option>
                    <option value="581구역">581구역</option>
                    <option value="582구역">582구역</option>
                    <option value="583구역">583구역</option>
                </select>
            </div>
            <div class="flex-1 min-w-[200px]">
                <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">정렬</label>
                <select id="sortOption" class="w-full border-gray-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500">
                    <option value="name">이름순</option>
                    <option value="last_visitation">최근 심방순</option>
                    <option value="oldest">오래된 심방순</option>
                    <option value="count">심방 횟수순</option>
                </select>
            </div>
        </div>

        <!-- List Container -->
        <div id="visitationList" class="space-y-4">
            <!-- Content will be injected by JS -->
            <div class="flex justify-center py-20">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
        </div>
    </main>

    <script src="/js/visitation_history.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/visitation_history.html
git commit -m "feat: add visitation history html"
```

---

### Task 3: 심방 현황 페이지 JS 구현

**Files:**
- Create: `public/js/visitation_history.js`

- [ ] **Step 1: `public/js/visitation_history.js` 기본 구조 작성**

```javascript
document.addEventListener('DOMContentLoaded', () => {
    const visitationList = document.getElementById('visitationList');
    const districtFilter = document.getElementById('districtFilter');
    const sortOption = document.getElementById('sortOption');
    const visitationCount = document.getElementById('visitationCount');

    let allStatus = [];

    async function loadStatus() {
        try {
            const response = await fetch('/api/visitation/status');
            allStatus = await response.json();
            applyFilters();
        } catch (error) {
            console.error('Error loading visitation status:', error);
            visitationList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const district = districtFilter.value;
        const sort = sortOption.value;

        let filtered = allStatus.filter(s => {
            return district === '전체' || s.district === district;
        });

        // Sorting
        filtered.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'last_visitation') {
                if (!a.last_visitation) return 1;
                if (!b.last_visitation) return -1;
                return new Date(b.last_visitation) - new Date(a.last_visitation);
            }
            if (sort === 'oldest') {
                if (!a.last_visitation) return -1;
                if (!b.last_visitation) return 1;
                return new Date(a.last_visitation) - new Date(b.last_visitation);
            }
            if (sort === 'count') return b.total_count - a.total_count;
            return 0;
        });

        renderList(filtered);
    }

    function renderList(data) {
        visitationCount.textContent = `총 ${data.length}명 관리 중`;
        
        if (data.length === 0) {
            visitationList.innerHTML = '<p class="text-gray-500 text-center py-20 font-medium">조회된 성도가 없습니다.</p>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        visitationList.innerHTML = data.map(member => {
            let statusHtml = '';
            let daysDiff = null;

            if (member.last_visitation) {
                const lastDate = new Date(member.last_visitation);
                lastDate.setHours(0, 0, 0, 0);
                daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                
                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-teal-600 font-bold text-sm">${member.last_visitation}</span>
                        <span class="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded border border-teal-100 font-bold">${daysDiff}일 전</span>
                    </div>
                `;
            } else {
                statusHtml = `<span class="text-red-400 font-bold text-sm italic">심방 기록 없음</span>`;
            }

            return `
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex items-center p-4 hover:border-blue-300 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-lg font-black text-gray-800">${member.name}</span>
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">${member.district} | ${member.category}</span>
                        </div>
                        ${statusHtml}
                    </div>
                    <div class="flex flex-col items-end gap-2 shrink-0">
                        <div class="text-xs font-bold text-gray-400">누적 <span class="text-blue-600">${member.total_count}</span>회</div>
                        <button onclick="location.href='/?date=${new Date().toISOString().split('T')[0]}&type=심방&target=${member.id}'" 
                                class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-600 hover:text-white transition-colors">
                            심방 기록
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    districtFilter.addEventListener('change', applyFilters);
    sortOption.addEventListener('change', applyFilters);

    loadStatus();
});
```

- [ ] **Step 2: Commit**

```bash
git add public/js/visitation_history.js
git commit -m "feat: implement visitation history js logic"
```

---

### Task 4: 메인 사이드바에 링크 추가

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: 사이드바 메뉴에 '심방 현황 관리' 추가**

`public/index.html`의 '설교 현황' 메뉴 근처에 다음 링크를 추가합니다.

```html
                <a href="/visitation_history.html" class="flex items-center space-x-3 p-3 rounded-lg hover:bg-blue-50 text-gray-700 hover:text-blue-600 transition group">
                    <div class="bg-teal-100 p-2 rounded-lg group-hover:bg-teal-200 transition">
                        <i class="fas fa-hand-holding-heart text-teal-600"></i>
                    </div>
                    <span class="font-bold">심방 현황 관리</span>
                </a>
```

- [ ] **Step 2: 동작 확인**

메인 페이지에서 사이드바를 열어 '심방 현황 관리' 버튼이 잘 보이는지, 클릭 시 해당 페이지로 잘 이동하는지 확인합니다.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat: add link to visitation history in sidebar"
```
