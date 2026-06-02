# Dashboard Mobile Sidebar and Responsive UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement mobile sidebar toggle logic and ensure responsive layout for the dashboard.

**Architecture:** Use Tailwind CSS for responsive styling and Vanilla JS for toggle logic, matching the implementation in `index.html`/`app.js`.

**Tech Stack:** HTML5, Vanilla JavaScript, Tailwind CSS.

---

### Task 1: Verify and Update Dashboard HTML

**Files:**
- Modify: `public/dashboard.html`

- [ ] **Step 1: Verify Sidebar and Toggle Button Classes**
Ensure the sidebar and toggle buttons have the correct classes for mobile responsiveness.

```html
<!-- Header Toggle Button -->
<button id="toggleSidebar" class="md:hidden bg-blue-700 p-2 rounded">
    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
</button>

<!-- Sidebar -->
<aside id="sidebar" class="w-80 md:w-96 bg-white border-r overflow-y-auto p-4 flex flex-col flex-shrink-0 z-40 transition-transform duration-300 transform md:translate-x-0 -translate-x-full absolute md:relative h-full">
    <!-- Close Button inside Sidebar -->
    <button id="closeSidebar" class="md:hidden text-gray-500">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
    </button>
</aside>
```

- [ ] **Step 2: Add Backdrop for Mobile (Optional but recommended for UX)**
Actually, since `index.html` doesn't have one, I will stick to the existing design but ensure clicking on `main` closes it.

---

### Task 2: Implement Sidebar Logic in dashboard.js

**Files:**
- Modify: `public/js/dashboard.js`

- [ ] **Step 1: Define closeSidebarIfOpen function**
Add the helper function to close the sidebar if it's currently open.

```javascript
    // --- Sidebar Functions ---
    function closeSidebarIfOpen() {
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.add('-translate-x-full');
        }
    }
```

- [ ] **Step 2: Add click listener to main content**
Ensure clicking on the main content area closes the sidebar on mobile.

```javascript
    const mainContent = document.querySelector('main');
    if (mainContent) {
        mainContent.addEventListener('click', () => {
            if (window.innerWidth < 768) { // Only on mobile
                closeSidebarIfOpen();
            }
        });
    }
```

- [ ] **Step 3: Update Toggle and Close button listeners**
Ensure they are correctly attached (they already seem to be, but verify).

- [ ] **Step 4: Commit changes**

```bash
git add public/dashboard.html public/js/dashboard.js
git commit -m "feat: implement mobile sidebar toggle for dashboard"
```

---

### Task 3: Verification

- [ ] **Step 1: Check mobile layout**
Simulate mobile view and verify sidebar is hidden and toggle button is visible.
- [ ] **Step 2: Test toggle functionality**
Click toggle -> sidebar opens. Click close -> sidebar closes.
- [ ] **Step 3: Test outside click**
Click toggle -> sidebar opens. Click on the table -> sidebar closes.
