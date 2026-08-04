// Global functions to be accessible from outside if necessary
window.applyTheme = function() {
    const theme = localStorage.getItem('theme') || 'system';
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Precise Login Page check to prevent any extension conflicts
    const isLoginPage = 
        window.location.pathname.endsWith('/login.html') || 
        window.location.pathname.endsWith('/login') || 
        (document.getElementById('loginForm') !== null && document.title.includes('로그인'));
    
    console.log(`[THEME DEBUG] path: ${window.location.pathname}, isLoginPage: ${isLoginPage}, theme: ${theme}`);

    if (isLoginPage) {
        document.documentElement.classList.add('dark');
    } else {
        if (theme === 'dark' || (theme === 'system' && darkQuery.matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
    
    // Highlight correct theme buttons
    const lightBtn = document.getElementById('themeLightBtn');
    const darkBtn = document.getElementById('themeDarkBtn');
    const systemBtn = document.getElementById('themeSystemBtn');
    if (!lightBtn || !darkBtn || !systemBtn) return;

    [lightBtn, darkBtn, systemBtn].forEach(btn => {
        btn.classList.remove('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-950/20', 'dark:border-blue-500/50', 'text-blue-600', 'dark:text-blue-400');
        btn.classList.add('border-slate-200', 'dark:border-slate-800', 'bg-slate-50', 'dark:bg-[#0B0F19]');
    });

    let activeBtn;
    if (theme === 'light') activeBtn = lightBtn;
    else if (theme === 'dark') activeBtn = darkBtn;
    else activeBtn = systemBtn;

    if (activeBtn) {
        activeBtn.classList.remove('border-slate-200', 'dark:border-slate-800', 'bg-slate-50', 'dark:bg-[#0B0F19]');
        activeBtn.classList.add('border-blue-500', 'bg-blue-50/50', 'dark:bg-blue-950/20', 'dark:border-blue-500/50', 'text-blue-600', 'dark:text-blue-400');
    }
};

function initThemeSystem() {
    console.log('[THEME DEBUG] initThemeSystem called');
    
    // Apply theme immediately
    window.applyTheme();

    // 3. Settings Modal State Transitions
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsModal = document.getElementById('closeSettingsModal');
    const settingsModalBackdrop = document.getElementById('settingsModalBackdrop');
    
    if (openSettingsBtn && settingsModal) {
        openSettingsBtn.onclick = () => {
            window.applyTheme();
            settingsModal.classList.remove('hidden');
            setTimeout(() => {
                const content = settingsModal.querySelector('.transform');
                if (content) {
                    content.classList.remove('scale-95', 'opacity-0');
                    content.classList.add('scale-100', 'opacity-100');
                }
            }, 10);
        };
    }
    
    function hideSettingsModal() {
        if (settingsModal) {
            const content = settingsModal.querySelector('.transform');
            if (content) {
                content.classList.remove('scale-100', 'opacity-100');
                content.classList.add('scale-95', 'opacity-0');
            }
            setTimeout(() => {
                settingsModal.classList.add('hidden');
            }, 200);
        }
    }
    
    if (closeSettingsModal) closeSettingsModal.onclick = hideSettingsModal;
    if (settingsModalBackdrop) settingsModalBackdrop.onclick = hideSettingsModal;
    
    // 4. Click handlers for Modal Options
    ['themeLightBtn', 'themeDarkBtn', 'themeSystemBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.onclick = () => {
                let mode = 'system';
                if (id === 'themeLightBtn') mode = 'light';
                else if (id === 'themeDarkBtn') mode = 'dark';
                
                console.log(`[THEME DEBUG] Clicked option: ${id}, mode: ${mode}`);
                localStorage.setItem('theme', mode);
                window.applyTheme();
            };
        }
    });

    // 5. System Preferences Event Listener
    if (!window.themeListenerAdded) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            const theme = localStorage.getItem('theme') || 'system';
            if (theme === 'system') window.applyTheme();
        });
        window.themeListenerAdded = true;
    }

    // 6. Counseling Tag Preset Management System
    initCounselingTagManager(hideSettingsModal);
}

