/* ===== 출석/간증 2단계 모드 공용 헬퍼 (ATT-MODE-UX) =====
   - '출석 체크' 모드: 이름만 컴팩트 그리드, 탭하면 출석 토글
   - '간증 입력' 모드: 출석자만 표시, 탭하면 하단 패널에서 간증 입력 (이전/다음 순차 이동)
   - index.html(app.js)과 다른 페이지(meeting_editor.js) 양쪽에서 공유 */
(function () {
    if (window.__attModeUXLoaded) return;
    window.__attModeUXLoaded = true;

    window.__attMode = 'check';
    window.__attCurrentRowId = null;
    window.__attMeetingId = null; // 간증 즉시 저장용 (반복 일정 인스턴스 편집 시엔 null)

    const $id = (id) => document.getElementById(id);
    const mainRows = () => Array.from(document.querySelectorAll('#attendanceList .attendance-row'));
    const presentRows = () => mainRows().filter(r => r.dataset.present === 'true');
    const rowTestInput = (row) => row.querySelector('.testimony-input');

    // ── 간증 즉시 저장 ──
    // 저장하기 버튼을 안 누르고 모달을 닫아도 간증이 유실되지 않도록,
    // 입력 후 잠시 쉬거나 다른 사람으로 이동/패널 닫기 시 서버에 바로 반영한다.
    let panelBaseline = '';   // 패널 오픈(또는 마지막 저장) 시점 값 — 변경 감지용
    let autoSaveTimer = null;

    function flushTestimonyAutoSave() {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        const rowId = window.__attCurrentRowId;
        const mid = window.__attMeetingId;
        if (!rowId || !mid) return;
        const row = mainRows().find(r => r.dataset.id === rowId);
        if (!row) return;
        const t = rowTestInput(row);
        if (!t) return;
        const val = t.value.trim();
        if (val === panelBaseline) return; // 변경 없음
        panelBaseline = val;
        fetch('/api/attendance/testimony', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ member_id: parseInt(rowId, 10), meeting_id: mid, testimony: val })
        }).then(r => {
            const s = $id('testimonyPanelSaved');
            if (s && r.ok && window.__attCurrentRowId === rowId) s.classList.remove('hidden');
        }).catch(() => { /* 실패해도 숨은 input에 값이 남아 있어 저장하기 버튼으로 복구 가능 */ });
    }

    const TAB_ACTIVE = ['bg-white', 'dark:bg-slate-700', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm'];
    const TAB_INACTIVE = ['text-slate-500', 'dark:text-slate-400'];

    // 간증 유무 점(dot) 표시 갱신
    window.attUpdateDot = function (row) {
        if (!row) return;
        const dot = row.querySelector('.testimony-dot');
        const inp = rowTestInput(row);
        if (dot && inp) dot.classList.toggle('hidden', !inp.value.trim());
    };

    // 현재 모드에 맞춰 행 표시/숨김 적용 (간증 모드 = 출석자만)
    window.attApplyModeFilter = function () {
        const mode = window.__attMode;
        const rows = mainRows();
        rows.forEach(r => r.classList.toggle('hidden', mode === 'testimony' && r.dataset.present !== 'true'));
        // 구역 그룹: 보이는 행이 하나도 없는 그룹은 헤더째 숨김
        document.querySelectorAll('#attendanceList .att-district-group').forEach(g => {
            const anyVisible = Array.from(g.querySelectorAll('.attendance-row')).some(r => !r.classList.contains('hidden'));
            g.classList.toggle('hidden', !anyVisible);
        });
        const hint = $id('testimonyModeHint');
        if (hint) {
            const showHint = mode === 'testimony' && presentRows().length === 0;
            hint.classList.toggle('hidden', !showHint);
        }
    };

    window.attSetMode = function (mode) {
        window.__attMode = mode;
        const checkBtn = $id('attModeCheckBtn');
        const testBtn = $id('attModeTestimonyBtn');
        if (checkBtn && testBtn) {
            const on = mode === 'check' ? checkBtn : testBtn;
            const off = mode === 'check' ? testBtn : checkBtn;
            on.classList.add(...TAB_ACTIVE); on.classList.remove(...TAB_INACTIVE);
            off.classList.remove(...TAB_ACTIVE); off.classList.add(...TAB_INACTIVE);
        }
        window.attApplyModeFilter();
        if (mode === 'check') window.attCloseTestimonyPanel();
    };

    window.attOpenTestimonyPanel = function (row) {
        const panel = $id('testimonyPanel');
        if (!panel || !row) return;
        flushTestimonyAutoSave(); // 이전 사람 간증 즉시 저장
        document.querySelectorAll('#attendanceList .attend-chip.att-editing')
            .forEach(c => c.classList.remove('att-editing', 'ring-2', 'ring-amber-400'));
        window.__attCurrentRowId = row.dataset.id;
        const chip = row.querySelector('.attend-chip');
        if (chip) chip.classList.add('att-editing', 'ring-2', 'ring-amber-400');
        const nameEl = row.querySelector('.att-name');
        const nEl = $id('testimonyPanelName'); if (nEl) nEl.textContent = nameEl ? nameEl.textContent : '';
        const distEl = row.querySelector('.attend-district');
        const dEl = $id('testimonyPanelDistrict'); if (dEl) dEl.textContent = row.dataset.district || (distEl ? distEl.textContent : '');
        const list = presentRows();
        const idx = list.indexOf(row);
        const pEl = $id('testimonyPanelPos'); if (pEl) pEl.textContent = idx >= 0 ? `${idx + 1}/${list.length}` : '';
        const input = $id('testimonyPanelInput');
        const t = rowTestInput(row);
        if (input) { input.value = t ? t.value : ''; }
        panelBaseline = (t ? t.value : '').trim();
        const savedEl = $id('testimonyPanelSaved');
        if (savedEl) savedEl.classList.add('hidden');
        panel.classList.remove('hidden');
        if (input) input.focus();
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    window.attCloseTestimonyPanel = function () {
        flushTestimonyAutoSave(); // 닫기 전 즉시 저장
        const panel = $id('testimonyPanel');
        if (panel) panel.classList.add('hidden');
        window.__attCurrentRowId = null;
        document.querySelectorAll('#attendanceList .attend-chip.att-editing')
            .forEach(c => c.classList.remove('att-editing', 'ring-2', 'ring-amber-400'));
    };

    // 이전/다음 출석자로 이동 (dir: -1 | 1, 끝에서 순환)
    window.attNav = function (dir) {
        const list = presentRows();
        if (!list.length) return;
        let idx = list.findIndex(r => r.dataset.id === window.__attCurrentRowId);
        idx = idx === -1 ? 0 : (idx + dir + list.length) % list.length;
        window.attOpenTestimonyPanel(list[idx]);
    };

    // ── 저장 안 된 변경 감지 (모달 닫기 가드) ──
    // 메모/출석 체크가 저장 없이 닫히며 유실되는 사고 방지.
    // 간증은 자동 저장되므로(__attMeetingId 있을 때) 비교에서 제외한다.
    function computeModalState() {
        const memoEl = $id('meetingMemo');
        const titleEl = $id('meetingTitle');
        const sermonEl = $id('meetingSermon');
        const includeTestimony = !window.__attMeetingId;
        const rows = Array.from(document.querySelectorAll('.attendance-row')).map(r => {
            const t = r.querySelector('.testimony-input');
            return `${r.dataset.id}:${r.dataset.present}${includeTestimony ? ':' + (t ? t.value : '') : ''}`;
        }).join('|');
        return [memoEl ? memoEl.value : '', titleEl ? titleEl.value : '', sermonEl ? sermonEl.value : '', rows].join('¶');
    }

    window.attSnapshotModalState = function () {
        window.__attModalSnapshot = computeModalState();
    };

    window.attModalDirty = function () {
        const modal = $id('meetingModal');
        if (!modal || modal.classList.contains('hidden')) return false;
        if (window.__attModalSnapshot == null) return false;
        return computeModalState() !== window.__attModalSnapshot;
    };

    // 닫기 핸들러가 두 모듈(app.js/meeting_editor.js)에서 같은 클릭에 연달아 불려도 confirm은 한 번만.
    // 같은 이벤트 디스패치 내 핸들러들은 동기 실행되므로 setTimeout(0)으로 클릭 단위 래치를 건다.
    window.attConfirmDiscardIfDirty = function () {
        if (!window.attModalDirty()) return true;
        if (window.__attDiscardPending) return window.__attDiscardPending.ok;
        const ok = confirm('저장하지 않은 변경사항이 있습니다.\n저장하지 않고 닫을까요?');
        window.__attDiscardPending = { ok };
        setTimeout(() => { window.__attDiscardPending = null; }, 0);
        return ok;
    };

    // 탭/패널 이벤트 바인딩 (onclick 대입이라 중복 호출해도 안전)
    window.initAttendanceModeUX = function () {
        const checkBtn = $id('attModeCheckBtn');
        const testBtn = $id('attModeTestimonyBtn');
        if (checkBtn) checkBtn.onclick = () => window.attSetMode('check');
        if (testBtn) testBtn.onclick = () => window.attSetMode('testimony');
        const input = $id('testimonyPanelInput');
        if (input) {
            input.oninput = () => {
                const row = mainRows().find(r => r.dataset.id === window.__attCurrentRowId);
                if (!row) return;
                const t = rowTestInput(row);
                if (t) t.value = input.value;
                window.attUpdateDot(row);
                const savedEl = $id('testimonyPanelSaved');
                if (savedEl) savedEl.classList.add('hidden');
                if (window.__attMeetingId) {
                    if (autoSaveTimer) clearTimeout(autoSaveTimer);
                    autoSaveTimer = setTimeout(flushTestimonyAutoSave, 1200); // 입력 멈추면 자동 저장
                }
            };
            input.onblur = () => flushTestimonyAutoSave();
            input.onkeydown = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); window.attNav(1); }
            };
        }
        const prev = $id('testimonyPrevBtn');
        const next = $id('testimonyNextBtn');
        const close = $id('testimonyPanelClose');
        if (prev) prev.onclick = () => window.attNav(-1);
        if (next) next.onclick = () => window.attNav(1);
        if (close) close.onclick = () => window.attCloseTestimonyPanel();
    };
})();
/* ===== /ATT-MODE-UX ===== */

