/**
 * AI 사역 비서 (Smart Pastoral Assistant) Floating Widget
 * - 상시 플로팅 액션 버튼 (FAB) 및 대화형 챗봇
 * - 한국어 음성 인식 (Web Speech API) 및 텍스트 대화 지원
 * - 자연어 일정 등록 (일정 잡아줘), 결석 성도 확인, 출석 통계, 설교/기록 검색
 */

(function () {
    // 중복 로드 방지
    if (window.__aiAssistantInitialized) return;
    window.__aiAssistantInitialized = true;

    // DOM 생성 함수
    function initAiAssistant() {
        if (document.getElementById('aiAssistantFab')) return;

        // 1. 플로팅 버튼 및 모달 HTML 주입
        const container = document.createElement('div');
        container.id = 'aiAssistantContainer';
        container.innerHTML = `
            <!-- Floating Action Button -->
            <button id="aiAssistantFab" type="button" aria-label="AI 사역 비서 열기"
                style="position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 9999;"
                class="fixed bottom-6 right-6 z-[9999] w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 text-white shadow-2xl flex items-center justify-center hover:scale-108 active:scale-95 transition-all duration-200 group cursor-pointer focus:outline-none ring-4 ring-purple-400/30">
                <span class="text-2xl md:text-3xl filter drop-shadow animate-pulse">✨</span>
                <span class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-white dark:border-slate-900 rounded-full"></span>
                <!-- Tooltip -->
                <span class="absolute right-full mr-3 px-3 py-1.5 rounded-xl bg-slate-900/90 text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                    AI 사역 비서 (음성·일정·통계)
                </span>
            </button>

            <!-- Chat Modal Box -->
            <div id="aiAssistantModal"
                style="position: fixed; bottom: 6rem; right: 1.25rem; z-index: 9999; width: min(94vw, 420px); height: min(82vh, 600px);"
                class="fixed bottom-24 right-4 sm:right-6 w-[94vw] max-w-[420px] h-[600px] max-h-[82vh] bg-white dark:bg-[#131B2E] rounded-3xl shadow-2xl border border-slate-200/90 dark:border-slate-800 flex flex-col overflow-hidden z-[9999] transition-all duration-300 transform scale-95 opacity-0 pointer-events-none">
                
                <!-- Modal Header -->
                <div class="p-4 bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white flex justify-between items-center shadow-sm select-none">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-lg shadow-inner">
                            ✨
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="font-black text-sm md:text-base leading-tight">AI 사역 비서</h3>
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white">Gemini</span>
                            </div>
                            <p class="text-[11px] text-purple-200/90 font-medium">일정 등록 · 결석자 조회 · 출석률 통계</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button id="aiAssistantClearBtn" type="button" title="대화 지우기" class="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        </button>
                        <button id="aiAssistantCloseBtn" type="button" title="닫기" class="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                </div>

                <!-- Chat Messages Body -->
                <div id="aiAssistantMessages" class="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50/50 dark:bg-[#0B0F19]/40 text-xs md:text-sm">
                    <!-- Welcome Bot Message -->
                    <div class="flex gap-2.5 items-start">
                        <div class="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                            AI
                        </div>
                        <div class="space-y-2 max-w-[85%]">
                            <div class="p-3 bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 leading-relaxed">
                                안녕하세요, 전도사님! 무엇을 도와드릴까요?<br>
                                아래 추천 질문을 누르시거나, <strong>마이크 🎙️</strong>로 말씀하셔도 바로 처리해 드립니다.
                            </div>
                            <!-- Suggestion Chips -->
                            <div class="flex flex-wrap gap-1.5 pt-1">
                                <button type="button" class="ai-chip px-2.5 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-xl text-[11px] font-bold border border-purple-200/80 dark:border-purple-800/60 transition cursor-pointer" data-prompt="다음 주 화요일 저녁 7시 30분에 581구역모임 일정 잡아줘">
                                    📅 화요일 구역모임 일정 잡기
                                </button>
                                <button type="button" class="ai-chip px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 rounded-xl text-[11px] font-bold border border-amber-200/80 dark:border-amber-800/60 transition cursor-pointer" data-prompt="최근 모임에 결석이 잦은 성도들 누구야?">
                                    ⚠️ 결석 많은 성도 확인
                                </button>
                                <button type="button" class="ai-chip px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-[11px] font-bold border border-blue-200/80 dark:border-blue-800/60 transition cursor-pointer" data-prompt="최근 모임 출석 현황과 통계 알려줘">
                                    📊 최근 출석 통계
                                </button>
                                <button type="button" class="ai-chip px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl text-[11px] font-bold border border-emerald-200/80 dark:border-emerald-800/60 transition cursor-pointer" data-prompt="최근 전한 설교 목록 검색해줘">
                                    📖 최근 설교 검색
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Voice Recording Indicator Banner -->
                <div id="aiVoiceRecordingBanner" class="hidden px-4 py-2 bg-rose-50 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-900/40 flex items-center justify-between text-xs text-rose-600 dark:text-rose-300 font-bold animate-pulse">
                    <span class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping"></span>
                        음성을 듣고 있습니다... 말씀해 주세요.
                    </span>
                    <button type="button" id="aiStopVoiceBtn" class="text-[11px] underline cursor-pointer hover:text-rose-700">녹음 종료</button>
                </div>

                <!-- Input Area Footer -->
                <div class="p-3 bg-white dark:bg-[#131B2E] border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <button id="aiAssistantMicBtn" type="button" title="음성으로 말하기"
                        class="p-2.5 rounded-2xl bg-slate-100 hover:bg-purple-50 text-slate-600 hover:text-purple-600 dark:bg-slate-800 dark:hover:bg-purple-950/40 dark:text-slate-300 dark:hover:text-purple-300 transition-all cursor-pointer focus:outline-none">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                    </button>
                    <input type="text" id="aiAssistantInput" placeholder="일정 등록, 결석자 조회, 질문 입력..."
                        class="flex-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl px-3.5 py-2.5 text-xs md:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition">
                    <button id="aiAssistantSendBtn" type="button" title="전송"
                        class="p-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white shadow-md active:scale-95 transition-all cursor-pointer focus:outline-none">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(container);

        // 이벤트 리스너 바인딩
        setupAiAssistantEvents();
    }

    function setupAiAssistantEvents() {
        const fab = document.getElementById('aiAssistantFab');
        const modal = document.getElementById('aiAssistantModal');
        const closeBtn = document.getElementById('aiAssistantCloseBtn');
        const clearBtn = document.getElementById('aiAssistantClearBtn');
        const input = document.getElementById('aiAssistantInput');
        const sendBtn = document.getElementById('aiAssistantSendBtn');
        const micBtn = document.getElementById('aiAssistantMicBtn');
        const voiceBanner = document.getElementById('aiVoiceRecordingBanner');
        const stopVoiceBtn = document.getElementById('aiStopVoiceBtn');
        const messages = document.getElementById('aiAssistantMessages');

        let isModalOpen = false;
        let isRecording = false;
        let recognition = null;
        let chatHistory = [];

        // 모달 열기/닫기 토글
        const toggleModal = () => {
            isModalOpen = !isModalOpen;
            if (isModalOpen) {
                modal.classList.remove('scale-95', 'opacity-0', 'pointer-events-none');
                modal.classList.add('scale-100', 'opacity-100', 'pointer-events-auto');
                input.focus();
            } else {
                modal.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto');
                modal.classList.add('scale-95', 'opacity-0', 'pointer-events-none');
                if (isRecording && recognition) recognition.stop();
            }
        };

        fab.addEventListener('click', toggleModal);
        closeBtn.addEventListener('click', toggleModal);

        // 추천 칩 클릭 이벤트
        containerClickHandler(messages, (promptText) => {
            input.value = promptText;
            sendMessage();
        });

        // 대화 지우기
        clearBtn.addEventListener('click', () => {
            chatHistory = [];
            const firstMsg = messages.children[0];
            messages.innerHTML = '';
            if (firstMsg) messages.appendChild(firstMsg);
        });

        // 텍스트 전송
        const sendMessage = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';

            // 사용자 메시지 렌더링
            appendUserMessage(text);
            scrollToBottom();

            // AI 로딩 상태 표시
            const loadingId = appendLoadingMessage();
            scrollToBottom();

            try {
                const savedKey = localStorage.getItem('GEMINI_API_KEY') || '';
                const todayStr = new Date().toISOString().split('T')[0];

                const res = await fetch('/api/ai/assistant', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-gemini-key': savedKey
                    },
                    body: JSON.stringify({
                        message: text,
                        history: chatHistory.slice(-8),
                        clientDate: todayStr
                    })
                });

                const data = await res.json();
                removeLoadingMessage(loadingId);

                if (!res.ok || !data.success) {
                    if (data.error === 'NO_API_KEY') {
                        promptApiKeyModal();
                        return;
                    }
                    throw new Error(data.error || '답변 생성에 실패했습니다.');
                }

                // AI 메시지 렌더링
                appendBotMessage(data.reply, data.action, data.resultMeta);
                chatHistory.push({ role: 'user', text });
                chatHistory.push({ role: 'model', text: data.reply });

                // 만약 일정이 등록되거나 설교가 수정되었다면 FullCalendar 새로고침
                if ((data.action === 'CREATE_MEETING' || data.action === 'UPDATE_SERMON') && typeof calendar !== 'undefined' && calendar.refetchEvents) {
                    calendar.refetchEvents();
                }

            } catch (err) {
                removeLoadingMessage(loadingId);
                appendBotMessage(`⚠️ 오류가 발생했습니다: ${err.message}`);
            }

            scrollToBottom();
        };

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        // Web Speech API 음성 인식 지원
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRec) {
            recognition = new SpeechRec();
            recognition.lang = 'ko-KR';
            recognition.continuous = false;
            recognition.interimResults = true;

            recognition.onstart = () => {
                isRecording = true;
                voiceBanner.classList.remove('hidden');
                micBtn.classList.add('bg-rose-500', 'text-white', 'animate-pulse');
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                input.value = finalTranscript || interimTranscript;
            };

            recognition.onerror = (event) => {
                console.warn('Speech recognition error:', event.error);
                stopVoiceRecording();
            };

            recognition.onend = () => {
                stopVoiceRecording();
                if (input.value.trim().length > 0) {
                    // 음성 인식이 완료되면 자동으로 질문 전송
                    sendMessage();
                }
            };

            function stopVoiceRecording() {
                isRecording = false;
                voiceBanner.classList.add('hidden');
                micBtn.classList.remove('bg-rose-500', 'text-white', 'animate-pulse');
            }

            micBtn.addEventListener('click', () => {
                if (isRecording) {
                    recognition.stop();
                } else {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.warn(e);
                    }
                }
            });

            stopVoiceBtn.addEventListener('click', () => {
                if (recognition) recognition.stop();
            });
        } else {
            micBtn.title = '이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome 권장)';
            micBtn.classList.add('opacity-50', 'cursor-not-allowed');
            micBtn.addEventListener('click', () => {
                alert('사용 중이신 브라우저는 음성 인식을 지원하지 않습니다. Google Chrome 또는 Edge 브라우저를 이용해 주세요.');
            });
        }

        function appendUserMessage(text) {
            const div = document.createElement('div');
            div.className = 'flex justify-end';
            div.innerHTML = `
                <div class="p-3 bg-purple-600 text-white rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] whitespace-pre-wrap leading-relaxed">
                    ${escapeHtml(text)}
                </div>
            `;
            messages.appendChild(div);
        }

        function appendLoadingMessage() {
            const id = 'loading_' + Date.now();
            const div = document.createElement('div');
            div.id = id;
            div.className = 'flex gap-2.5 items-start';
            div.innerHTML = `
                <div class="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0">AI</div>
                <div class="p-3 bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700/60 flex items-center gap-1.5 text-slate-400">
                    <span class="w-2 h-2 rounded-full bg-purple-500 animate-bounce"></span>
                    <span class="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:0.2s]"></span>
                    <span class="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:0.4s]"></span>
                </div>
            `;
            messages.appendChild(div);
            return id;
        }

        function removeLoadingMessage(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }

        function appendBotMessage(replyText, action, meta) {
            const div = document.createElement('div');
            div.className = 'flex gap-2.5 items-start';

            // 마크다운 줄바꿈 및 볼드 간단 파싱
            let formattedReply = escapeHtml(replyText)
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            let actionCardHtml = '';

            // 1. 일정 등록 완료 카드
            if (action === 'CREATE_MEETING' && meta?.createdMeeting) {
                const m = meta.createdMeeting;
                actionCardHtml = `
                    <div class="mt-2.5 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-200">
                        <div class="font-black text-sm flex items-center gap-1.5 mb-1 text-emerald-700 dark:text-emerald-300">
                            <span>✅</span> 달력 일정 등록 완료
                        </div>
                        <p class="font-bold text-slate-700 dark:text-slate-200">${m.title}</p>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400">${m.date} ${m.start_time ? m.start_time : ''} ~ ${m.end_time ? m.end_time : ''}</p>
                        <div class="mt-2">
                            <a href="/" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition shadow-sm">
                                달력에서 확인하기 →
                            </a>
                        </div>
                    </div>
                `;
            }
            // 1-2. 설교 제목 등록/수정 완료 카드
            else if (action === 'UPDATE_SERMON' && meta?.updatedMeeting) {
                const u = meta.updatedMeeting;
                actionCardHtml = `
                    <div class="mt-2.5 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/60 text-xs text-purple-900 dark:text-purple-200">
                        <div class="font-black text-sm flex items-center gap-1.5 mb-1 text-purple-700 dark:text-purple-300">
                            <span>🟣</span> 설교 제목 등록/수정 완료
                        </div>
                        <p class="font-bold text-slate-800 dark:text-slate-100">${escapeHtml(u.title)} <span class="text-[11px] text-slate-500 font-normal">(${u.date})</span></p>
                        <p class="text-xs font-black text-purple-600 dark:text-purple-400 mt-1">📖 설교: ${escapeHtml(u.sermon_title)}</p>
                        <div class="mt-2 flex gap-2">
                            <a href="/" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] transition shadow-sm">
                                달력에서 확인하기 →
                            </a>
                            <a href="/meeting_dashboard.html" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] transition shadow-sm">
                                모임 대시보드 →
                            </a>
                        </div>
                    </div>
                `;
            }

            // 2. 결석 성도 명단 카드
            else if (action === 'CHECK_ABSENTEES' && meta?.absentees && meta.absentees.length > 0) {
                actionCardHtml = `
                    <div class="mt-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60 text-xs">
                        <div class="font-black text-xs text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                            <span>⚠️</span> 최근 결석 및 관심 필요 성도 (${meta.absentees.length}명)
                        </div>
                        <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            ${meta.absentees.map(mem => `
                                <div class="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-amber-100 dark:border-amber-900/40 flex justify-between items-center">
                                    <div>
                                        <span class="font-bold text-slate-800 dark:text-slate-100">${mem.name}</span>
                                        <span class="text-[10px] text-slate-400 ml-1">(${mem.district})</span>
                                    </div>
                                    <span class="text-[11px] font-bold text-rose-500">
                                        최근 ${meta.meetingCount}회 중 ${mem.presentCount}회 출석
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-2">
                            <a href="/member_management.html" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition shadow-sm">
                                성도 관리 화면으로 이동 →
                            </a>
                        </div>
                    </div>
                `;
            }

            // 3. 출석 통계 카드
            else if (action === 'GET_STATS' && meta?.statsSummary && meta.statsSummary.length > 0) {
                actionCardHtml = `
                    <div class="mt-2.5 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/60 text-xs">
                        <div class="font-black text-xs text-blue-800 dark:text-blue-300 mb-2">
                            📊 최근 5개 모임 출석 요약
                        </div>
                        <div class="space-y-1.5">
                            ${meta.statsSummary.map(s => `
                                <div class="p-2 bg-white dark:bg-slate-800/80 rounded-lg flex justify-between items-center text-[11px]">
                                    <span class="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[180px]">${s.date} ${s.title}</span>
                                    <span class="font-black text-blue-600 dark:text-blue-400">${s.attendees}명 참석</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="mt-2">
                            <a href="/meeting_dashboard.html" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] transition shadow-sm">
                                모임 대시보드 전체 보기 →
                            </a>
                        </div>
                    </div>
                `;
            }

            // 4. 검색 결과 카드
            else if (action === 'SEARCH_RECORDS' && meta?.searchResults && meta.searchResults.length > 0) {
                actionCardHtml = `
                    <div class="mt-2.5 p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/60 text-xs">
                        <div class="font-black text-xs text-purple-800 dark:text-purple-300 mb-2">
                            🔍 검색된 사역/설교 기록 (${meta.searchResults.length}건)
                        </div>
                        <div class="space-y-1.5">
                            ${meta.searchResults.map(r => `
                                <div class="p-2 bg-white dark:bg-slate-800/80 rounded-lg border border-purple-100 dark:border-purple-900/30">
                                    <div class="flex justify-between items-center text-[10px] text-slate-400">
                                        <span>${r.date}</span>
                                        <span class="font-semibold text-purple-600 dark:text-purple-400">${r.type || '모임'}</span>
                                    </div>
                                    <p class="font-bold text-slate-800 dark:text-slate-200 text-xs mt-0.5">${r.sermon_title || r.title}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            div.innerHTML = `
                <div class="w-7 h-7 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm">
                    AI
                </div>
                <div class="space-y-1 max-w-[85%]">
                    <div class="p-3 bg-white dark:bg-slate-800 rounded-2xl rounded-tl-sm shadow-sm border border-slate-100 dark:border-slate-700/60 text-slate-800 dark:text-slate-100 leading-relaxed">
                        ${formattedReply}
                    </div>
                    ${actionCardHtml}
                </div>
            `;
            messages.appendChild(div);
        }

        function scrollToBottom() {
            messages.scrollTop = messages.scrollHeight;
        }

        function containerClickHandler(container, callback) {
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('.ai-chip');
                if (btn && btn.dataset.prompt) {
                    callback(btn.dataset.prompt);
                }
            });
        }

        function promptApiKeyModal() {
            appendBotMessage(`
                🔑 <strong>Google Gemini API 키 입력 필요</strong><br>
                AI 비서를 사용하려면 Gemini API 키가 필요합니다.
                <div class="mt-2 space-y-2">
                    <input type="text" id="aiInlineKeyInput" placeholder="Gemini API 키 붙여넣기..." class="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-purple-500">
                    <button type="button" id="aiSaveKeyBtn" class="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs cursor-pointer">
                        키 저장하고 계속하기
                    </button>
                    <p class="text-[10px] text-slate-400">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-purple-600 dark:text-purple-400 hover:underline">Google AI Studio에서 무료 키 발급받기 →</a>
                    </p>
                </div>
            `);
            const saveBtn = document.getElementById('aiSaveKeyBtn');
            const keyInput = document.getElementById('aiInlineKeyInput');
            if (saveBtn && keyInput) {
                saveBtn.onclick = () => {
                    const val = keyInput.value.trim();
                    if (!val) return alert('API 키를 입력해 주세요.');
                    localStorage.setItem('GEMINI_API_KEY', val);
                    appendBotMessage('✅ API 키가 저장되었습니다! 원하시는 작업을 다시 말씀해 주세요.');
                };
            }
        }

        function escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }
    }

    // 문서 로드 완료 시 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAiAssistant);
    } else {
        initAiAssistant();
    }
})();