// Global Tag Manager Module
window.CounselingTagManager = {
    cache: {
        memberTags: null,
        evangelismTags: null
    },
    defaultMemberTags: ['전도상담','구원확신/의심','진로','이성','죄','자녀','부부관계','가족','성경질문','이단','직장생활','결혼'],
    defaultEvangelismTags: ['전도상담', '성경', '인생', '하나님', '1일차 전체', '2일차 전체', '3일차 전체', '4일차 전체', '성경강연회', '구원'],

    async getMemberTags() {
        if (this.cache.memberTags) return this.cache.memberTags;
        try {
            const res = await fetch('/api/settings/counseling_member_tags');
            const data = await res.json();
            if (Array.isArray(data.value)) {
                this.cache.memberTags = data.value;
                return data.value;
            }
        } catch (e) {
            console.warn('[TAG MANAGER] Failed to fetch member tags, fallback to default:', e);
        }
        this.cache.memberTags = [...this.defaultMemberTags];
        return this.cache.memberTags;
    },

    async getEvangelismTags() {
        if (this.cache.evangelismTags) return this.cache.evangelismTags;
        try {
            const res = await fetch('/api/settings/counseling_evangelism_tags');
            const data = await res.json();
            if (Array.isArray(data.value)) {
                this.cache.evangelismTags = data.value;
                return data.value;
            }
        } catch (e) {
            console.warn('[TAG MANAGER] Failed to fetch evangelism tags, fallback to default:', e);
        }
        this.cache.evangelismTags = [...this.defaultEvangelismTags];
        return this.cache.evangelismTags;
    },

    async saveTags(memberTags, evangelismTags) {
        try {
            const p1 = fetch('/api/settings/counseling_member_tags', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: memberTags })
            });
            const p2 = fetch('/api/settings/counseling_evangelism_tags', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: evangelismTags })
            });
            await Promise.all([p1, p2]);
            this.cache.memberTags = [...memberTags];
            this.cache.evangelismTags = [...evangelismTags];
            
            // Dispatch event to update active UI
            window.dispatchEvent(new CustomEvent('counselingTagsUpdated', {
                detail: { memberTags, evangelismTags }
            }));
            return true;
        } catch (e) {
            console.error('[TAG MANAGER] Failed to save tags:', e);
            return false;
        }
    }
};