(function() {
// Global Meeting Editor Module
// Provides the exact same edit modal UX as index.html for all pages

let currentMeetingId = null;
let extraAttendees = [];
let selectedChurch = '';
let currentSermonTagsList = [];
let currentMeetingData = null;
let clickedInstanceDate = null;
let editorSaveCallback = null;
let editorDeleteCallback = null;

// HTML Elements Injection
function injectEditorElements() {
    // 1. Inject meetingModal into meetingPanelsContainer if not exists
    const container = document.getElementById('meetingPanelsContainer');
    if (container && !document.getElementById('meetingModal')) {
        const modalHTML = `
        <!-- Add/Edit Meeting Panel -->
        <div id="meetingModal" class="flex-1 flex flex-col h-full min-h-0 overflow-hidden hidden">
            <div class="p-4 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex justify-between items-center shadow-md">
                <h3 id="modalTitle" class="font-black text-sm md:text-base">새 모임 만들기</h3>
                <button id="closeModal" class="text-slate-400 hover:text-white transition-colors duration-150 cursor-pointer"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
            </div>
            <div class="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar bg-slate-50/20 dark:bg-[#0B0F19]/60">
                <div class="grid grid-cols-2 gap-4">
                    <div class="col-span-2" id="meetingTitleField"><label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">모임 명칭</label><input type="text" id="meetingTitle" class="w-full border-b border-slate-300 dark:border-slate-700/60 focus:border-blue-500 bg-transparent outline-none py-1.5 text-base md:text-lg font-black transition-colors dark:text-slate-100 dark:placeholder-slate-500" placeholder="예: 581구역모임"></div>
                    <div>
                        <label id="meetingDateLabel" class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">날짜</label>
                        <input type="date" id="meetingDate" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30">
                    </div>
                    <div><label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">구분</label><div class="flex gap-1.5"><select id="meetingCategory" class="flex-1 min-w-0 border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-2.5 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none cursor-pointer transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30"></select><select id="meetingNumber" aria-label="번호" class="hidden w-20 shrink-0 border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-2.5 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none cursor-pointer transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30"></select></div><input type="hidden" id="meetingType" value=""></div>
                    <div id="sermonTagsField" class="col-span-2 hidden">
                        <label class="text-[10px] font-black text-slate-450 block mb-1.5 uppercase tracking-wider">설교 구분 태그</label>
                        <div class="flex flex-wrap gap-1.5" id="sermonTagsList">
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="청년회토요교제">#청년회토요교제</button>
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="교회학교공과">#교회학교공과</button>
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="시설부">#시설부</button>
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="직장인모임">#직장인모임</button>
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="새신자말씀">#새신자말씀</button>
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="새신자부봉사자말씀">#새신자부봉사자말씀</button>
                            <button type="button" class="sermon-tag px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700/60 transition duration-150 cursor-pointer" data-value="직접입력">#직접입력</button>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-[10px] font-black text-slate-400 block uppercase tracking-wider">시작 시간</label>
                            <label class="flex items-center gap-1.5 text-[10px] font-black text-blue-600 cursor-pointer">
                                <input type="checkbox" id="isAllDayEvent" class="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500/25 border-slate-300"> 종일
                            </label>
                        </div>
                        <input type="time" id="meetingStartTime" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30">
                    </div>
                    <div id="meetingEndTimeField">
                        <label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">종료 시간</label>
                        <input type="time" id="meetingEndTime" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30">
                    </div>
                    <div id="meetingEndDateField" class="hidden col-span-2">
                        <div class="flex justify-between items-center mb-1">
                            <label class="text-[10px] font-black text-slate-400 block uppercase tracking-wider">종료일</label>
                            <label class="flex items-center gap-1.5 text-[10px] font-black text-blue-600 cursor-pointer">
                                <input type="checkbox" id="isSameDayEvent" class="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500/25 border-slate-300"> 당일행사
                            </label>
                        </div>
                        <input type="date" id="meetingEndDate" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30">
                    </div>
                    <div id="meetingRecurrenceSection" class="col-span-2 grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                        <div>
                            <label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">반복 설정</label>
                            <select id="meetingRecurrence" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-2.5 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none cursor-pointer transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30">
                                <option value="none">반복 안함</option>
                                <option value="weekly">매주 반복</option>
                                <option value="monthly">매월 반복</option>
                                <option value="yearly">매년 반복</option>
                            </select>
                        </div>
                        <div id="recurrenceEndDateField" class="hidden">
                            <label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">반복 종료일</label>
                            <input type="date" id="meetingRecurrenceEndDate" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30">
                        </div>
                    </div>
                </div>
                <div id="sermonSection">
                <div><label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">설교 제목</label><input type="text" id="meetingSermon" placeholder="설교 제목을 입력하세요..." class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-amber-50/50 dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30" autocomplete="off"></div>
                <div class="grid grid-cols-2 gap-4 mt-3">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">본문 성경</label>
                        <div class="relative">
                            <input type="text" id="meetingSermonBible" placeholder="성경 검색 (예: 창세, 마태)..." class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-amber-50/50 dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30" autocomplete="off">
                            <div id="meetingSermonBibleResults" class="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 hidden no-scrollbar"></div>
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">주제 태그 (엔터로 추가)</label>
                        <div id="sermonTagsContainer" class="flex flex-wrap gap-1.5 items-center w-full border border-slate-200 dark:border-slate-700/60 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 rounded-xl px-3 py-1.5 min-h-[38px] bg-amber-50/50 dark:bg-slate-800 shadow-sm transition duration-150 cursor-text">
                            <div id="sermonTagBadgesList" class="flex flex-wrap gap-1.5"></div>
                            <input type="text" id="meetingSermonTags" placeholder="태그 입력..." class="flex-1 min-w-[60px] border-none outline-none text-xs md:text-sm font-bold bg-transparent dark:text-slate-100 dark:placeholder-slate-500" autocomplete="off">
                        </div>
                    </div>
                </div>
                <div id="directSermonTagField" class="hidden"><label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">설교 태그 (직접 입력)</label><input type="text" id="directSermonTag" placeholder="태그를 직접 입력하세요..." class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-amber-50/50 dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30" autocomplete="off"></div>
                </div>
                <div id="memoField" class="hidden"><label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">메모</label><textarea id="meetingMemo" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm h-24 bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30"></textarea></div>
                
                <!-- 외부설교 시 교회 검색 섹션 -->
                <div id="churchSearchSection" class="hidden">
                    <label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">외부 교회 검색</label>
                    <div class="relative">
                        <input type="text" id="churchSearchInput" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-3 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30" placeholder="교회 이름 입력 (예: 파주)..." autocomplete="off">
                        <div id="churchSearchResults" class="absolute left-0 right-0 mt-1.5 max-h-40 overflow-y-auto bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 hidden no-scrollbar"></div>
                    </div>
                    <div id="selectedChurchContainer" class="mt-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-center justify-between hidden">
                        <span>선택된 교회: <span id="selectedChurchName">없음</span></span>
                        <button type="button" id="clearSelectedChurch" class="text-red-500 hover:text-red-700 font-bold">✕</button>
                    </div>
                </div>

                <div id="defaultAttendanceSection" class="min-h-[200px]"><div class="flex justify-between items-center mb-2.5"><div id="attModeTabs" class="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5"><button type="button" id="attModeCheckBtn" class="px-3 py-1.5 rounded-[10px] text-[11px] font-black transition-all">출석 체크</button><button type="button" id="attModeTestimonyBtn" class="px-3 py-1.5 rounded-[10px] text-[11px] font-black transition-all">간증 입력</button></div><span id="attendanceCount" class="text-[10px] font-black text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 px-2 py-0.5 rounded-full">0명 선택됨</span></div><p id="testimonyModeHint" class="hidden text-slate-400 italic text-xs text-center py-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 dark:text-slate-500 mb-2">아직 출석 체크된 사람이 없습니다.<br>'출석 체크' 탭에서 먼저 체크해 주세요.</p><div id="attendanceList" class="space-y-2 max-h-[600px] overflow-y-auto no-scrollbar"></div></div>
                <div id="extraAttendeesSection" class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 border-dashed"><div class="flex justify-between items-center mb-2.5"><h4 class="font-extrabold text-emerald-800 dark:text-emerald-450 text-sm">추가 인원</h4><button id="openExtraMemberSearch" class="text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-[0.98] transition-all px-2.5 py-1.5 rounded-xl shadow-sm">+ 성도 검색</button></div><div id="extraAttendanceList" class="space-y-2"><p class="text-slate-400 italic text-xs text-center py-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 dark:text-slate-500">없음</p></div></div>
                 <div id="counselingPanel" class="hidden space-y-4">
    <div class="relative">
        <div class="flex justify-between items-center mb-1.5">
            <label class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 block uppercase tracking-wider">상담 대상자 *</label>
            <label class="inline-flex items-center gap-1 cursor-pointer">
                <input type="checkbox" id="modalAnonymousCheck" class="rounded text-indigo-600 focus:ring-indigo-500 border-slate-350 w-3.5 h-3.5">
                <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400">익명으로 등록</span>
            </label>
        </div>
        <input type="text" id="modalCounselingName" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2.5 text-sm font-bold bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500" placeholder="이름을 입력하세요..." autocomplete="off">
        <div id="modalCounselingSuggestions" class="absolute left-0 right-0 mt-1 bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto hidden no-scrollbar"></div>
        <input type="hidden" id="modalCounselingMemberId" value="">
    </div>
    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700/40 space-y-3">
        <span class="block text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">성도 구분</span>
        <div>
            <span class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">소속</span>
            <div class="flex flex-wrap gap-1.5" id="modalCategoryBtns">
                <button type="button" data-val="봉사회" class="modal-cat-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">봉사회</button>
                <button type="button" data-val="청년회" class="modal-cat-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">청년회</button>
                <button type="button" data-val="어머니회" class="modal-cat-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">어머니회</button>
                <button type="button" data-val="은장회" class="modal-cat-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">은장회</button>
                <button type="button" data-val="모름" class="modal-cat-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">모름</button>
            </div>
            <input type="hidden" id="modalCounselingCategory" value="">
        </div>
        <div class="grid grid-cols-3 gap-3">
            <div>
                <span class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5" id="modalBsLabel">성별(형제/자매)</span>
                <div class="flex gap-1" id="modalBsBtns">
                    <button type="button" data-val="B" class="modal-bs-btn flex-1 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-center">형제</button>
                    <button type="button" data-val="S" class="modal-bs-btn flex-1 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-center">자매</button>
                </div>
                <input type="hidden" id="modalCounselingBs" value="">
            </div>
            <div>
                <span class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">상태</span>
                <div class="flex gap-1" id="modalMemberStatusBtns">
                    <button type="button" data-val="member" class="modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 transition-all text-center">성도</button>
                    <button type="button" data-val="evangelism" class="modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-center">전도대상</button>
                </div>
                <input type="hidden" id="modalCounselingMemberStatus" value="member">
            </div>
            <div>
                <span class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">상담 방식</span>
                <div class="flex gap-1" id="modalCounselMethodBtns">
                    <button type="button" data-val="대면" class="modal-method-btn flex-1 py-1 rounded-lg text-[11px] font-bold border border-indigo-500 bg-indigo-600 text-white transition-all text-center">대면</button>
                    <button type="button" data-val="전화" class="modal-method-btn flex-1 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all text-center">전화</button>
                </div>
                <input type="hidden" id="modalCounselingMethod" value="대면">
            </div>
        </div>
    </div>
    <div class="bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl p-3.5 border border-indigo-100 dark:border-indigo-900/30">
        <label class="block text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-2">상담 주제 태그 (복수 선택)</label>
        <div class="flex flex-wrap gap-1.5 mb-2.5" id="modalCounselTagBtns">
            <button type="button" data-tag="전도상담" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#전도상담</button>
            <button type="button" data-tag="구원확신/의심" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#구원확신/의심</button>
            <button type="button" data-tag="진로" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#진로</button>
            <button type="button" data-tag="이성" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#이성</button>
            <button type="button" data-tag="죄" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#죄</button>
            <button type="button" data-tag="자녀" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#자녀</button>
            <button type="button" data-tag="부부관계" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#부부관계</button>
            <button type="button" data-tag="가족" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#가족</button>
            <button type="button" data-tag="성경질문" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#성경질문</button>
            <button type="button" data-tag="이단" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#이단</button>
            <button type="button" data-tag="직장생활" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#직장생활</button>
            <button type="button" data-tag="결혼" class="mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">#결혼</button>
        </div>
        <div class="flex gap-2 items-center">
            <input type="text" id="modalCounselTagInput" class="flex-1 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 placeholder-slate-400" placeholder="직접 입력 (예: 재정, 직장 등)">
            <button type="button" id="modalAddCounselTag" class="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 transition-all whitespace-nowrap">+ 추가</button>
        </div>
        <div id="modalCounselTagsPreview" class="mt-2 flex flex-wrap gap-1.5 min-h-[20px]"></div>
        <input type="hidden" id="modalCounselingTags" value="">
    </div>
    <div>
        <label class="text-[10px] font-black text-slate-400 dark:text-slate-400 block mb-1.5 uppercase tracking-wider">상담 내용 *</label>
        <textarea id="modalCounselingContent" rows="5" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2.5 text-sm font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500" placeholder="상담한 핵심 내용을 작성하세요..."></textarea>
    </div>
    <div>
        <label class="text-[10px] font-black text-slate-400 dark:text-slate-400 block mb-1.5 uppercase tracking-wider">비고 / 기타 메모</label>
        <input type="text" id="modalCounselingRemark" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2.5 text-sm font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500" placeholder="기타 특이사항이나 비고를 입력하세요...">
    </div>
    <div class="bg-indigo-50/40 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/60 dark:border-indigo-900/20 space-y-3 mt-2">
        <div class="flex flex-wrap gap-x-4 gap-y-1.5">
            <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="modalCounselingSalvationCheck" class="rounded text-indigo-650 focus:ring-indigo-500 border-slate-350 w-4 h-4">
                <span class="text-xs font-black text-indigo-750 dark:text-indigo-400">구원받음 처리</span>
            </label>
            <label class="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="modalCounselingAssignCheck" class="rounded text-indigo-650 focus:ring-indigo-500 border-slate-350 w-4 h-4">
                <span class="text-xs font-black text-indigo-750 dark:text-indigo-400">교구/구역편입 처리</span>
            </label>
        </div>
        <div id="modalCounselingAssignSubPanel" class="hidden grid grid-cols-2 gap-2.5 mt-1.5 pt-2 border-t border-indigo-100/60 dark:border-indigo-900/30">
            <div class="col-span-2">
                <span class="block text-[10px] font-bold text-slate-400 mb-1">소속 교회</span>
                <input type="text" id="modalCounselingAssignChurch" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs font-bold bg-gray-50 dark:bg-slate-800 dark:text-slate-200 outline-none" value="서울중앙교회" readonly>
            </div>
            <div>
                <span class="block text-[10px] font-bold text-slate-400 mb-1">편입 교구</span>
                <select id="modalCounselingAssignParish" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none"></select>
            </div>
            <div>
                <span class="block text-[10px] font-bold text-slate-400 mb-1">편입 구역</span>
                <select id="modalCounselingAssignDistrict" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none"></select>
            </div>
        </div>
    </div>
</div>
            </div>
            <div id="testimonyPanel" class="hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131B2E] px-4 pt-3 pb-2 shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span id="testimonyPanelName" class="font-black text-sm text-slate-800 dark:text-slate-100 truncate"></span>
                        <span id="testimonyPanelDistrict" class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex-shrink-0"></span>
                        <span id="testimonyPanelPos" class="text-[10px] font-bold text-slate-400 dark:text-slate-500 flex-shrink-0"></span>
                        <span id="testimonyPanelSaved" class="hidden text-[9px] font-black text-emerald-500 flex-shrink-0">✓ 자동저장</span>
                    </div>
                    <div class="flex items-center gap-1.5 flex-shrink-0">
                        <button type="button" id="testimonyPrevBtn" class="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition-all">◀ 이전</button>
                        <button type="button" id="testimonyNextBtn" class="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-blue-600 text-white active:scale-95 transition-all">다음 ▶</button>
                        <button type="button" id="testimonyPanelClose" class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold">✕</button>
                    </div>
                </div>
                <input type="text" id="testimonyPanelInput" class="w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#1b253b] focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500" placeholder="간증/기록 입력 후 Enter 또는 '다음'..." autocomplete="off">
            </div>
            <div class="p-4 pb-6 md:pb-4 bg-slate-50 dark:bg-[#131B2E] border-t border-slate-100 dark:border-slate-800/50 flex gap-2.5"><button id="deleteMeeting" class="w-14 h-12 flex items-center justify-center bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/35 active:scale-[0.98] text-red-500 dark:text-red-400 rounded-xl transition-all hidden"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button><button id="cancelMeeting" class="flex-1 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700/60 py-3 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-300 active:scale-[0.98] transition-all">취소</button><button id="saveMeeting" class="flex-[2] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-black text-sm shadow-md active:scale-[0.98] transition-all">저장하기</button></div>
        </div>
        `;
        container.insertAdjacentHTML('beforeend', modalHTML);
    }

    // 2. Inject extraMemberSearchModal if not exists
    if (!document.getElementById('extraMemberSearchModal')) {
        const extraModalHTML = `
        <!-- Extra Member Search -->
        <div id="extraMemberSearchModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden z-[100] flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-100">
                <div class="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center shadow-md">
                    <h4 class="font-extrabold text-sm">추가 검색</h4>
                    <button id="closeExtraMemberModal" class="text-white/80 hover:text-white transition-colors duration-150 text-xl font-bold">×</button>
                </div>
                <div class="p-5 bg-slate-50/50">
                    <input type="text" id="extraMemberSearchInput" class="w-full border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-4 py-3 font-bold text-sm shadow-sm outline-none transition duration-150" placeholder="이름 입력...">
                    <div id="extraSearchResults" class="mt-4 max-h-60 overflow-y-auto space-y-2 no-scrollbar"></div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', extraModalHTML);
    }

    // 3. Inject recurrenceConfirmModal if not exists
    if (!document.getElementById('recurrenceConfirmModal')) {
        const recConfirmHTML = `
        <!-- Recurring Event Action Confirm Modal -->
        <div id="recurrenceConfirmModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden z-[200] flex items-center justify-center p-4">
            <div class="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 transform scale-95 transition-all duration-200">
                <div class="p-5 text-center">
                    <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/25 text-blue-600 flex items-center justify-center mx-auto mb-4">
                        <i class="fa-solid fa-arrows-spin text-xl"></i>
                    </div>
                    <h4 id="recurrenceModalTitle" class="text-base font-extrabold text-slate-800 mb-2">반복 일정 수정</h4>
                    <p id="recurrenceModalDesc" class="text-xs text-slate-500 mb-6 leading-relaxed">이 일정은 반복되는 모임의 일부입니다.<br>어떤 일정을 변경하시겠습니까?</p>
                    <div class="space-y-2.5">
                        <button id="recurrenceActionSingle" type="button" class="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-sm transition-all duration-150 active:scale-[0.98]">이 일정만 적용</button>
                        <button id="recurrenceActionAll" type="button" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl text-sm transition-all duration-150 active:scale-[0.98]">전체 일정 적용</button>
                        <button id="recurrenceActionCancel" type="button" class="w-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold py-2.5 rounded-xl text-xs transition-all duration-150">취소</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', recConfirmHTML);
    }
}

// Helpers
async function fetchChurches() { const res = await fetch('/api/churches'); return await res.json(); }

// Render sermon tags list inside meetingModal
function renderSermonTagBadges() {
    const list = document.getElementById('sermonTagBadgesList');
    if (!list) return;
    list.innerHTML = currentSermonTagsList.map((t, idx) => `
        <span class="px-2 py-1 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded text-[11px] font-bold flex items-center gap-1">
            #${t}
            <button type="button" onclick="removeSermonTag(${idx})" class="text-red-500 hover:text-red-700 font-black cursor-pointer text-[10px]">✕</button>
        </span>
    `).join('');
}

window.removeSermonTag = function(idx) {
    currentSermonTagsList.splice(idx, 1);
    renderSermonTagBadges();
};

function renderExtras() {
    const list = document.getElementById('extraAttendanceList');
    if (!list) return;
    if (!extraAttendees.length) { list.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 dark:text-slate-500">없음</p>'; return; }
    const EX_CHECK_SVG = `<svg class="w-2.5 h-2.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
    list.innerHTML = extraAttendees.map(m => {
        const isP = !!m.is_present;
        const test = (m.testimony_snapshot || '').replace(/"/g, '&quot;');
        const chipCls = isP
            ? 'bg-emerald-600 border-emerald-600 text-white'
            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
        const dotCls = isP ? 'bg-white border-white' : 'border-slate-300 dark:border-slate-600 opacity-50';
        const distCls = isP ? 'bg-emerald-500/70 text-emerald-50' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500';
        return `<div class="attendance-row mb-1" data-id="${m.id}" data-present="${isP}" data-extra="true">
            <div class="flex items-center gap-2">
                <button type="button" class="attend-chip flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all duration-150 active:scale-[0.98] ${chipCls}">
                    <span class="attend-dot w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${dotCls}">${isP ? EX_CHECK_SVG : ''}</span>
                    <span class="font-extrabold text-sm flex-1 text-left">${m.name}</span>
                    <span class="attend-district text-[10px] font-bold px-2 py-0.5 rounded-lg ${distCls}">${m.district || ''}</span>
                </button>
                <button type="button" class="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/20 text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-100 dark:border-red-900/30 transition-all flex-shrink-0" onclick="removeExtra(${m.id})">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="testimony-wrap ${isP ? '' : 'hidden'} px-1 pt-1.5 pb-0.5">
                <input type="text" class="testimony-input w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#1b253b] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/30 focus:border-blue-500" placeholder="간증/기록 입력..." value="${test}">
            </div>
        </div>`;
    }).join('');
    // 추가인원 칩 클릭 토글
    list.onclick = (e) => {
        if (e.target.closest('button[onclick]')) return; // 삭제 버튼 제외
        const chip = e.target.closest('.attend-chip');
        if (!chip) return;
        const row = chip.closest('.attendance-row');
        const nowPresent = row.dataset.present !== 'true';
        row.dataset.present = String(nowPresent);
        const dot = chip.querySelector('.attend-dot');
        const dist = chip.querySelector('.attend-district');
        const wrap = row.querySelector('.testimony-wrap');
        const EX_SVG = `<svg class="w-2.5 h-2.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
        if (nowPresent) {
            chip.classList.remove('bg-white', 'border-slate-200', 'text-slate-700');
            chip.classList.add('bg-emerald-600', 'border-emerald-600', 'text-white');
            dot.classList.remove('border-slate-300', 'opacity-50');
            dot.classList.add('bg-white', 'border-white');
            dot.innerHTML = EX_SVG;
            dist.classList.remove('bg-slate-100', 'text-slate-400');
            dist.classList.add('bg-emerald-500/70', 'text-emerald-50');
            wrap.classList.remove('hidden');
        } else {
            chip.classList.remove('bg-emerald-600', 'border-emerald-600', 'text-white');
            chip.classList.add('bg-white', 'border-slate-200', 'text-slate-700');
            dot.classList.remove('bg-white', 'border-white');
            dot.classList.add('border-slate-300', 'opacity-50');
            dot.innerHTML = '';
            dist.classList.remove('bg-emerald-500/70', 'text-emerald-50');
            dist.classList.add('bg-slate-100', 'text-slate-400');
            wrap.classList.add('hidden');
        }
    };
}

window.removeExtra = (id) => { extraAttendees = extraAttendees.filter(x => x.id !== id); renderExtras(); };

function updateSermonTagActiveState(tagVal) {
    const tags = document.querySelectorAll('.sermon-tag');
    let matched = false;
    
    tags.forEach(tag => {
        const val = tag.getAttribute('data-value');
        if (val !== '직접입력' && val === tagVal) {
            tag.classList.remove('bg-slate-100', 'text-slate-800');
            tag.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            matched = true;
        } else {
            tag.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            tag.classList.add('bg-slate-100', 'text-slate-800');
        }
    });

    const directInputTag = Array.from(tags).find(t => t.getAttribute('data-value') === '직접입력');
    const directTagField = document.getElementById('directSermonTagField');
    const directTagInput = document.getElementById('directSermonTag');

    if (directInputTag) {
        if (tagVal === '직접입력' || (!matched && tagVal && tagVal.trim() !== '')) {
            directInputTag.classList.remove('bg-slate-100', 'text-slate-800');
            directInputTag.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            if (directTagField) directTagField.classList.remove('hidden');
            if (directTagInput && tagVal !== '직접입력') directTagInput.value = tagVal;
        } else {
            directInputTag.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            directInputTag.classList.add('bg-slate-100', 'text-slate-800');
            if (directTagField) directTagField.classList.add('hidden');
            if (directTagInput && !tagVal) directTagInput.value = '';
        }
    }
}

// 개인상담 패널 프리셋 태그 (모듈 스코프 — resetCounselingPanel/openMeetingModal 등 어디서든 호출 가능)
const MODAL_MEMBER_PRESET_TAGS = ['전도상담','구원확신/의심','진로','이성','죄','자녀','부부관계','가족','성경질문','이단','직장생활','결혼'];
const MODAL_EVANGELISM_PRESET_TAGS = ['전도상담', '성경', '인생', '하나님', '1일차 전체', '2일차 전체', '3일차 전체', '4일차 전체', '성경강연회', '구원'];

function updateModalPresetTags(status) {
    const container = document.getElementById('modalCounselTagBtns');
    if (!container) return;

    container.querySelectorAll('.mcounsel-tag-btn:not(.custom-counsel-tag)').forEach(b => b.remove());

    const tags = status === 'evangelism' ? MODAL_EVANGELISM_PRESET_TAGS : MODAL_MEMBER_PRESET_TAGS;
    const borderCls = status === 'evangelism'
        ? 'border-orange-200 dark:border-orange-800/60 text-orange-600 dark:text-orange-400 hover:bg-orange-500 hover:text-white hover:border-orange-500'
        : 'border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-650 hover:text-white hover:border-indigo-650';

    const fragment = document.createDocumentFragment();
    tags.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.tag = t;
        btn.className = `mcounsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-white dark:bg-slate-800 transition-all cursor-pointer ${borderCls}`;
        btn.textContent = '#' + t;
        fragment.appendChild(btn);
    });

    container.insertBefore(fragment, container.firstChild);
}

