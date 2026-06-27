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
                    <div><label class="text-[10px] font-black text-slate-400 block mb-1 uppercase tracking-wider">구분</label><select id="meetingType" class="w-full border border-slate-200 dark:border-slate-700/60 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl px-2.5 py-2 text-xs md:text-sm font-bold bg-white dark:bg-slate-800 shadow-sm outline-none cursor-pointer transition duration-150 dark:text-slate-100 dark:focus:ring-blue-500/30"><option value="581구역모임">581구역모임</option><option value="582구역모임">582구역모임</option><option value="583구역모임">583구역모임</option><option value="581조모임">581조모임</option><option value="582조모임">582조모임</option><option value="583조모임">583조모임</option><option value="교구전체모임">교구전체모임</option><option value="교구형제모임">교구형제모임</option><option value="교구청년모임">교구청년모임</option><option value="교구임원모임">교구임원모임</option><option value="심방">심방</option><option value="상담">개인상담</option><option value="설교">내부설교</option><option value="외부설교">외부설교</option><option value="교회행사">교회행사</option><option value="기타">기타 모임</option></select></div>
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

                <div id="defaultAttendanceSection" class="min-h-[200px]"><div class="flex justify-between items-center mb-2.5"><h4 class="font-extrabold text-slate-800 dark:text-slate-200 text-sm">참석 체크</h4><span id="attendanceCount" class="text-[10px] font-black text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/30 px-2 py-0.5 rounded-full">0명 선택됨</span></div><div id="attendanceList" class="space-y-2 max-h-[600px] overflow-y-auto no-scrollbar"></div></div>
                <div id="extraAttendeesSection" class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 border-dashed"><div class="flex justify-between items-center mb-2.5"><h4 class="font-extrabold text-emerald-800 dark:text-emerald-450 text-sm">추가 인원</h4><button id="openExtraMemberSearch" class="text-[10px] font-black text-white bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 active:scale-[0.98] transition-all px-2.5 py-1.5 rounded-xl shadow-sm">+ 성도 검색</button></div><div id="extraAttendanceList" class="space-y-2"><p class="text-slate-400 italic text-xs text-center py-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 dark:text-slate-500">없음</p></div></div>
                <div id="counselingPanel" class="hidden space-y-4">
    <div class="relative">
        <label class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 block mb-1.5 uppercase tracking-wider">상담 대상자 *</label>
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
        <div class="flex gap-6">
            <div class="flex-1">
                <span class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">성별</span>
                <div class="flex gap-1.5" id="modalBsBtns">
                    <button type="button" data-val="B" class="modal-bs-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">형제</button>
                    <button type="button" data-val="S" class="modal-bs-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 transition-all">자매</button>
                </div>
                <input type="hidden" id="modalCounselingBs" value="">
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
</div>
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
    list.innerHTML = extraAttendees.map(m => `<div class="attendance-row p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl flex flex-col gap-2 shadow-sm" data-id="${m.id}" data-extra="true">
        <div class="flex items-center gap-3">
            <input type="checkbox" class="w-5 h-5 rounded is-present-check" ${m.is_present ? 'checked' : ''}>
            <span class="font-bold text-emerald-900 dark:text-emerald-300">${m.name}</span>
            <span class="text-[10px] bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">${m.district || ''}</span>
            <button class="ml-auto text-red-400 text-xs" onclick="removeExtra(${m.id})">삭제</button>
        </div>
        <input type="text" class="testimony-input w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#1b253b] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/30 focus:border-blue-500" placeholder="간증/기록 입력..." value="${m.testimony_snapshot || ''}">
    </div>`).join('');
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