function initCounselingTagManager(hideSettingsModalFn) {
    const openTagManageBtn = document.getElementById('openTagManageBtn');
    const tagModal = document.getElementById('counselingTagManageModal');
    if (!tagModal) return;

    const backdrop = document.getElementById('counselingTagManageModalBackdrop');
    const closeBtn = document.getElementById('closeTagManageModal');
    const cancelBtn = document.getElementById('cancelTagManageBtn');
    const saveBtn = document.getElementById('saveTagManageBtn');

    const tabMemberBtn = document.getElementById('tagTabMemberBtn');
    const tabEvangelismBtn = document.getElementById('tagTabEvangelismBtn');
    const secMember = document.getElementById('tagSecMember');
    const secEvangelism = document.getElementById('tagSecEvangelism');

    const listMember = document.getElementById('tagListMember');
    const listEvangelism = document.getElementById('tagListEvangelism');
    const newMemberInput = document.getElementById('newMemberTagInput');
    const newEvangelismInput = document.getElementById('newEvangelismTagInput');
    const addMemberBtn = document.getElementById('addMemberTagBtn');
    const addEvangelismBtn = document.getElementById('addEvangelismTagBtn');

    let currentMemberTags = [];
    let currentEvangelismTags = [];

    function showTagModal() {
        if (typeof hideSettingsModalFn === 'function') hideSettingsModalFn();
        tagModal.classList.remove('hidden');
        setTimeout(() => {
            const content = tagModal.querySelector('.transform');
            if (content) {
                content.classList.remove('scale-95', 'opacity-0');
                content.classList.add('scale-100', 'opacity-100');
            }
        }, 10);
        loadAndRenderTags();
    }

    function hideTagModal() {
        const content = tagModal.querySelector('.transform');
        if (content) {
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
        }
        setTimeout(() => {
            tagModal.classList.add('hidden');
        }, 200);
    }

    async function loadAndRenderTags() {
        currentMemberTags = await window.CounselingTagManager.getMemberTags();
        currentEvangelismTags = await window.CounselingTagManager.getEvangelismTags();
        renderTagList('member');
        renderTagList('evangelism');
    }

    function renderTagList(type) {
        const listEl = type === 'member' ? listMember : listEvangelism;
        const tags = type === 'member' ? currentMemberTags : currentEvangelismTags;
        const badgeBg = type === 'member' 
            ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-700/40'
            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-700/40';

        if (!tags || tags.length === 0) {
            listEl.innerHTML = '<span class="text-slate-400 italic py-2 text-xs w-full text-center">등록된 태그가 없습니다.</span>';
            return;
        }

        listEl.innerHTML = tags.map((t, idx) => `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${badgeBg}">
                #${t}
                <button type="button" data-type="${type}" data-idx="${idx}" class="remove-tag-item-btn hover:text-red-500 font-black leading-none cursor-pointer">
                    &times;
                </button>
            </span>
        `).join('');
    }

    if (openTagManageBtn) openTagManageBtn.onclick = showTagModal;
    if (closeBtn) closeBtn.onclick = hideTagModal;
    if (backdrop) backdrop.onclick = hideTagModal;
    if (cancelBtn) cancelBtn.onclick = hideTagModal;

    // Tab Switch
    if (tabMemberBtn && tabEvangelismBtn) {
        tabMemberBtn.onclick = () => {
            tabMemberBtn.className = 'flex-1 py-2 font-black border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 text-center transition-colors';
            tabEvangelismBtn.className = 'flex-1 py-2 font-black border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-center transition-colors';
            secMember.classList.remove('hidden');
            secEvangelism.classList.add('hidden');
        };
        tabEvangelismBtn.onclick = () => {
            tabEvangelismBtn.className = 'flex-1 py-2 font-black border-b-2 border-orange-600 text-orange-600 dark:text-orange-400 text-center transition-colors';
            tabMemberBtn.className = 'flex-1 py-2 font-black border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-center transition-colors';
            secEvangelism.classList.remove('hidden');
            secMember.classList.add('hidden');
        };
    }

    // Add Tag Handlers
    function handleAddTag(type) {
        const inputEl = type === 'member' ? newMemberInput : newEvangelismInput;
        const val = (inputEl.value || '').trim().replace(/^#/, '');
        if (!val) return;

        const targetArr = type === 'member' ? currentMemberTags : currentEvangelismTags;
        if (targetArr.includes(val)) {
            alert('이미 존재하는 태그입니다.');
            return;
        }

        targetArr.push(val);
        inputEl.value = '';
        renderTagList(type);
    }

    if (addMemberBtn) addMemberBtn.onclick = () => handleAddTag('member');
    if (addEvangelismBtn) addEvangelismBtn.onclick = () => handleAddTag('evangelism');

    if (newMemberInput) {
        newMemberInput.onkeydown = (e) => { if (e.key === 'Enter') handleAddTag('member'); };
    }
    if (newEvangelismInput) {
        newEvangelismInput.onkeydown = (e) => { if (e.key === 'Enter') handleAddTag('evangelism'); };
    }

    // Remove Tag Handler (Event Delegation)
    if (tagModal) {
        tagModal.onclick = (e) => {
            const btn = e.target.closest('.remove-tag-item-btn');
            if (!btn) return;
            const type = btn.dataset.type;
            const idx = parseInt(btn.dataset.idx, 10);
            if (type === 'member') {
                currentMemberTags.splice(idx, 1);
                renderTagList('member');
            } else if (type === 'evangelism') {
                currentEvangelismTags.splice(idx, 1);
                renderTagList('evangelism');
            }
        };
    }

    // Save
    if (saveBtn) {
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = '저장 중...';
            const ok = await window.CounselingTagManager.saveTags(currentMemberTags, currentEvangelismTags);
            saveBtn.disabled = false;
            saveBtn.textContent = '저장하기';

            if (ok) {
                hideTagModal();
            } else {
                alert('태그 저장 중 오류가 발생했습니다.');
            }
        };
    }
}

// Robust execution wrapper for any load timings
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSystem);
} else {
    initThemeSystem();
}