// Bind all events inside meetingModal. Only run once.
function bindEditorEvents() {
    const modal = document.getElementById('meetingModal');
    if (!modal || modal._eventsBound) return;
    
    // Close / Cancel modal
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelMeeting');
    const handleClose = () => {
        if (window.attConfirmDiscardIfDirty && !window.attConfirmDiscardIfDirty()) return;
        modal.classList.add('hidden');
        const detailPanel = document.getElementById('meetingDetailPanel');
        if (detailPanel) detailPanel.classList.remove('hidden');
    };
    if (closeBtn) closeBtn.onclick = handleClose;
    if (cancelBtn) cancelBtn.onclick = handleClose;

    // Recurrence handler
    const recurrenceSelect = document.getElementById('meetingRecurrence');
    const recEndDateField = document.getElementById('recurrenceEndDateField');
    if (recurrenceSelect && recEndDateField) {
        recurrenceSelect.addEventListener('change', (e) => {
            if (e.target.value !== 'none') {
                recEndDateField.classList.remove('hidden');
                if (!document.getElementById('meetingRecurrenceEndDate').value) {
                    const startDateVal = document.getElementById('meetingDate').value;
                    if (startDateVal) {
                        const d = new Date(startDateVal);
                        d.setMonth(d.getMonth() + 3);
                        document.getElementById('meetingRecurrenceEndDate').value = d.toISOString().split('T')[0];
                    }
                }
            } else {
                recEndDateField.classList.add('hidden');
                document.getElementById('meetingRecurrenceEndDate').value = '';
            }
        });
    }

    // Sermon tagbadges inputs
    const tagsInput = document.getElementById('meetingSermonTags');
    const tagsContainer = document.getElementById('sermonTagsContainer');
    if (tagsContainer && tagsInput) {
        tagsContainer.onclick = (e) => {
            // ✕ 버튼(removeSermonTag) 클릭 시 전파 차단 — focus() 호출 방지
            if (e.target.closest('button[onclick^="removeSermonTag"]')) return;
            if (e.target === tagsContainer || e.target === document.getElementById('sermonTagBadgesList')) {
                tagsInput.focus();
            }
        };
        function flushTagInput() {
            const tagVal = tagsInput.value.replace(/[#,\s]/g, '').trim();
            if (tagVal && !currentSermonTagsList.includes(tagVal)) {
                currentSermonTagsList.push(tagVal);
                tagsInput.value = '';
                renderSermonTagBadges();
            } else if (tagVal) {
                tagsInput.value = '';
            }
        }
        tagsInput.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                flushTagInput();
            } else if (e.key === 'Backspace' && !tagsInput.value) {
                currentSermonTagsList.pop();
                renderSermonTagBadges();
            }
        };
        tagsInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                flushTagInput();
            }
        });
        let _tagBlurSkip = false;
        tagsInput.addEventListener('blur', () => {
            if (_tagBlurSkip) { _tagBlurSkip = false; return; }
            flushTagInput();
        });
        // ✕ 버튼 mousedown 시 blur가 먼저 발생하는 것 방지
        tagsContainer.addEventListener('mousedown', (e) => {
            if (e.target.closest('button[onclick^="removeSermonTag"]')) {
                _tagBlurSkip = true;
            }
        });
    }

    // 개인상담 패널 이벤트 바인딩
    // 이름 자동완성
    const modalNameInput = document.getElementById('modalCounselingName');
    const modalSuggestions = document.getElementById('modalCounselingSuggestions');
    const modalMemberIdInput = document.getElementById('modalCounselingMemberId');
    if (modalNameInput && modalSuggestions) {
        modalNameInput.addEventListener('input', async () => {
            const val = modalNameInput.value.trim();
            if (val.length < 1) { modalSuggestions.classList.add('hidden'); modalMemberIdInput.value = ''; return; }
            try {
                const res = await fetch(`/api/members/search?q=${encodeURIComponent(val)}&status=active&member_status=all`);
                const list = await res.json();
                if (!list.length) { modalSuggestions.classList.add('hidden'); return; }
                modalSuggestions.innerHTML = list.slice(0, 8).map(m => `
                    <div class="px-3 py-2.5 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between"
                        data-id="${m.id}" data-name="${m.name}" data-category="${m.category || ''}" data-bs="${m.bs || ''}" data-member-status="${m.member_status || 'member'}">
                        <span>${m.name}</span>
                        <span class="text-[10px] text-slate-400 font-normal">${m.category || ''} ${m.district || ''}</span>
                    </div>`).join('');
                modalSuggestions.classList.remove('hidden');
            } catch(e) { modalSuggestions.classList.add('hidden'); }
        });
        modalSuggestions.addEventListener('click', (e) => {
            const item = e.target.closest('[data-id]');
            if (!item) return;
            modalNameInput.value = item.dataset.name;
            modalMemberIdInput.value = item.dataset.id;
            modalSuggestions.classList.add('hidden');
            // 소속/성별 자동 세팅
            if (item.dataset.category) {
                document.getElementById('modalCounselingCategory').value = item.dataset.category;
                document.querySelectorAll('.modal-cat-btn').forEach(b => {
                    const isActive = b.dataset.val === item.dataset.category;
                    b.classList.toggle('bg-indigo-600', isActive);
                    b.classList.toggle('text-white', isActive);
                    b.classList.toggle('border-indigo-600', isActive);
                    b.classList.toggle('bg-white', !isActive);
                    b.classList.toggle('dark:bg-slate-700', !isActive);
                    b.classList.toggle('text-slate-600', !isActive);
                    b.classList.toggle('dark:text-slate-300', !isActive);
                });
            }
            if (item.dataset.bs) {
                document.getElementById('modalCounselingBs').value = item.dataset.bs;
                document.querySelectorAll('.modal-bs-btn').forEach(b => {
                    const isActive = b.dataset.val === item.dataset.bs;
                    const isBrother = b.dataset.val === 'B';
                    b.classList.toggle('bg-blue-600', isActive && isBrother);
                    b.classList.toggle('bg-pink-500', isActive && !isBrother);
                    b.classList.toggle('text-white', isActive);
                    b.classList.toggle('border-blue-600', isActive && isBrother);
                    b.classList.toggle('border-pink-500', isActive && !isBrother);
                    b.classList.toggle('bg-white', !isActive);
                    b.classList.toggle('dark:bg-slate-700', !isActive);
                    b.classList.toggle('text-slate-600', !isActive);
                    b.classList.toggle('dark:text-slate-300', !isActive);
                });
            }
            if (item.dataset.memberStatus) {
                const val = item.dataset.memberStatus;
                document.getElementById('modalCounselingMemberStatus').value = val;
                document.querySelectorAll('.modal-status-btn').forEach(b => {
                    const isActive = b.dataset.val === val;
                    b.className = `modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all text-center ${
                        isActive 
                            ? (val === 'member' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-orange-50 border-orange-400 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400')
                            : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-350'
                    }`;
                });
                const isEv = val === 'evangelism';
                const bsLabel = document.getElementById('modalBsLabel');
                if (bsLabel) bsLabel.textContent = isEv ? '성별(남자/여자)' : '성별(형제/자매)';
                document.querySelectorAll('.modal-bs-btn').forEach(b => {
                    const bVal = b.dataset.val;
                    if (bVal === 'B') b.textContent = isEv ? '남자' : '형제';
                    if (bVal === 'S') b.textContent = isEv ? '여자' : '자매';
                });
                updateModalPresetTags(val);
            }
        });
        document.addEventListener('click', (e) => {
            if (!modalNameInput.contains(e.target) && !modalSuggestions.contains(e.target)) {
                modalSuggestions.classList.add('hidden');
            }
        });
    }

    // 소속 버튼
    document.getElementById('modalCategoryBtns')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.modal-cat-btn');
        if (!btn) return;
        const val = btn.dataset.val;
        document.getElementById('modalCounselingCategory').value = val;
        document.querySelectorAll('.modal-cat-btn').forEach(b => {
            const isActive = b.dataset.val === val;
            b.classList.toggle('bg-indigo-600', isActive);
            b.classList.toggle('text-white', isActive);
            b.classList.toggle('border-indigo-600', isActive);
            b.classList.toggle('bg-white', !isActive);
            b.classList.toggle('dark:bg-slate-700', !isActive);
            b.classList.toggle('text-slate-600', !isActive);
            b.classList.toggle('dark:text-slate-300', !isActive);
        });
    });

    // 성별 버튼
    document.getElementById('modalBsBtns')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.modal-bs-btn');
        if (!btn) return;
        const val = btn.dataset.val;
        document.getElementById('modalCounselingBs').value = val;
        document.querySelectorAll('.modal-bs-btn').forEach(b => {
            const isActive = b.dataset.val === val;
            const isBrother = b.dataset.val === 'B';
            b.classList.toggle('bg-blue-600', isActive && isBrother);
            b.classList.toggle('bg-pink-500', isActive && !isBrother);
            b.classList.toggle('text-white', isActive);
            b.classList.toggle('border-blue-600', isActive && isBrother);
            b.classList.toggle('border-pink-500', isActive && !isBrother);
            b.classList.toggle('bg-white', !isActive);
            b.classList.toggle('dark:bg-slate-700', !isActive);
            b.classList.toggle('text-slate-600', !isActive);
            b.classList.toggle('dark:text-slate-300', !isActive);
        });
    });

    // 상담 방식 버튼 (대면/전화)
    document.getElementById('modalCounselMethodBtns')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.modal-method-btn');
        if (!btn) return;
        const val = btn.dataset.val;
        document.getElementById('modalCounselingMethod').value = val;
        document.querySelectorAll('.modal-method-btn').forEach(b => {
            const isActive = b.dataset.val === val;
            b.classList.toggle('bg-indigo-600', isActive);
            b.classList.toggle('border-indigo-500', isActive);
            b.classList.toggle('text-white', isActive);
            b.classList.toggle('bg-white', !isActive);
            b.classList.toggle('dark:bg-slate-700', !isActive);
            b.classList.toggle('text-slate-600', !isActive);
            b.classList.toggle('dark:text-slate-300', !isActive);
            b.classList.toggle('border-slate-200', !isActive);
            b.classList.toggle('dark:border-slate-600', !isActive);
        });
    });

    // 익명 체크박스
    document.getElementById('modalAnonymousCheck')?.addEventListener('change', (e) => {
        const nameInput = document.getElementById('modalCounselingName');
        const sugg = document.getElementById('modalCounselingSuggestions');
        if (!nameInput) return;
        if (e.target.checked) {
            nameInput.value = '익명';
            nameInput.disabled = true;
            nameInput.classList.add('opacity-50', 'cursor-not-allowed');
            if (sugg) sugg.classList.add('hidden');
        } else {
            nameInput.value = '';
            nameInput.disabled = false;
            nameInput.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });

    // 성도/전도대상 구분 토글
    document.getElementById('modalMemberStatusBtns')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.modal-status-btn');
        if (!btn) return;
        const val = btn.dataset.val;
        document.getElementById('modalCounselingMemberStatus').value = val;
        document.querySelectorAll('.modal-status-btn').forEach(b => {
            const isActive = b.dataset.val === val;
            b.className = `modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all text-center ${
                isActive 
                    ? (val === 'member' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-orange-50 border-orange-400 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400')
                    : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-350'
            }`;
        });
        
        const isEv = val === 'evangelism';
        const bsLabel = document.getElementById('modalBsLabel');
        if (bsLabel) bsLabel.textContent = isEv ? '성별(남자/여자)' : '성별(형제/자매)';
        document.querySelectorAll('.modal-bs-btn').forEach(b => {
            const bVal = b.dataset.val;
            if (bVal === 'B') b.textContent = isEv ? '남자' : '형제';
            if (bVal === 'S') b.textContent = isEv ? '여자' : '자매';
        });

        updateModalPresetTags(val);
        const hiddenInput = document.getElementById('modalCounselingTags');
        if (hiddenInput) hiddenInput.value = '';
        renderModalCounselTags();
    });

    // --- 상담 태그 프리셋 버튼 ---
    document.getElementById('modalCounselTagBtns')?.addEventListener('click', (e) => {
        // × 삭제 버튼 처리 (커스텀 태그 삭제)
        const delSpan = e.target.closest('.counsel-tag-del');
        if (delSpan) {
            e.stopPropagation();
            const tag = delSpan.dataset.deltag;
            removeCustomCounselTagFromLS(tag);
            delSpan.closest('button').remove();
            const hiddenInput = document.getElementById('modalCounselingTags');
            let tags = hiddenInput.value ? hiddenInput.value.split(/\s+/).filter(t => t.startsWith('#') && t.length > 1) : [];
            tags = tags.filter(t => t !== '#' + tag);
            hiddenInput.value = tags.join(' ');
            renderModalCounselTags();
            return;
        }
        const btn = e.target.closest('.mcounsel-tag-btn');
        if (!btn) return;
        const tag = '#' + btn.dataset.tag;
        const hiddenInput = document.getElementById('modalCounselingTags');
        let tags = hiddenInput.value ? hiddenInput.value.split(/\s+/).filter(t => t.startsWith('#') && t.length > 1) : [];
        if (tags.includes(tag)) {
            tags = tags.filter(t => t !== tag);
        } else {
            tags.push(tag);
        }
        hiddenInput.value = tags.join(' ');
        renderModalCounselTags();
    });

    // --- 커스텀 태그 관리 (localStorage) ---
    const COUNSEL_TAG_LS_KEY = 'church_counsel_custom_tags';

    function getCustomCounselTags() {
        try { return JSON.parse(localStorage.getItem(COUNSEL_TAG_LS_KEY) || '[]'); } catch { return []; }
    }
    function saveCustomCounselTagToLS(tag) {
        const tags = getCustomCounselTags();
        if (!tags.includes(tag)) { tags.push(tag); localStorage.setItem(COUNSEL_TAG_LS_KEY, JSON.stringify(tags)); }
    }
    function removeCustomCounselTagFromLS(tag) {
        localStorage.setItem(COUNSEL_TAG_LS_KEY, JSON.stringify(getCustomCounselTags().filter(t => t !== tag)));
    }
    function appendCustomCounselTagBtn(tag) {
        const container = document.getElementById('modalCounselTagBtns');
        if (!container || container.querySelector(`[data-tag="${CSS.escape(tag)}"]`)) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.tag = tag;
        btn.className = 'mcounsel-tag-btn custom-counsel-tag flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all';
        btn.innerHTML = `#${tag}<span class="counsel-tag-del ml-0.5 text-red-400 hover:text-red-500 font-black text-[11px] leading-none" data-deltag="${tag}">×</span>`;
        container.appendChild(btn);
    }
    function loadCustomCounselTags() {
        getCustomCounselTags().forEach(tag => appendCustomCounselTagBtn(tag));
    }

    function addModalCustomTag() {
        const input = document.getElementById('modalCounselTagInput');
        if (!input) return;
        const val = input.value.replace(/[#\s,]/g, '').trim();
        if (!val) return;
        // 프리셋으로 저장 & 버튼 추가
        saveCustomCounselTagToLS(val);
        appendCustomCounselTagBtn(val);
        // 선택 상태에도 추가
        const hiddenInput = document.getElementById('modalCounselingTags');
        let tags = hiddenInput.value ? hiddenInput.value.split(/\s+/).filter(t => t.startsWith('#') && t.length > 1) : [];
        const tag = '#' + val;
        if (!tags.includes(tag)) tags.push(tag);
        hiddenInput.value = tags.join(' ');
        input.value = '';
        renderModalCounselTags();
    }
    document.getElementById('modalAddCounselTag')?.addEventListener('click', addModalCustomTag);
    document.getElementById('modalCounselTagInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addModalCustomTag(); }
    });

    // 저장된 커스텀 태그 초기 로드
    loadCustomCounselTags();

    // Type Change -> Load attendance
    const meetingTypeEl = document.getElementById('meetingType');
    if (meetingTypeEl) {
        meetingTypeEl.addEventListener('change', () => {
            refreshAttendanceList();
            
            const typeVal = meetingTypeEl.value || '';
            const isAllDayEvent = document.getElementById('isAllDayEvent');
            const startTimeEl = document.getElementById('meetingStartTime');
            const endTimeEl = document.getElementById('meetingEndTime');
            const endTimeField = document.getElementById('meetingEndTimeField');
            
            if (isAllDayEvent && startTimeEl && endTimeEl && endTimeField) {
                if (typeVal.includes('구역모임')) {
                    isAllDayEvent.checked = false;
                    startTimeEl.classList.remove('hidden');
                    endTimeField.classList.remove('hidden');
                    startTimeEl.value = '19:30';
                    endTimeEl.value = '21:30';
                } else if (typeVal.includes('조모임')) {
                    isAllDayEvent.checked = false;
                    startTimeEl.classList.remove('hidden');
                    endTimeField.classList.remove('hidden');
                    startTimeEl.value = '10:30';
                    endTimeEl.value = '14:00';
                }
            }
        });
    }

    // All day checkbox
    const isAllDayEvent = document.getElementById('isAllDayEvent');
    const startTimeEl = document.getElementById('meetingStartTime');
    const endTimeEl = document.getElementById('meetingEndTime');
    const endTimeField = document.getElementById('meetingEndTimeField');
    if (isAllDayEvent && startTimeEl && endTimeEl && endTimeField) {
        isAllDayEvent.addEventListener('change', (e) => {
            if (e.target.checked) {
                startTimeEl.classList.add('hidden');
                endTimeField.classList.add('hidden');
                startTimeEl.value = '';
                endTimeEl.value = '';
            } else {
                startTimeEl.classList.remove('hidden');
                endTimeField.classList.remove('hidden');
                startTimeEl.value = '09:00';
                endTimeEl.value = '10:00';
            }
        });

        startTimeEl.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                const [h, m] = val.split(':').map(Number);
                const nextHour = (h + 1) % 24;
                endTimeEl.value = `${String(nextHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
        });
    }

    // Same day / end date binding
    const isSameDayEvent = document.getElementById('isSameDayEvent');
    const meetingEndDate = document.getElementById('meetingEndDate');
    const meetingDate = document.getElementById('meetingDate');
    if (isSameDayEvent && meetingEndDate && meetingDate) {
        const updateEndDateState = () => {
            if (isSameDayEvent.checked) {
                meetingEndDate.value = meetingDate.value;
                meetingEndDate.disabled = true;
                meetingEndDate.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
            } else {
                meetingEndDate.disabled = false;
                meetingEndDate.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
            }
        };
        isSameDayEvent.onchange = updateEndDateState;
        meetingDate.oninput = updateEndDateState;
    }

    // External church search
    const churchSearchInput = document.getElementById('churchSearchInput');
    const churchSearchResults = document.getElementById('churchSearchResults');
    const clearSelectedChurch = document.getElementById('clearSelectedChurch');
    if (churchSearchInput && churchSearchResults && clearSelectedChurch) {
        let allChurches = [];
        fetchChurches().then(data => { allChurches = data; });

        churchSearchInput.oninput = () => {
            const val = churchSearchInput.value.trim().toLowerCase();
            if (!val) {
                churchSearchResults.innerHTML = '';
                churchSearchResults.classList.add('hidden');
                return;
            }

            const filtered = allChurches.filter(c => c.name.toLowerCase().includes(val));
            if (filtered.length === 0) {
                churchSearchResults.innerHTML = '<div class="p-2 text-xs text-gray-500 italic">검색 결과가 없습니다.</div>';
                churchSearchResults.classList.remove('hidden');
                return;
            }

            churchSearchResults.innerHTML = filtered.map(c => `
                <div class="church-search-item p-2 hover:bg-blue-50 cursor-pointer font-bold text-sm text-gray-700 border-b border-gray-100" data-name="${c.name}">
                    ${c.name}
                </div>
            `).join('');
            churchSearchResults.classList.remove('hidden');

            document.querySelectorAll('.church-search-item').forEach(item => {
                item.onclick = () => {
                    selectedChurch = item.getAttribute('data-name');
                    updateSelectedChurchUI();
                    churchSearchInput.value = '';
                    churchSearchResults.innerHTML = '';
                    churchSearchResults.classList.add('hidden');
                };
            });
        };

        clearSelectedChurch.onclick = () => {
            selectedChurch = '';
            updateSelectedChurchUI();
        };

        document.addEventListener('click', (e) => {
            if (churchSearchInput && !churchSearchInput.contains(e.target) && !churchSearchResults.contains(e.target)) {
                churchSearchResults.classList.add('hidden');
            }
        });
    }

    // Bible Books autocomplete
    const bibleBooks = [
        "창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기", "사무엘상", "사무엘하",
        "열왕기상", "열왕기하", "역대상", "역대하", "에스라", "느헤미야", "에스더", "욥기", "시편", "잠언",
        "전도서", "아가", "이사야", "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스",
        "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기",
        "마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서", "고린도전서", "고린도후서", "갈라디아서", "에베소서",
        "빌립보서", "골로새서", "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서", "빌레몬서", "히브리서", "야고보서",
        "베드로전서", "베드로후서", "요한1서", "요한2서", "요한3서", "유다서", "요한계시록"
    ];
    const bibleInput = document.getElementById('meetingSermonBible');
    const bibleResults = document.getElementById('meetingSermonBibleResults');
    if (bibleInput && bibleResults) {
        let currentFocus = -1;
        bibleInput.oninput = () => {
            currentFocus = -1;
            const val = bibleInput.value.trim().toLowerCase();
            if (!val) {
                bibleResults.innerHTML = '';
                bibleResults.classList.add('hidden');
                return;
            }

            const filtered = bibleBooks.filter(b => b.toLowerCase().includes(val));
            if (filtered.length === 0) {
                bibleResults.innerHTML = '<div class="p-2 text-xs text-gray-500 italic">검색 결과가 없습니다.</div>';
                bibleResults.classList.remove('hidden');
                return;
            }

            bibleResults.innerHTML = filtered.map(b => `
                <div class="bible-search-item p-2 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer font-bold text-sm text-gray-700 dark:text-slate-300 border-b border-gray-100 dark:border-slate-800/80" data-name="${b}">
                    ${b}
                </div>
            `).join('');
            bibleResults.classList.remove('hidden');

            document.querySelectorAll('.bible-search-item').forEach(item => {
                item.onclick = () => {
                    bibleInput.value = item.getAttribute('data-name');
                    bibleResults.innerHTML = '';
                    bibleResults.classList.add('hidden');
                };
            });
        };

        bibleInput.onkeydown = (e) => {
            const items = bibleResults.querySelectorAll('.bible-search-item');
            if (e.key === 'ArrowDown') {
                currentFocus++;
                addActive(items);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                currentFocus--;
                addActive(items);
                e.preventDefault();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus > -1) {
                    if (items && items[currentFocus]) items[currentFocus].click();
                } else if (items.length > 0) {
                    items[0].click();
                }
            }
        };

        function addActive(items) {
            if (!items) return false;
            removeActive(items);
            if (currentFocus >= items.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (items.length - 1);
            items[currentFocus].classList.add('bg-blue-100', 'dark:bg-slate-700');
        }
        function removeActive(items) {
            for (let i = 0; i < items.length; i++) {
                items[i].classList.remove('bg-blue-100', 'dark:bg-slate-700');
            }
        }
        document.addEventListener('click', (e) => {
            if (bibleInput && !bibleInput.contains(e.target) && !bibleResults.contains(e.target)) {
                bibleResults.classList.add('hidden');
            }
        });
    }

    // Extra member search modal event
    const openExtraSearch = document.getElementById('openExtraMemberSearch');
    const closeExtraSearch = document.getElementById('closeExtraMemberModal');
    const extraSearchInput = document.getElementById('extraMemberSearchInput');
    const extraSearchModal = document.getElementById('extraMemberSearchModal');
    if (openExtraSearch && extraSearchModal) {
        openExtraSearch.onclick = () => extraSearchModal.classList.remove('hidden');
    }
    if (closeExtraSearch && extraSearchModal) {
        closeExtraSearch.onclick = () => extraSearchModal.classList.add('hidden');
    }
    if (extraSearchInput) {
        extraSearchInput.addEventListener('input', async (e) => {
            const q = e.target.value.trim(); if (q.length < 1) return;
            const res = await fetch(`/api/members/search?q=${encodeURIComponent(q)}&status=active`);
            const ms = await res.json();
            document.getElementById('extraSearchResults').innerHTML = ms.map(m => `<div class="p-3 bg-white dark:bg-slate-800 border dark:border-slate-700/80 rounded hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer font-bold dark:text-slate-200" onclick="addExtraAttendee(${m.id}, '${m.name}', '${m.district}')">${m.name} (${m.district})</div>`).join('');
        });
    }

    window.addExtraAttendee = (id, name, district) => {
        if (!extraAttendees.some(x => x.id === id)) {
            extraAttendees.push({ id, name, district, is_present: true, testimony_snapshot: '' });
            renderExtras();
        }
        extraSearchModal.classList.add('hidden');
        extraSearchInput.value = '';
    };

    // Sermon preset tags click listener
    const tagsListContainer = document.getElementById('sermonTagsList');
    if (tagsListContainer) {
        tagsListContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.sermon-tag');
            if (!btn) return;
            
            const val = btn.getAttribute('data-value');
            const directTagField = document.getElementById('directSermonTagField');
            const directTagInput = document.getElementById('directSermonTag');
            
            if (val === '직접입력') {
                if (directTagField) directTagField.classList.remove('hidden');
                if (directTagInput) {
                    directTagInput.value = '';
                    directTagInput.focus();
                }
                updateSermonTagActiveState('직접입력');
            } else {
                if (directTagField) directTagField.classList.add('hidden');
                updateSermonTagActiveState(val);
            }
        });
    }

    // Save action button
    const saveBtn = document.getElementById('saveMeeting');
    if (saveBtn) {
        saveBtn.onclick = handleSaveMeeting;
    }

    // Delete action button
    const deleteBtn = document.getElementById('deleteMeeting');
    if (deleteBtn) {
        deleteBtn.onclick = handleDeleteMeeting;
    }

    // ----------------------------------------------------
    // 구원 및 구역편입 연동 패널 이벤트 처리
    // ----------------------------------------------------
    const salvationCheck = document.getElementById('modalCounselingSalvationCheck');
    const assignCheck = document.getElementById('modalCounselingAssignCheck');
    const assignSubPanel = document.getElementById('modalCounselingAssignSubPanel');
    const assignParish = document.getElementById('modalCounselingAssignParish');
    const assignDistrict = document.getElementById('modalCounselingAssignDistrict');

    if (salvationCheck) {
        salvationCheck.addEventListener('change', (e) => {
            if (e.target.checked) {
                // 구원 처리 시, 성도 구분을 강제로 '성도'로 변경하고 UI 동기화
                const statusInput = document.getElementById('modalCounselingMemberStatus');
                if (statusInput) statusInput.value = 'member';
                document.querySelectorAll('.modal-status-btn').forEach(b => {
                    const isActive = b.dataset.val === 'member';
                    b.className = `modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all text-center ${
                        isActive 
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400'
                            : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-350'
                    }`;
                });
                const bsLabel = document.getElementById('modalBsLabel');
                if (bsLabel) bsLabel.textContent = '성별(형제/자매)';
                document.querySelectorAll('.modal-bs-btn').forEach(b => {
                    const bVal = b.dataset.val;
                    if (bVal === 'B') b.textContent = '형제';
                    if (bVal === 'S') b.textContent = '자매';
                });
            }
        });
    }

    if (assignCheck && assignSubPanel) {
        assignCheck.addEventListener('change', async (e) => {
            if (e.target.checked) {
                assignSubPanel.classList.remove('hidden');
                
                if (assignParish && assignParish.options.length === 0) {
                    try {
                        const pRes = await fetch('/api/parishes?church_id=1');
                        const parishes = await pRes.json();
                        assignParish.innerHTML = parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
                        
                        const uRes = await fetch('/api/users/default-profile');
                        const profile = await uRes.json();
                        if (profile && profile.parish) {
                            const matchedOpt = Array.from(assignParish.options).find(opt => opt.dataset.name === profile.parish);
                            if (matchedOpt) {
                                assignParish.value = matchedOpt.value;
                            }
                        }
                        
                        triggerDistrictLoad();
                    } catch (err) {
                        console.error('교구 로드 실패:', err);
                    }
                }
            } else {
                assignSubPanel.classList.add('hidden');
            }
        });

        if (assignParish) {
            assignParish.addEventListener('change', triggerDistrictLoad);
        }

        async function triggerDistrictLoad() {
            if (!assignParish.value || !assignDistrict) return;
            try {
                const dRes = await fetch(`/api/districts?parish_id=${assignParish.value}`);
                const districts = await dRes.json();
                assignDistrict.innerHTML = districts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');

                const uRes = await fetch('/api/users/default-profile');
                const profile = await uRes.json();
                if (profile && profile.districts && profile.districts.length > 0) {
                    const firstDistrictName = profile.districts[0] + '구역';
                    const matchedOpt = Array.from(assignDistrict.options).find(opt => opt.value === firstDistrictName);
                    if (matchedOpt) {
                        assignDistrict.value = matchedOpt.value;
                    }
                }
            } catch (err) {
                console.error('구역 로드 실패:', err);
            }
        }
    }

    modal._eventsBound = true;
}

function updateSelectedChurchUI() {
    const container = document.getElementById('selectedChurchContainer');
    const nameSpan = document.getElementById('selectedChurchName');
    if (!container || !nameSpan) return;
    if (selectedChurch) {
        nameSpan.textContent = selectedChurch;
        container.classList.remove('hidden');
        container.classList.add('flex');
    } else {
        nameSpan.textContent = '없음';
        container.classList.add('hidden');
        container.classList.remove('flex');
    }
}

// ===== 교구전체모임(전체조모임) 대상자 공통 필터 =====
// 규칙: 강효근이 서울중앙교회 소속이면 '해당 교회 + 소속 교구' 성도가 대상,
//       다른 교회로 발령 나면 '그 교회 전체' 성도가 대상.
// 이 필터로 상담으로만 등록된 인원(익명, 타교회, '교회정보없음' 등)은 자연스럽게 제외된다.
// (app.js / meeting_dashboard.js / sermon_history.js 에서 공유)
//
// snapshot 인자: 기존 모임을 다시 열람/수정할 때는 그 모임에 저장된
// { church: leader_church_snapshot, parish: leader_parish_snapshot }를 넘겨서,
// "지금" admin_settings가 아니라 "그 모임이 만들어졌을 때" 소속 기준으로 대상자를 계산한다.
// (발령으로 관리자 소속이 바뀌어도 과거 모임의 대상자 명단이 흔들리지 않도록 하기 위함)
// 신규 모임을 만드는 중이라 아직 스냅샷이 없으면 인자를 생략 — 현재 admin_settings를 그대로 사용한다.
window.applyParishWideTargetFilter = async function(targetParams, snapshot) {
    try {
        let prof = null;
        if (snapshot && snapshot.church) {
            prof = snapshot;
        } else {
            const profRes = await fetch('/api/users/default-profile');
            prof = profRes.ok ? await profRes.json() : null;
        }
        if (!prof || !prof.church) return;
        targetParams.append('church', prof.church);
        if (prof.church.trim() === '서울중앙교회' && prof.parish) {
            targetParams.append('parish', prof.parish);
        }
    } catch (e) {
        console.warn('default-profile 조회 실패 (교구전체모임 필터 미적용):', e);
    }
};

// 모임 대상자 공통 후처리: 전도대상(상담 전용 인원) 제외
window.filterMeetingTargets = function(members) {
    return (members || []).filter(m => m.member_status !== 'evangelism');
};

// ===== 관리자 설정 (강효근 관리 교회/교구/구역) =====
// /api/users/default-profile 이 { church, parish, district, managed_districts, districts: ['581','582',...] } 를 반환.
// 번호 드롭다운·기본 모임 구분이 모두 이 설정을 따른다. (하드코딩 581~583 fallback 제거)
let _adminSettingsCache = null;
let _adminSettingsCacheAt = 0;
window.getAdminSettings = async function(force = false) {
    // 관리자 설정 화면에서 저장하면 localStorage 타임스탬프가 갱신됨 → 캐시 무효화
    let updatedAt = 0;
    try { updatedAt = parseInt(localStorage.getItem('adminSettingsUpdatedAt') || '0', 10) || 0; } catch (e) {}
    if (_adminSettingsCache && !force && updatedAt <= _adminSettingsCacheAt) return _adminSettingsCache;
    try {
        const res = await fetch('/api/users/default-profile');
        _adminSettingsCache = res.ok ? await res.json() : null;
        _adminSettingsCacheAt = Date.now();
    } catch (e) {
        console.warn('관리자 설정(default-profile) 조회 실패:', e);
        _adminSettingsCache = null;
    }
    return _adminSettingsCache;
};
window.invalidateAdminSettings = function() { _adminSettingsCache = null; };

// 관리 구역 번호 목록 (예: ['581','582','583'])
window.getManagedDistricts = async function() {
    const s = await window.getAdminSettings();
    return (s && Array.isArray(s.districts)) ? s.districts : [];
};

// 신규 일정 기본 구분: 첫 관리 구역의 구역모임
window.getDefaultMeetingType = async function() {
    const ds = await window.getManagedDistricts();
    return ds.length > 0 ? `${ds[0]}구역모임` : '구역모임';
};

// ===== 모임 구분 UI (A안: 구분 셀렉트 + 번호 셀렉트, 저장 포맷은 "581구역모임" 결합 문자열 유지) =====
const MEETING_CATEGORIES = [
    { value: '구역모임', label: '구역모임', numbered: true },
    { value: '조모임', label: '조모임', numbered: true },
    { value: '교구전체모임', label: '교구전체모임' },
    { value: '교구형제모임', label: '교구형제모임' },
    { value: '전체조모임', label: '전체조모임' },
    { value: '교구청년모임', label: '교구청년모임' },
    { value: '교구임원모임', label: '교구임원모임' },
    { value: '심방', label: '심방' },
    { value: '상담', label: '개인상담' },
    { value: '설교', label: '내부설교' },
    { value: '외부설교', label: '외부설교' },
    { value: '교회행사', label: '교회행사' },
    { value: '기타', label: '기타 모임' }
];

function isNumberedCategory(cat) {
    const def = MEETING_CATEGORIES.find(c => c.value === cat);
    return def ? !!def.numbered : /^(구역모임|조모임)$/.test(cat);
}

function ensureCategoryOptions() {
    const cat = document.getElementById('meetingCategory');
    if (cat && cat.options.length === 0) {
        cat.innerHTML = MEETING_CATEGORIES.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    }
}

// 구분+번호 → 결합 문자열 ("581" + "구역모임" → "581구역모임")
function composeMeetingType() {
    const cat = document.getElementById('meetingCategory');
    const num = document.getElementById('meetingNumber');
    if (!cat) return '';
    if (isNumberedCategory(cat.value) && num && num.value) return `${num.value}${cat.value}`;
    return cat.value;
}

// 셀렉트 변경 → 숨은 #meetingType 값 갱신 + change 이벤트 전파 (기존 리스너 그대로 동작)
function syncMeetingTypeFromSelectors() {
    const cat = document.getElementById('meetingCategory');
    const num = document.getElementById('meetingNumber');
    const hidden = document.getElementById('meetingType');
    const numbered = cat ? isNumberedCategory(cat.value) : false;
    if (num) num.classList.toggle('hidden', !numbered || num.options.length === 0);
    if (!hidden) return;
    const newVal = composeMeetingType();
    if (hidden.value !== newVal) {
        hidden.value = newVal;
        hidden.dispatchEvent(new Event('change'));
    }
}

// 구분/번호 셀렉트 초기화: 카테고리 옵션 채우고, 번호 옵션을 관리자 설정에서 로드
window.initMeetingTypeSelectors = async function() {
    const cat = document.getElementById('meetingCategory');
    const num = document.getElementById('meetingNumber');
    if (!cat || !num) return;
    ensureCategoryOptions();

    const districts = await window.getManagedDistricts();
    const prev = num.value;
    num.innerHTML = districts.map(d => `<option value="${d}">${d}</option>`).join('');
    if (prev && districts.includes(prev)) num.value = prev;

    if (!cat._syncBound) {
        cat.addEventListener('change', syncMeetingTypeFromSelectors);
        num.addEventListener('change', syncMeetingTypeFromSelectors);
        cat._syncBound = true;
    }
};

// 결합 문자열 → 구분/번호 셀렉트 + 숨은 input 세팅 (change 이벤트는 발생시키지 않음: 기존 select.value = type 과 동일 동작)
window.setMeetingTypeValue = function(type) {
    const t = (type || '').trim();
    const cat = document.getElementById('meetingCategory');
    const num = document.getElementById('meetingNumber');
    const hidden = document.getElementById('meetingType');
    ensureCategoryOptions();

    let catVal = t, numVal = '';
    const m = t.match(/^(\d+)\s*(구역모임|조모임)$/);
    if (m) { numVal = m[1]; catVal = m[2]; }
    if (catVal === '개인상담') catVal = '상담';

    if (cat && catVal) {
        if (![...cat.options].some(o => o.value === catVal)) {
            // 목록에 없는 레거시 구분값도 편집 시 그대로 보존
            cat.insertAdjacentHTML('beforeend', `<option value="${catVal}">${catVal}</option>`);
        }
        cat.value = catVal;
    }
    if (num && numVal) {
        if (![...num.options].some(o => o.value === numVal)) {
            // 관리 목록에 없는 번호(과거 데이터)도 편집 시 보존
            num.insertAdjacentHTML('beforeend', `<option value="${numVal}">${numVal}</option>`);
        }
        num.value = numVal;
    }
    const numbered = isNumberedCategory(catVal);
    if (num) num.classList.toggle('hidden', !numbered || num.options.length === 0);
    if (hidden) hidden.value = t;
};

// Populate UI for attendance list
async function refreshAttendanceList() {
    const currentType = document.getElementById('meetingType').value;

    // 개인상담 모드 전환
    const counselingPanel = document.getElementById('counselingPanel');
    const titleField = document.getElementById('meetingTitleField');
    const recurrenceSection = document.getElementById('meetingRecurrenceSection');
    const sermonSectionEl = document.getElementById('sermonSection');
    const extraAttendeesSection = document.getElementById('extraAttendeesSection');

    if (currentType === '상담' || currentType === '개인상담') {
        if (counselingPanel) counselingPanel.classList.remove('hidden');
        if (titleField) titleField.classList.add('hidden');
        if (recurrenceSection) recurrenceSection.classList.add('hidden');
        if (sermonSectionEl) sermonSectionEl.classList.add('hidden');
        if (extraAttendeesSection) extraAttendeesSection.classList.add('hidden');
        const defaultAttSec2 = document.getElementById('defaultAttendanceSection');
        if (defaultAttSec2) defaultAttSec2.classList.add('hidden');
        const memoField2 = document.getElementById('memoField');
        if (memoField2) memoField2.classList.add('hidden');
        // 기존 상담 수정 시 attendance 데이터 로드
        if (currentMeetingId) {
            try {
                const aRes = await fetch(`/api/meetings/${currentMeetingId}/attendance`);
                const att = await aRes.json();
                if (att.length > 0) {
                    const person = att[0];
                    const nameEl = document.getElementById('modalCounselingName');
                    const memberIdEl = document.getElementById('modalCounselingMemberId');
                    if (nameEl && !nameEl.value) nameEl.value = person.name || '';
                    if (memberIdEl && !memberIdEl.value) memberIdEl.value = person.member_id || '';

                    // 익명 체크박스 복원
                    const isAnon = person.name === '익명';
                    const anonCheck = document.getElementById('modalAnonymousCheck');
                    if (anonCheck) {
                        anonCheck.checked = isAnon;
                        if (isAnon && nameEl) {
                            nameEl.disabled = true;
                            nameEl.classList.add('opacity-50', 'cursor-not-allowed');
                        }
                    }

                    // 구분/성별/상태 버튼 복원
                    const val = person.member_status || 'member';
                    const statusInput = document.getElementById('modalCounselingMemberStatus');
                    if (statusInput) statusInput.value = val;
                    document.querySelectorAll('.modal-status-btn').forEach(b => {
                        const isActive = b.dataset.val === val;
                        b.className = `modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all text-center ${
                            isActive 
                                ? (val === 'member' ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-orange-50 border-orange-400 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400')
                                : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-350'
                        }`;
                    });

                    // 성별 라벨명 및 텍스트 동기화
                    const isEv = val === 'evangelism';
                    const bsLabel = document.getElementById('modalBsLabel');
                    if (bsLabel) bsLabel.textContent = isEv ? '성별(남자/여자)' : '성별(형제/자매)';
                    document.querySelectorAll('.modal-bs-btn').forEach(b => {
                        const bVal = b.dataset.val;
                        if (bVal === 'B') b.textContent = isEv ? '남자' : '형제';
                        if (bVal === 'S') b.textContent = isEv ? '여자' : '자매';
                    });

                    // 소속 버튼 복원
                    if (person.category) {
                        document.getElementById('modalCounselingCategory').value = person.category;
                        document.querySelectorAll('.modal-cat-btn').forEach(b => {
                            const isActive = b.dataset.val === person.category;
                            b.classList.toggle('bg-indigo-600', isActive);
                            b.classList.toggle('text-white', isActive);
                            b.classList.toggle('border-indigo-600', isActive);
                            b.classList.toggle('bg-white', !isActive);
                            b.classList.toggle('dark:bg-slate-700', !isActive);
                            b.classList.toggle('text-slate-600', !isActive);
                            b.classList.toggle('dark:text-slate-300', !isActive);
                        });
                    }

                    // 성별 버튼 복원
                    if (person.bs) {
                        document.getElementById('modalCounselingBs').value = person.bs;
                        document.querySelectorAll('.modal-bs-btn').forEach(b => {
                            const isActive = b.dataset.val === person.bs;
                            const isBrother = b.dataset.val === 'B';
                            b.classList.toggle('bg-blue-600', isActive && isBrother);
                            b.classList.toggle('bg-pink-500', isActive && !isBrother);
                            b.classList.toggle('text-white', isActive);
                            b.classList.toggle('border-blue-600', isActive && isBrother);
                            b.classList.toggle('border-pink-500', isActive && !isBrother);
                            b.classList.toggle('bg-white', !isActive);
                            b.classList.toggle('dark:bg-slate-700', !isActive);
                            b.classList.toggle('text-slate-600', !isActive);
                            b.classList.toggle('dark:text-slate-300', !isActive);
                        });
                    }

                    updateModalPresetTags(val);

                    // testimony_snapshot: "태그들\n내용" 형식으로 저장됨
                    const snap = person.testimony_snapshot || '';
                    const firstNL = snap.indexOf('\n');
                    let loadedTags = '', loadedContent = '';
                    if (firstNL > -1 && snap.substring(0, firstNL).includes('#')) {
                        loadedTags = snap.substring(0, firstNL).trim();
                        loadedContent = snap.substring(firstNL + 1).trim();
                    } else {
                        loadedContent = snap;
                    }
                    const contentEl = document.getElementById('modalCounselingContent');
                    if (contentEl && !contentEl.value) contentEl.value = loadedContent;
                    if (loadedTags) {
                        document.getElementById('modalCounselingTags').value = loadedTags;
                        renderModalCounselTags();
                    }
                    // 메모 = remark
                    const remarkEl = document.getElementById('modalCounselingRemark');
                    if (remarkEl && !remarkEl.value) {
                        const memoEl = document.getElementById('meetingMemo');
                        if (memoEl) remarkEl.value = memoEl.value || '';
                    }
                }
            } catch(e) { console.warn('counseling load err', e); }
        }
        return;
    }

    // 개인상담이 아닌 경우: 상담 패널 숨기고 일반 UI 복원
    if (counselingPanel) counselingPanel.classList.add('hidden');
    if (titleField) titleField.classList.remove('hidden');
    if (recurrenceSection) recurrenceSection.classList.remove('hidden');
    if (sermonSectionEl) sermonSectionEl.classList.remove('hidden');
    if (extraAttendeesSection) extraAttendeesSection.classList.remove('hidden');

    let targetParams = new URLSearchParams({ status: 'active' });
    
    const endDateField = document.getElementById('meetingEndDateField');
    const dateLabel = document.getElementById('meetingDateLabel');
    const defaultAttSec = document.getElementById('defaultAttendanceSection');
    const extraAttSec = document.getElementById('openExtraMemberSearch')?.closest('.border-t');
    const memoField = document.getElementById('memoField');
    
    const sermonTagsField = document.getElementById('sermonTagsField');
    if (sermonTagsField) {
        if (currentType === '설교') {
            sermonTagsField.classList.remove('hidden');
        } else {
            sermonTagsField.classList.add('hidden');
        }
    }

    if (currentType === '교회행사') {
        if (endDateField) endDateField.classList.remove('hidden');
        if (dateLabel) dateLabel.textContent = '시작일';
        if (defaultAttSec) defaultAttSec.classList.add('hidden');
        if (extraAttSec) extraAttSec.classList.add('hidden');
        if (memoField) memoField.classList.remove('hidden');
        const attListChurch = document.getElementById('attendanceList');
        attListChurch.className = 'space-y-2 max-h-[600px] overflow-y-auto no-scrollbar';
        attListChurch.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">교회 행사는 참석 체크 대상자가 없습니다.</p>';
        if (window.attSetMode) window.attSetMode('check');
        
        const searchSection = document.getElementById('churchSearchSection');
        if (searchSection) {
            searchSection.classList.add('hidden');
            searchSection.style.display = 'none';
        }
        window.attSnapshotModalState();
        return;
    } else {
        if (endDateField) endDateField.classList.add('hidden');
        if (dateLabel) dateLabel.textContent = '날짜';
        if (defaultAttSec) defaultAttSec.classList.remove('hidden');
        if (extraAttSec) extraAttSec.classList.remove('hidden');
        
        if (['심방', '외부설교', '기타', '설교'].includes(currentType) || currentType.includes('모임')) {
            if (memoField) memoField.classList.remove('hidden');
        } else {
            if (memoField) memoField.classList.add('hidden');
        }
    }
    
    const searchSection = document.getElementById('churchSearchSection');
    if (currentType === '외부설교') {
        searchSection.classList.remove('hidden');
        searchSection.style.display = 'block';
    } else {
        if (searchSection) {
            searchSection.classList.add('hidden');
            searchSection.style.display = 'none';
        }
        if (selectedChurch) {
            selectedChurch = '';
            updateSelectedChurchUI();
        }
    }
    
    if (currentType.includes('교구전체모임') || currentType.includes('전체조모임')) {
        // 교구전체모임: 강효근 소속 교회(+서울중앙교회인 경우 교구) 성도 전체가 대상.
        // 기존 모임을 편집 중이면(currentMeetingData 존재) 그 모임에 저장된 스냅샷을 우선 사용해서
        // 관리자 소속이 나중에 바뀌어도 과거 모임의 대상자 명단이 흔들리지 않도록 한다.
        const snap = currentMeetingData ? { church: currentMeetingData.leader_church_snapshot, parish: currentMeetingData.leader_parish_snapshot } : null;
        await window.applyParishWideTargetFilter(targetParams, snap);
    } else if (currentType.includes('구역모임') || currentType.includes('조모임')) {
        const distMatch = currentType.match(/\d+/);
        if (distMatch) targetParams.append('district', `${distMatch[0]}구역`);
    } else if (currentType === '교구임원모임') {
        targetParams.append('has_position', 'true');
    } else if (currentType.includes('형제모임')) {
        targetParams.append('category', '봉사회');
    } else if (currentType.includes('청년모임')) {
        targetParams.append('category', '청년회');
    } else if (['설교', '외부설교', '심방', '기타'].includes(currentType)) {
        const attListNone = document.getElementById('attendanceList');
        attListNone.className = 'space-y-2 max-h-[600px] overflow-y-auto no-scrollbar';
        attListNone.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">대상자가 없습니다. 직접 검색하여 추가해 주세요.</p>';
        if (window.attSetMode) window.attSetMode('check');
        if (currentMeetingId) {
            const aRes = await fetch(`/api/meetings/${currentMeetingId}/attendance`);
            const att = await aRes.json();
            extraAttendees = att.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
            renderExtras();
        } else {
            extraAttendees = [];
            renderExtras();
        }
        window.attSnapshotModalState();
        return;
    }

    const mRes = await fetch(`/api/members/search?${targetParams.toString()}`);
    let members = await mRes.json();
    members = window.filterMeetingTargets(members);

    if (currentType.includes('형제모임')) {
        const eRes = await fetch(`/api/members/search?status=active&category=은장회`);
        const eMembers = await eRes.json();
        const silverSisters = ['김민주', '정혜숙', '박현숙', '박효순', '이만심', '전계숙', '민승자', '이병숙', '김순임', '김윤연', '허간란'];
        const eBrothers = eMembers.filter(m => !silverSisters.includes(m.name) && !m.name.includes('자매'));
        members = [...members, ...eBrothers];
    }

    if (currentType.includes('조모임')) {
        members = members.filter(m => m.bs === 'S' && m.category !== '청년회');
    }

    if (currentType === '교구임원모임') {
        members = members.filter(m => m.position && m.position.trim().length > 0);
    }

    let att = []; 
    if (currentMeetingId) { 
        const aRes = await fetch(`/api/meetings/${currentMeetingId}/attendance`); 
        att = await aRes.json(); 
    }
    
    const renderRow = (m) => {
        const a = att.find(x => x.member_id === m.id);
        const isP = a ? !!a.is_present : false;
        const test = (a ? (a.testimony_snapshot || '') : '').replace(/"/g, '&quot;');
        const chipCls = isP
            ? 'bg-blue-600 border-blue-600 text-white'
            : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
        return `<div class="attendance-row relative" data-id="${m.id}" data-present="${isP}" data-district="${m.district || ''}">
            <button type="button" class="attend-chip w-full flex items-center justify-center px-2 py-1 rounded-lg border transition-all duration-150 active:scale-[0.97] ${chipCls}">
                <span class="att-name font-black text-xs leading-tight truncate">${m.name}</span>
            </button>
            <span class="testimony-dot absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shadow ${test ? '' : 'hidden'}"></span>
            <input type="hidden" class="testimony-input" value="${test}">
        </div>`;
    };

    // 구역별 그룹핑 (같은 구역끼리 묶어 헤더 한 번만 표시, 단일 구역이면 헤더 생략)
    const renderGrouped = (list) => {
        const groups = new Map();
        list.forEach(m => {
            const key = m.district || '기타';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(m);
        });
        const single = groups.size <= 1;
        return Array.from(groups.entries()).map(([dist, arr]) => `
            <div class="att-district-group" data-district="${dist}">
                ${single ? '' : `<div class="flex items-center gap-2 mb-1.5 mt-0.5"><span class="text-[10px] font-black text-blue-500/90 dark:text-blue-400/90 tracking-wider">${dist}</span><span class="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800"></span><span class="text-[9px] font-bold text-slate-300 dark:text-slate-600">${arr.length}명</span></div>`}
                <div class="grid grid-cols-5 gap-1">${arr.map(renderRow).join('')}</div>
            </div>`).join('');
    };

    function updateAttendCount() {
        const total = document.querySelectorAll('.attendance-row[data-present="true"]').length;
        const countEl = document.getElementById('attendanceCount');
        if (countEl) countEl.textContent = `${total}명 선택됨`;
    }

    function toggleAttendChip(row) {
        const nowPresent = row.dataset.present !== 'true';
        row.dataset.present = String(nowPresent);
        const chip = row.querySelector('.attend-chip');
        if (nowPresent) {
            chip.classList.remove('bg-white', 'dark:bg-slate-800/50', 'border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
            chip.classList.add('bg-blue-600', 'border-blue-600', 'text-white');
        } else {
            chip.classList.remove('bg-blue-600', 'border-blue-600', 'text-white');
            chip.classList.add('bg-white', 'dark:bg-slate-800/50', 'border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
        }
        updateAttendCount();
    }

    const attListEl = document.getElementById('attendanceList');
    attListEl.className = 'space-y-3 max-h-[600px] overflow-y-auto no-scrollbar';
    attListEl.innerHTML = renderGrouped(members);
    attListEl.onclick = (e) => {
        const chip = e.target.closest('.attend-chip');
        if (!chip) return;
        const row = chip.closest('.attendance-row');
        if (window.__attMode === 'testimony') { window.attOpenTestimonyPanel(row); return; }
        toggleAttendChip(row);
    };
    updateAttendCount();
    window.initAttendanceModeUX();
    // 간증 즉시 저장용 모임 ID — 반복 일정은 인스턴스 저장 시 새 모임이 생성되므로(부모 오염 방지) 비활성
    const isRecurringMeeting = currentMeetingData && currentMeetingData.rrule_type && currentMeetingData.rrule_type !== 'none';
    window.__attMeetingId = (currentMeetingId && !isRecurringMeeting) ? currentMeetingId : null;
    // 기존 모임 수정(기록 수정)이고 이미 출석자가 있으면 간증 모드로 바로 진입
    const hasSavedPresent = att.some(a => a.is_present);
    window.attSetMode(currentMeetingId && hasSavedPresent ? 'testimony' : 'check');
    
    if (currentMeetingId) {
        const memberIds = members.map(m => m.id);
        const extras = att.filter(a => !memberIds.includes(a.member_id) && a.is_present === 1);
        extraAttendees = extras.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
        renderExtras();
    } else {
        extraAttendees = [];
        renderExtras();
    }
    window.attSnapshotModalState(); // 닫기 가드용 기준 상태 저장
}

// 상담 태그 렌더링
function renderModalCounselTags() {
    const hiddenInput = document.getElementById('modalCounselingTags');
    const preview = document.getElementById('modalCounselTagsPreview');
    if (!hiddenInput || !preview) return;
    const tagsStr = hiddenInput.value;
    const tags = tagsStr ? tagsStr.split(/\s+/).filter(t => t.startsWith('#') && t.length > 1) : [];

    // Sync active state on preset buttons
    document.querySelectorAll('.mcounsel-tag-btn').forEach(btn => {
        const tag = '#' + btn.dataset.tag;
        if (tags.includes(tag)) {
            btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
            btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
            btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        }
    });

    preview.innerHTML = tags.map((t, i) => `<span class="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded text-[11px] font-bold flex items-center gap-1">${t}<button type="button" onclick="removeModalCounselTag(${i})" class="text-red-400 hover:text-red-600 font-black text-[10px]">✕</button></span>`).join('');
}

window.removeModalCounselTag = function(idx) {
    const hiddenInput = document.getElementById('modalCounselingTags');
    if (!hiddenInput) return;
    const tags = hiddenInput.value ? hiddenInput.value.split(/\s+/).filter(t => t.startsWith('#') && t.length > 1) : [];
    tags.splice(idx, 1);
    hiddenInput.value = tags.join(' ');
    renderModalCounselTags();
};

function resetCounselingPanel() {
    const fields = ['modalCounselingName', 'modalCounselingMemberId', 'modalCounselingCategory',
                    'modalCounselingBs', 'modalCounselingTags', 'modalCounselingContent', 'modalCounselingRemark', 'modalCounselingMethod'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const preview = document.getElementById('modalCounselTagsPreview');
    if (preview) preview.innerHTML = '';
    
    // Reset category/bs buttons
    document.querySelectorAll('.modal-cat-btn').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        b.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
    });
    document.querySelectorAll('.modal-bs-btn').forEach(b => {
        b.classList.remove('bg-blue-600', 'bg-pink-500', 'text-white', 'border-blue-600', 'border-pink-500');
        b.classList.add('bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
    });
    // Reset method buttons — 대면 기본값으로
    document.querySelectorAll('.modal-method-btn').forEach(b => {
        const isDaemyeon = b.dataset.val === '대면';
        b.classList.toggle('bg-indigo-600', isDaemyeon);
        b.classList.toggle('border-indigo-500', isDaemyeon);
        b.classList.toggle('text-white', isDaemyeon);
        b.classList.toggle('bg-white', !isDaemyeon);
        b.classList.toggle('dark:bg-slate-700', !isDaemyeon);
        b.classList.toggle('text-slate-600', !isDaemyeon);
        b.classList.toggle('dark:text-slate-300', !isDaemyeon);
        b.classList.toggle('border-slate-200', !isDaemyeon);
        b.classList.toggle('dark:border-slate-600', !isDaemyeon);
    });
    const methodInput = document.getElementById('modalCounselingMethod');
    if (methodInput) methodInput.value = '대면';

    document.querySelectorAll('.mcounsel-tag-btn').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        b.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
    });
    const sugg = document.getElementById('modalCounselingSuggestions');
    if (sugg) sugg.classList.add('hidden');

    // 익명 체크 리셋
    const anonCheck = document.getElementById('modalAnonymousCheck');
    if (anonCheck) anonCheck.checked = false;
    const nameInput = document.getElementById('modalCounselingName');
    if (nameInput) { nameInput.disabled = false; nameInput.classList.remove('opacity-50', 'cursor-not-allowed'); }

    // 성도/전도대상 구분 리셋
    const statusInput = document.getElementById('modalCounselingMemberStatus');
    if (statusInput) statusInput.value = 'member';
    document.querySelectorAll('.modal-status-btn').forEach(b => {
        const isActive = b.dataset.val === 'member';
        b.className = `modal-status-btn flex-1 py-1 rounded-lg text-[11px] font-bold border transition-all text-center ${
            isActive 
                ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-350'
        }`;
    });
    const bsLabel = document.getElementById('modalBsLabel');
    if (bsLabel) bsLabel.textContent = '성별(형제/자매)';
    document.querySelectorAll('.modal-bs-btn').forEach(b => {
        const bVal = b.dataset.val;
        if (bVal === 'B') b.textContent = '형제';
        if (bVal === 'S') b.textContent = '자매';
    });

    updateModalPresetTags('member');

    // 구원 및 구역편입 체크박스 리셋
    const salvationCheck = document.getElementById('modalCounselingSalvationCheck');
    if (salvationCheck) salvationCheck.checked = false;
    const assignCheck = document.getElementById('modalCounselingAssignCheck');
    if (assignCheck) assignCheck.checked = false;
    const assignSubPanel = document.getElementById('modalCounselingAssignSubPanel');
    if (assignSubPanel) assignSubPanel.classList.add('hidden');
}

// 개인상담 저장
async function handleSaveCounseling() {
    const name = (document.getElementById('modalCounselingName')?.value || '').trim();
    const memberId = document.getElementById('modalCounselingMemberId')?.value || '';
    const date = document.getElementById('meetingDate')?.value || '';
    const content = (document.getElementById('modalCounselingContent')?.value || '').trim();
    const remark = (document.getElementById('modalCounselingRemark')?.value || '').trim();
    const tags = (document.getElementById('modalCounselingTags')?.value || '').trim();
    const category = document.getElementById('modalCounselingCategory')?.value || '';
    const bs = document.getElementById('modalCounselingBs')?.value || '';
    const method = document.getElementById('modalCounselingMethod')?.value || '대면';
    const memberStatus = document.getElementById('modalCounselingMemberStatus')?.value || 'member';
    const isAnonymous = document.getElementById('modalAnonymousCheck')?.checked || false;
    const finalName = isAnonymous ? '익명' : name;

    const salvationCheck = document.getElementById('modalCounselingSalvationCheck');
    const isSalvationChecked = salvationCheck ? salvationCheck.checked : false;

    const assignCheck = document.getElementById('modalCounselingAssignCheck');
    const isAssignChecked = assignCheck ? assignCheck.checked : false;
    let assignParishName = '';
    const assignParishEl = document.getElementById('modalCounselingAssignParish');
    if (assignParishEl && assignParishEl.selectedIndex > -1) {
        assignParishName = assignParishEl.options[assignParishEl.selectedIndex].dataset.name || '';
    }
    const assignDistrictName = document.getElementById('modalCounselingAssignDistrict')?.value || '';

    if (!finalName) return alert('상담 대상자 이름을 입력하세요.');
    if (!date) return alert('날짜를 입력하세요.');
    if (!content) return alert('상담 내용을 입력하세요.');

    const saveBtn = document.getElementById('saveMeeting');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    const statusLabel = memberStatus === 'evangelism' ? '전도대상' : '성도';

    try {
        if (currentMeetingId) {
            // 수정: PUT /api/counseling/:sessionId
            let fullContent = '';
            if (tags) fullContent = tags + '\n';
            fullContent += content;
            const editRemark = `[${method}상담][${statusLabel}]${remark ? ' ' + remark : ''}`;
            // currentMeetingId는 캘린더 진입 시(openGlobalMeetingEditor) meetings 테이블의
            // 원본 숫자 id로 세팅된다. /api/counseling/:sessionId는 'm_'(meetings 기반) 또는
            // 'r_'(레거시 member_records 기반) 접두어가 없으면 아무 것도 갱신하지 않고
            // {success:true}만 반환하므로, 접두어가 없는 경우 여기서 'm_'을 붙여준다.
            const rawId = String(currentMeetingId);
            const sessionId = /^(m_|r_)/.test(rawId) ? rawId : `m_${rawId}`;
            const res = await fetch(`/api/counseling/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date,
                    content: fullContent,
                    tags,
                    remark_memo: editRemark,
                    member_status: (isSalvationChecked || isAssignChecked) ? 'member' : memberStatus,
                    counseling_method: method,
                    category: document.getElementById('modalCounselingCategory')?.value || null,
                    bs: document.getElementById('modalCounselingBs')?.value || null,
                    member_id: document.getElementById('modalCounselingMemberId')?.value
                        ? parseInt(document.getElementById('modalCounselingMemberId').value) : null,
                    is_salvation_checked: isSalvationChecked,
                    is_assign_checked: isAssignChecked,
                    church: isAssignChecked ? '서울중앙교회' : null,
                    parish: isAssignChecked ? assignParishName : null,
                    district: isAssignChecked ? assignDistrictName : null
                })
            });
            if (!res.ok) throw new Error('수정 실패');
        } else {
            // 신규: POST /api/counseling
            const res = await fetch('/api/counseling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    member_id: ( (isSalvationChecked || isAssignChecked || memberStatus === 'member') && memberId ) ? parseInt(memberId) : null,
                    name: finalName, date, content,
                    tags: tags || null,
                    remark_memo: `[${method}상담][${statusLabel}]${remark ? ' ' + remark : ''}`,
                    category: category || null,
                    bs: bs || null,
                    member_status: (isSalvationChecked || isAssignChecked) ? 'member' : memberStatus,
                    is_salvation_checked: isSalvationChecked,
                    is_assign_checked: isAssignChecked,
                    church: isAssignChecked ? '서울중앙교회' : null,
                    parish: isAssignChecked ? assignParishName : null,
                    district: isAssignChecked ? assignDistrictName : null
                })
            });
            if (!res.ok) throw new Error('저장 실패');
        }

        // 저장 후 모달 닫기 및 캘린더 새로고침
        document.getElementById('meetingModal').classList.add('hidden');
        if (typeof editorSaveCallback === 'function') editorSaveCallback();
        if (typeof window.refetchEvents === 'function') window.refetchEvents();
    } catch(err) {
        console.error('counseling save error', err);
        alert('상담 저장 중 오류가 발생했습니다.');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장하기'; }
    }
}

