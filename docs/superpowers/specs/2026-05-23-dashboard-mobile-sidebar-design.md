# Design Spec: Mobile Sidebar Toggle and Responsive Dashboard

## Goal
Improve the mobile user experience for the dashboard by adding a functional sidebar toggle, ensuring it closes when interacting with the main content, and verifying the responsive layout.

## Sidebar Behavior
- The sidebar is hidden by default on mobile (`-translate-x-full absolute`).
- It is visible by default on desktop (`md:translate-x-0 md:relative`).
- Clicking the toggle button in the header opens the sidebar.
- Clicking the close button inside the sidebar closes it.
- Clicking anywhere in the `main` content area while the sidebar is open on mobile should close the sidebar.

## Implementation Details

### HTML (`public/dashboard.html`)
- Verify `button#toggleSidebar` and `button#closeSidebar` existence and styling.
- Ensure the sidebar has the correct Tailwind classes for responsive positioning: `absolute md:relative z-40 transform transition-transform duration-300 -translate-x-full md:translate-x-0`.

### JavaScript (`public/js/dashboard.js`)
- Implement `closeSidebarIfOpen()` function.
- Attach `click` event listener to the `main` element to call `closeSidebarIfOpen()`.
- Ensure the sidebar toggle and close buttons work as expected.

## Testing Strategy
- Manual verification of sidebar opening/closing on mobile (simulated).
- Verify desktop layout remains unaffected (sidebar always visible).
- Verify clicking on the table area closes the sidebar on mobile.