// Bind all events inside meetingModal. Only run once.
function bindEditorEvents() {
    const modal = document.getElementById('meetingModal');
    if (!modal || modal._eventsBound) return;
    
    // Close / Cancel modal
    const closeBtn = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelMeeting');
    const handleClose = () => {
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
        tagsInput.addEventListener('blur', () => {
            flushTagInput();
        });
    }

    // 개인상담 패널 이벤트 바인딩
    // --- 이름 자동완성 ---
    const modalNameInput = document.getElementById('modalCounselingName');
    const modalSuggestions = document.getElementById('modalCounselingSuggestions');
    const modalMemberIdInput = document.getElementById('modalCounselingMemberId');
    if (modalNameInput && modalSuggestions) {
        modalNameInput.addEventListener('input', async () => {
            const val = modalNameInput.value.trim();
            if (val.length < 1) { modalSuggestions.classList.add('hidden'); modalMemberIdInput.value = ''; return; }
            try {
                const res = await fetch(`/api/members/search?name=${encodeURIComponent(val)}&status=active`);
                const list = await res.json();
                if (!list.length) { modalSuggestions.classList.add('hidden'); return; }
                modalSuggestions.innerHTML = list.slice(0, 8).map(m => `
                    <div class="px-3 py-2.5 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between"
                        data-id="${m.id}" data-name="${m.name}" data-category="${m.category || ''}" data-bs="${m.bs || ''}">
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
        });
        document.addEventListener('click', (e) => {
            if (!modalNameInput.contains(e.target) && !modalSuggestions.contains(e.target)) {
                modalSuggestions.classList.add('hidden');
            }
        });
    }

    // --- 소속 버튼 ---
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

    // --- 성별 버튼 ---
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

    // --- 상담 태그 프리셋 버튼 ---
    document.getElementById('modalCounselTagBtns')?.addEventListener('click', (e) => {
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

    // --- 커스텀 태그 추가 ---
    function addModalCustomTag() {
        const input = document.getElementById('modalCounselTagInput');
        if (!input) return;
        const val = input.value.replace(/[#\s,]/g, '').trim();
        if (!val) return;
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
        document.getElementById('attendanceList').innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">교회 행사는 참석 체크 대상자가 없습니다.</p>';
        
        const searchSection = document.getElementById('churchSearchSection');
        if (searchSection) {
            searchSection.classList.add('hidden');
            searchSection.style.display = 'none';
        }
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
    
    if (currentType.includes('구역모임') || currentType.includes('조모임')) {
        const distMatch = currentType.match(/\d+/);
        if (distMatch) targetParams.append('district', `${distMatch[0]}구역`);
    } else if (currentType === '교구임원모임') {
        targetParams.append('has_position', 'true');
    } else if (currentType.includes('형제모임')) {
        targetParams.append('category', '봉사회');
    } else if (currentType.includes('청년모임')) {
        targetParams.append('category', '청년회');
    } else if (['설교', '외부설교', '심방', '기타'].includes(currentType)) {
        document.getElementById('attendanceList').innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">대상자가 없습니다. 직접 검색하여 추가해 주세요.</p>';
        if (currentMeetingId) {
            const aRes = await fetch(`/api/meetings/${currentMeetingId}/attendance`);
            const att = await aRes.json();
            extraAttendees = att.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
            renderExtras();
        } else {
            extraAttendees = [];
            renderExtras();
        }
        return;
    }

    const mRes = await fetch(`/api/members/search?${targetParams.toString()}`);
    let members = await mRes.json();

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
        const isP = a ? a.is_present : false;
        const test = a ? (a.testimony_snapshot || '') : '';
        return `<div class="attendance-row p-3 bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 rounded-xl flex flex-col gap-2 shadow-sm" data-id="${m.id}">
            <div class="flex items-center gap-3">
                <input type="checkbox" class="w-5 h-5 rounded is-present-check" ${isP ? 'checked' : ''}>
                <span class="font-bold text-gray-800 dark:text-slate-200">${m.name}</span>
                <span class="text-[10px] bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-gray-500 dark:text-slate-400">${m.district}</span>
            </div>
            <input type="text" class="testimony-input w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#1b253b] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/30 focus:border-blue-500" placeholder="간증/기록 입력..." value="${test}">
        </div>`;
    };

    document.getElementById('attendanceList').innerHTML = members.map(renderRow).join('');
    
    if (currentMeetingId) {
        const memberIds = members.map(m => m.id);
        const extras = att.filter(a => !memberIds.includes(a.member_id) && a.is_present === 1);
        extraAttendees = extras.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
        renderExtras();
    } else {
        extraAttendees = [];
        renderExtras();
    }
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
                    'modalCounselingBs', 'modalCounselingTags', 'modalCounselingContent', 'modalCounselingRemark'];
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
    document.querySelectorAll('.mcounsel-tag-btn').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
        b.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
    });
    const sugg = document.getElementById('modalCounselingSuggestions');
    if (sugg) sugg.classList.add('hidden');
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

    if (!name) return alert('상담 대상자 이름을 입력하세요.');
    if (!date) return alert('날짜를 입력하세요.');
    if (!content) return alert('상담 내용을 입력하세요.');

    const saveBtn = document.getElementById('saveMeeting');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
        if (currentMeetingId) {
            // 수정: PUT /api/counseling/:sessionId
            // testimony_snapshot 재구성
            let fullContent = '';
            if (tags) fullContent = tags + '\n';
            fullContent += content;
            const res = await fetch(`/api/counseling/${currentMeetingId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: fullContent, tags, remark_memo: remark || null })
            });
            if (!res.ok) throw new Error('수정 실패');
        } else {
            // 신규: POST /api/counseling
            const res = await fetch('/api/counseling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    member_id: memberId ? parseInt(memberId) : null,
                    name, date, content,
                    tags: tags || null,
                    remark_memo: remark || null,
                    category: category || null,
                    bs: bs || null,
                    member_status: 'member'
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
                    is_present: row.querySelector('.is-present-check').checked ? 1 : 0,
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
                    is_present: row.querySelector('.is-present-check').checked ? 1 : 0,
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

// Global Editor Entry Point
window.openGlobalMeetingEditor = async function(id, onSave, onDelete) {
    console.log("[DEBUG] openGlobalMeetingEditor called with id:", id);
    currentMeetingId = id;
    editorSaveCallback = onSave;
    editorDeleteCallback = onDelete;
    
    injectEditorElements();
    bindEditorEvents();

    if (!id) {
        console.log("[DEBUG] openGlobalMeetingEditor - No id, opening empty modal");
        openMeetingModal(null, new Date().toISOString().split('T')[0]);
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

async function openMeetingModal(id, date, title = '', type = '581구역모임', sermon = '', memo = '', church = '', end_date = '', startTime = '', endTime = '', rrule_type = 'none', rrule_end_date = '', sermon_bible = '', sermon_tags = '') {
    currentMeetingId = id; extraAttendees = [];
    resetCounselingPanel();

    document.getElementById('meetingRecurrence').value = rrule_type || 'none';
    document.getElementById('meetingRecurrenceEndDate').value = rrule_end_date || '';
    
    const recEndDateField = document.getElementById('recurrenceEndDateField');
    if (rrule_type && rrule_type !== 'none') {
        recEndDateField.classList.remove('hidden');
    } else {
        recEndDateField.classList.add('hidden');
    }
    
    document.getElementById('meetingModal').classList.remove('hidden'); 
    
    const detailPanel = document.getElementById('meetingDetailPanel');
    if (detailPanel) detailPanel.classList.add('hidden');
    
    document.getElementById('modalTitle').textContent = id ? '기록 수정' : '신규 일정 등록';
    document.getElementById('meetingTitle').value = title;
    document.getElementById('meetingDate').value = date;
    document.getElementById('meetingEndDate').value = end_date || '';
    document.getElementById('meetingType').value = type;
    document.getElementById('meetingSermonBible').value = sermon_bible || '';
    
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