// Handle Save
async function handleSaveMeeting() {
    // [중복 저장 방지] index.html에서는 app.js(addEventListener)와 meeting_editor.js(onclick)가
    // 같은 저장 버튼에 동시에 바인딩될 수 있다. 모달을 마지막으로 연 모듈(owner)만 저장을 수행한다.
    // (교구전체모임 이중 생성/출석 카운트 오염 버그의 원인)
    if (window.__meetingModalOwner && window.__meetingModalOwner !== 'editor') return;

    // 저장 전 입력 중인 주제 태그 텍스트 자동 추가 (모바일에서 엔터 없이 저장하는 경우 대비)
    const tagsInputEl = document.getElementById('meetingSermonTags');
    if (tagsInputEl && tagsInputEl.value) {
        const tagVal = tagsInputEl.value.replace(/[#,\s]/g, '').trim();
        if (tagVal && !currentSermonTagsList.includes(tagVal)) {
            currentSermonTagsList.push(tagVal);
            tagsInputEl.value = '';
            renderSermonTagBadges();
        } else {
            tagsInputEl.value = '';
        }
    }

    const typeCheck = document.getElementById('meetingType').value;
    if (typeCheck === '상담' || typeCheck === '개인상담') {
        await handleSaveCounseling();
        return;
    }

    const title = document.getElementById('meetingTitle').value.trim();
    const date = document.getElementById('meetingDate').value;
    const startTime = document.getElementById('meetingStartTime').value;
    const endTime = document.getElementById('meetingEndTime').value;
    const endDate = document.getElementById('meetingEndDate').value;
    const type = document.getElementById('meetingType').value;
    const sermon = document.getElementById('meetingSermon').value.trim();
    const memo = document.getElementById('meetingMemo').value.trim();
    const sermon_bible = document.getElementById('meetingSermonBible').value.trim();
    const sermon_tags = currentSermonTagsList.map(t => `#${t}`).join(' ');
    
    const rrule_type = document.getElementById('meetingRecurrence').value;
    const rrule_end_date = document.getElementById('meetingRecurrenceEndDate').value || null;

    if (!title || !date) return alert('제목과 날짜를 입력하세요.');

    let finalSermon = sermon;
    if (type === '설교') {
        const activeTagBtn = document.querySelector('.sermon-tag.bg-blue-600');
        let tagVal = '';
        if (activeTagBtn) {
            const val = activeTagBtn.getAttribute('data-value');
            if (val === '직접입력') {
                const directTagInput = document.getElementById('directSermonTag');
                tagVal = directTagInput ? directTagInput.value.trim() : '';
            } else {
                tagVal = val;
            }
        }
        if (tagVal) {
            finalSermon = `${sermon} (${tagVal})`;
        }
    }

    const executeSave = async (isSingleOnly = false) => {
        try {
            let finalMemo = memo;
            if (rrule_type && rrule_type !== 'none') {
                const meta = {
                    rrule_type,
                    rrule_end_date,
                    exdates: isSingleOnly ? (currentMeetingData.exdates || null) : (currentMeetingId ? (currentMeetingData.exdates || null) : null)
                };
                finalMemo = `__RECURRING__:${JSON.stringify(meta)}\n${memo}`;
            }

            if (isSingleOnly) {
                let newExdates = currentMeetingData.exdates ? `${currentMeetingData.exdates},${clickedInstanceDate}` : clickedInstanceDate;
                const parentMeta = {
                    rrule_type: currentMeetingData.rrule_type,
                    rrule_end_date: currentMeetingData.rrule_end_date,
                    exdates: newExdates
                };
                const parentMemo = `__RECURRING__:${JSON.stringify(parentMeta)}\n${currentMeetingData.memo}`;

                await fetch(`/api/meetings/${currentMeetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: currentMeetingData.title,
                        date: currentMeetingData.date,
                        end_date: currentMeetingData.end_date,
                        type: currentMeetingData.type,
                        sermon_title: currentMeetingData.sermon_title,
                        memo: parentMemo,
                        church: currentMeetingData.church,
                        start_time: currentMeetingData.start_time,
                        end_time: currentMeetingData.end_time
                    })
                });

                const newRes = await fetch('/api/meetings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        date: clickedInstanceDate,
                        end_date: endDate || null,
                        type,
                        sermon_title: finalSermon,
                        memo,
                        church: selectedChurch,
                        start_time: startTime || null,
                        end_time: endTime || null,
                        sermon_bible,
                        sermon_tags
                    })
                });
                const { id } = await newRes.json();

                const attData = Array.from(document.querySelectorAll('.attendance-row')).map(row => ({
                    member_id: parseInt(row.dataset.id),
                    is_present: row.dataset.present === 'true' ? 1 : 0,
                    testimony_snapshot: row.querySelector('.testimony-input').value.trim()
                }));
                await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting_id: id, attendance_data: attData }) });
            } else {
                const url = currentMeetingId ? `/api/meetings/${currentMeetingId}` : '/api/meetings';
                const res = await fetch(url, {
                    method: currentMeetingId ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        date,
                        end_date: endDate || null,
                        type,
                        sermon_title: finalSermon,
                        memo: finalMemo,
                        church: selectedChurch,
                        start_time: startTime || null,
                        end_time: endTime || null,
                        sermon_bible,
                        sermon_tags
                    })
                });
                const { id } = await res.json();
                const mid = currentMeetingId || id;

                const attData = Array.from(document.querySelectorAll('.attendance-row')).map(row => ({
                    member_id: parseInt(row.dataset.id),
                    is_present: row.dataset.present === 'true' ? 1 : 0,
                    testimony_snapshot: row.querySelector('.testimony-input').value.trim()
                }));
                await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting_id: mid, attendance_data: attData }) });
            }

            document.getElementById('meetingModal').classList.add('hidden');
            const panelCon = document.getElementById('meetingPanelsContainer');
            if (panelCon) {
                // Keep overlay slide-out state
                if (!window.location.pathname.includes('meeting_dashboard') && !window.location.pathname.includes('sermon_history')) {
                    panelCon.classList.add('translate-x-full');
                    setTimeout(() => { panelCon.classList.add('hidden'); }, 300);
                } else {
                    const detailPanel = document.getElementById('meetingDetailPanel');
                    if (detailPanel) detailPanel.classList.remove('hidden');
                }
            }

            if (editorSaveCallback) editorSaveCallback();

        } catch (err) {
            console.error(err);
            alert('저장 중 실패했습니다.');
        }
    };

    if (currentMeetingId && currentMeetingData && currentMeetingData.rrule_type && currentMeetingData.rrule_type !== 'none') {
        openRecurrenceConfirmModal(
            () => executeSave(true), // Single Only
            () => executeSave(false) // All
        );
    } else {
        executeSave(false);
    }
}

// Handle Delete
async function handleDeleteMeeting() {
    // [중복 삭제 방지] handleSaveMeeting과 동일한 owner 가드
    if (window.__meetingModalOwner && window.__meetingModalOwner !== 'editor') return;
    if (!currentMeetingId) return;

    const executeDelete = async (isSingleOnly = false) => {
        if (!confirm(isSingleOnly ? '이 모임 일정을 삭제하시겠습니까?' : '이 모임 일정을 전체 삭제하시겠습니까?')) return;
        try {
            if (isSingleOnly) {
                let newExdates = currentMeetingData.exdates ? `${currentMeetingData.exdates},${clickedInstanceDate}` : clickedInstanceDate;
                const parentMeta = {
                    rrule_type: currentMeetingData.rrule_type,
                    rrule_end_date: currentMeetingData.rrule_end_date,
                    exdates: newExdates
                };
                const parentMemo = `__RECURRING__:${JSON.stringify(parentMeta)}\n${currentMeetingData.memo}`;

                await fetch(`/api/meetings/${currentMeetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: currentMeetingData.title,
                        date: currentMeetingData.date,
                        end_date: currentMeetingData.end_date,
                        type: currentMeetingData.type,
                        sermon_title: currentMeetingData.sermon_title,
                        memo: parentMemo,
                        church: currentMeetingData.church,
                        start_time: currentMeetingData.start_time,
                        end_time: currentMeetingData.end_time
                    })
                });
            } else {
                await fetch(`/api/meetings/${currentMeetingId}`, { method: 'DELETE' });
            }

            document.getElementById('meetingModal').classList.add('hidden');
            const panelCon = document.getElementById('meetingPanelsContainer');
            if (panelCon) {
                if (!window.location.pathname.includes('meeting_dashboard') && !window.location.pathname.includes('sermon_history')) {
                    panelCon.classList.add('translate-x-full');
                    setTimeout(() => { panelCon.classList.add('hidden'); }, 300);
                } else {
                    const detailPanel = document.getElementById('meetingDetailPanel');
                    if (detailPanel) detailPanel.classList.remove('hidden');
                    
                    // Trigger custom close panel on dashboard / history pages to reset overlay
                    const overlay = document.getElementById('detailPanelOverlay');
                    const singleContainer = document.getElementById('singleMeetingDetailContainer');
                    const meetingList = document.getElementById('detailMeetingList');
                    const editBtnCon = document.getElementById('editBtnContainer');
                    const backBtn = document.getElementById('backToMeetingListBtn');
                    
                    if (window.location.pathname.includes('meeting_dashboard')) {
                        if (backBtn && !backBtn.classList.contains('hidden')) {
                            backBtn.click(); // Reset list state
                        } else {
                            if (overlay) overlay.click();
                        }
                    } else if (window.location.pathname.includes('sermon_history')) {
                        const cancelEditBtn = document.getElementById('cancelEditBtn');
                        const cancelMobileBtn = document.getElementById('mobileCancelBtn');
                        if (cancelEditBtn) cancelEditBtn.click();
                        if (cancelMobileBtn) cancelMobileBtn.click();
                        // Hide bottom sheet on mobile
                        if (panelCon && !panelCon.classList.contains('translate-y-full')) {
                            panelCon.classList.add('translate-y-full');
                        }
                    }
                }
            }

            if (editorDeleteCallback) editorDeleteCallback();

        } catch (err) {
            console.error(err);
            alert('삭제 중 실패했습니다.');
        }
    };

    if (currentMeetingData && currentMeetingData.rrule_type && currentMeetingData.rrule_type !== 'none') {
        openRecurrenceConfirmModal(
            () => executeDelete(true), // Single Only
            () => executeDelete(false) // All
        );
    } else {
        executeDelete(false);
    }
}

