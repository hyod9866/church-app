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
}

// Robust execution wrapper for any load timings
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSystem);
} else {
    initThemeSystem();
}