function openRecurrenceConfirmModal(onSingle, onAll) {
    const modal = document.getElementById('recurrenceConfirmModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    
    const btnSingle = document.getElementById('recurrenceActionSingle');
    const btnAll = document.getElementById('recurrenceActionAll');
    const btnCancel = document.getElementById('recurrenceActionCancel');
    
    btnSingle.onclick = () => { modal.classList.add('hidden'); onSingle(); };
    btnAll.onclick = () => { modal.classList.add('hidden'); onAll(); };
    btnCancel.onclick = () => { modal.classList.add('hidden'); };
}

// index.html의 app.js에서 접근 가능하도록 counseling 저장 함수 노출
window.handleSaveCounseling = handleSaveCounseling;

// 상담 기록 수정 전용 모달 열기
window.openCounselingEditModal = function(data) {
    // data = { sessionId, date, name, tags, content, memo, memberId, onSave }
    injectEditorElements();

    currentMeetingId = data.sessionId;
    window.__meetingModalOwner = 'editor'; // 저장/삭제 이중 실행 방지
    editorSaveCallback = data.onSave || null;

    // 모달 초기화
    resetCounselingPanel();

    // 타이틀
    const modalTitleEl = document.getElementById('modalTitle');
    if (modalTitleEl) modalTitleEl.textContent = '상담 기록 수정';

    // 일반 섹션 숨기고 counselingPanel 표시
    ['meetingTitleField','meetingRecurrenceSection','sermonSection','extraAttendeesSection','defaultAttendanceSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const counselingPanel = document.getElementById('counselingPanel');
    if (counselingPanel) counselingPanel.classList.remove('hidden');

    // meetingType (구분/번호 셀렉트 동기화 포함)
    window.setMeetingTypeValue('개인상담');

    // 삭제 버튼 숨김 (counseling_history에서 별도 처리)
    const deleteBtn = document.getElementById('deleteMeeting');
    if (deleteBtn) deleteBtn.classList.add('hidden');

    // 날짜
    const dateEl = document.getElementById('meetingDate');
    if (dateEl) dateEl.value = data.date || '';

    // 이름 / 익명 처리
    const isAnon = (data.name === '익명');
    const nameEl = document.getElementById('modalCounselingName');
    if (nameEl) {
        nameEl.value = data.name || '';
        nameEl.disabled = isAnon;
        nameEl.classList.toggle('opacity-50', isAnon);
        nameEl.classList.toggle('cursor-not-allowed', isAnon);
    }
    const anonEl = document.getElementById('modalAnonymousCheck');
    if (anonEl) anonEl.checked = isAnon;

    // memberId
    const memberIdEl = document.getElementById('modalCounselingMemberId');
    if (memberIdEl) memberIdEl.value = data.memberId || '';

    // memo 파싱 → 상담방식 + 대상유형 + 비고
    const memo = data.memo || '';
    const method = memo.includes('[전화상담]') ? '전화' : '대면';
    const counseleeType = memo.includes('[전도대상자]') ? '전도대상자' : '성도';
    const isSaint = counseleeType === '성도';

    // 비고: 접두어 제거
    const remarkStr = memo.replace(/\[(대면|전화)상담\]|\[(성도|전도대상자)\]/g, '').trim();
    const remarkEl = document.getElementById('modalCounselingRemark');
    if (remarkEl) remarkEl.value = remarkStr;

    // 상담방식 버튼
    const methodEl = document.getElementById('modalCounselingMethod');
    if (methodEl) methodEl.value = method;
    document.querySelectorAll('.modal-method-btn').forEach(b => {
        const isActive = b.dataset.val === method;
        b.classList.toggle('bg-indigo-600', isActive); b.classList.toggle('border-indigo-500', isActive); b.classList.toggle('text-white', isActive);
        b.classList.toggle('bg-white', !isActive); b.classList.toggle('dark:bg-slate-700', !isActive); b.classList.toggle('text-slate-600', !isActive);
        b.classList.toggle('dark:text-slate-300', !isActive); b.classList.toggle('border-slate-200', !isActive); b.classList.toggle('dark:border-slate-600', !isActive);
    });

    // 대상유형 버튼
    const ctypeEl = document.getElementById('modalCounseleeType');
    if (ctypeEl) ctypeEl.value = counseleeType;
    document.querySelectorAll('.modal-ctype-btn').forEach(b => {
        const isActive = b.dataset.val === counseleeType;
        b.classList.toggle('bg-indigo-600', isActive); b.classList.toggle('border-indigo-500', isActive); b.classList.toggle('text-white', isActive);
        b.classList.toggle('bg-white', !isActive); b.classList.toggle('dark:bg-slate-700', !isActive); b.classList.toggle('text-slate-600', !isActive);
        b.classList.toggle('dark:text-slate-300', !isActive); b.classList.toggle('border-slate-200', !isActive); b.classList.toggle('dark:border-slate-600', !isActive);
    });
    const saintSection = document.getElementById('modalSaintOnlySection');
    const saintPresets = document.getElementById('saintTagPresets');
    const evangelistPresets = document.getElementById('evangelistTagPresets');
    if (saintSection) saintSection.classList.toggle('hidden', !isSaint);
    if (saintPresets) saintPresets.classList.toggle('hidden', !isSaint);
    if (evangelistPresets) evangelistPresets.classList.toggle('hidden', isSaint);

    // 태그
    const tagsEl = document.getElementById('modalCounselingTags');
    if (tagsEl) tagsEl.value = data.tags || '';
    renderModalCounselTags();

    // 상담 내용
    const contentEl = document.getElementById('modalCounselingContent');
    if (contentEl) contentEl.value = data.content || '';

    // 모달 표시
    const modal = document.getElementById('meetingModal');
    if (modal) modal.classList.remove('hidden');
};

// Global Editor Entry Point
window.openGlobalMeetingEditor = async function(id, onSave, onDelete, defaultDate, defaultStartTime, defaultEndTime) {
    console.log("[DEBUG] openGlobalMeetingEditor called with id:", id);
    currentMeetingId = id;
    editorSaveCallback = onSave;
    editorDeleteCallback = onDelete;

    injectEditorElements();
    bindEditorEvents();

    if (!id) {
        console.log("[DEBUG] openGlobalMeetingEditor - No id, opening empty modal");
        const date = defaultDate || new Date().toISOString().split('T')[0];
        openMeetingModal(null, date);
        // 기본 시작/종료 시간 세팅
        if (defaultStartTime) {
            const stEl = document.getElementById('meetingStartTime');
            if (stEl) stEl.value = defaultStartTime;
        }
        if (defaultEndTime) {
            const etEl = document.getElementById('meetingEndTime');
            if (etEl) etEl.value = defaultEndTime;
        }
        return;
    }

    // Fetch and populate details
    try {
        console.log("[DEBUG] openGlobalMeetingEditor - Fetching /api/meetings");
        const res = await fetch('/api/meetings');
        const rawMs = await res.json();
        console.log("[DEBUG] openGlobalMeetingEditor - Fetched meetings count:", rawMs.length);
        
        const ms = rawMs.map(m => {
            let cleanMemo = m.memo || '';
            let rrule_type = 'none', rrule_end_date = '', exdates = '';
            if (cleanMemo.startsWith('__RECURRING__:')) {
                const parts = cleanMemo.split('\n');
                const jsonStr = parts[0].substring('__RECURRING__:'.length);
                cleanMemo = parts.slice(1).join('\n');
                try {
                    const parsed = JSON.parse(jsonStr);
                    rrule_type = parsed.rrule_type || 'none';
                    rrule_end_date = parsed.rrule_end_date || '';
                    exdates = parsed.exdates || '';
                } catch(e) {}
            }
            return {
                ...m,
                rrule_type,
                rrule_end_date,
                exdates,
                memo: cleanMemo
            };
        });

        const m = ms.find(x => x.id == id);
        console.log("[DEBUG] openGlobalMeetingEditor - Found meeting:", m);
        if (m) {
            currentMeetingData = m;
            clickedInstanceDate = m.date; 
            openMeetingModal(m.id, m.date, m.title, m.type, m.sermon_title, m.memo, m.church, m.end_date, m.start_time, m.end_time, m.rrule_type, m.rrule_end_date, m.sermon_bible, m.sermon_tags);
        } else {
            console.warn("[DEBUG] openGlobalMeetingEditor - No meeting found for id:", id);
        }
    } catch(err) {
        console.error(err);
        alert('모임 상세 정보를 가져오는 데 실패했습니다.');
    }
};

async function openMeetingModal(id, date, title = '', type = '', sermon = '', memo = '', church = '', end_date = '', startTime = '', endTime = '', rrule_type = 'none', rrule_end_date = '', sermon_bible = '', sermon_tags = '') {
    currentMeetingId = id; extraAttendees = [];
    window.__meetingModalOwner = 'editor'; // 저장/삭제 이중 실행 방지: 이 모듈이 모달 소유
    resetCounselingPanel();

    // 신규 등록 기본 구분: 관리자 설정의 첫 관리 구역 구역모임
    if (!type) type = await window.getDefaultMeetingType();

    document.getElementById('meetingRecurrence').value = rrule_type || 'none';
    document.getElementById('meetingRecurrenceEndDate').value = rrule_end_date || '';
    
    const recEndDateField = document.getElementById('recurrenceEndDateField');
    if (rrule_type && rrule_type !== 'none') {
        recEndDateField.classList.remove('hidden');
    } else {
        recEndDateField.classList.add('hidden');
    }
    
    const container = document.getElementById('meetingPanelsContainer');
    if (container) {
        container.classList.remove('hidden');
        setTimeout(() => { container.classList.remove('translate-x-full'); container.classList.add('translate-x-0'); }, 10);
    }

    document.getElementById('meetingModal').classList.remove('hidden'); 
    
    const detailPanel = document.getElementById('meetingDetailPanel');
    if (detailPanel) detailPanel.classList.add('hidden');
    
    document.getElementById('modalTitle').textContent = id ? '기록 수정' : '신규 일정 등록';
    document.getElementById('meetingTitle').value = title;
    document.getElementById('meetingDate').value = date;
    document.getElementById('meetingEndDate').value = end_date || '';
    document.getElementById('meetingSermonBible').value = sermon_bible || '';

    // 구분/번호 셀렉트 초기화 후 값 세팅 (번호 목록은 강효근 관리자 설정 기반, 저장 포맷은 결합 문자열 유지)
    await window.initMeetingTypeSelectors();
    window.setMeetingTypeValue(type);

    if (sermon_tags) {
        currentSermonTagsList = sermon_tags.split(/[,\s#]+/).map(t => t.trim()).filter(t => t.length > 0);
    } else {
        currentSermonTagsList = [];
    }
    renderSermonTagBadges();

    const tagsInput = document.getElementById('meetingSermonTags');
    if (tagsInput) tagsInput.value = '';

    let parsedSermonTitle = sermon || '';
    let parsedTag = '';
    if (type === '설교' && sermon) {
        const tagMatch = sermon.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (tagMatch) {
            parsedSermonTitle = tagMatch[1].trim();
            parsedTag = tagMatch[2].trim();
        }
    }

    document.getElementById('meetingSermon').value = parsedSermonTitle;
    document.getElementById('meetingMemo').value = memo;
    document.getElementById('deleteMeeting').classList.toggle('hidden', !id);

    const sermonTagsField = document.getElementById('sermonTagsField');
    if (sermonTagsField) {
        if (type === '설교') {
            sermonTagsField.classList.remove('hidden');
        } else {
            sermonTagsField.classList.add('hidden');
        }
    }
    const directTagInput = document.getElementById('directSermonTag');
    if (directTagInput) {
        directTagInput.value = parsedTag;
    }
    updateSermonTagActiveState(parsedTag);

    // Auto load sermon options
    try {
        const res = await fetch('/api/meetings');
        const ms = await res.json();
        const sermonTitles = [...new Set(ms
            .map(m => m.sermon_title)
            .filter(t => t && t.trim() !== '')
        )];
        const datalist = document.getElementById('sermonListOptions');
        if (datalist) {
            datalist.innerHTML = sermonTitles.map(t => `<option value="${t}"></option>`).join('');
        }
    } catch (err) {
        console.error(err);
    }

    // Time input recommend default hour
    const isAllDayEvent = document.getElementById('isAllDayEvent');
    const startTimeEl = document.getElementById('meetingStartTime');
    const endTimeEl = document.getElementById('meetingEndTime');
    const endTimeField = document.getElementById('meetingEndTimeField');
    if (isAllDayEvent && startTimeEl && endTimeEl) {
        let finalStartTime = startTime;
        let finalEndTime = endTime;

        if (!id && !startTime && type) {
            if (type.includes('구역모임')) { finalStartTime = '19:30'; finalEndTime = '21:30'; }
            else if (type.includes('조모임')) { finalStartTime = '10:30'; finalEndTime = '14:00'; }
        }

        const isAllDay = !finalStartTime;
        isAllDayEvent.checked = isAllDay;
        startTimeEl.value = finalStartTime || '';
        endTimeEl.value = finalEndTime || '';
        
        if (isAllDay) {
            startTimeEl.classList.add('hidden');
            endTimeField.classList.add('hidden');
        } else {
            startTimeEl.classList.remove('hidden');
            endTimeField.classList.remove('hidden');
        }
    }

    // Same day / end date binding
    const isSameDayEvent = document.getElementById('isSameDayEvent');
    const meetingEndDate = document.getElementById('meetingEndDate');
    const isSame = !end_date || date === end_date;
    if (isSameDayEvent && meetingEndDate) {
        isSameDayEvent.checked = isSame;
        if (isSame) {
            meetingEndDate.value = date;
            meetingEndDate.disabled = true;
            meetingEndDate.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        } else {
            meetingEndDate.value = end_date;
            meetingEndDate.disabled = false;
            meetingEndDate.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        }
    }

    selectedChurch = church || '';
    updateSelectedChurchUI();

    await refreshAttendanceList();
}

function initSermonTags() {
    const tagsContainer = document.getElementById('sermonTagsList');
    if (tagsContainer) {
        updateSermonTagActiveState('');
    }
}
initSermonTags();

})();
