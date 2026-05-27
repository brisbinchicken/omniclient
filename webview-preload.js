const { ipcRenderer, contextBridge } = require('electron');

if (window.location.protocol === 'the-doctor:') {
    contextBridge.exposeInMainWorld('api', {
        getClients: () => ipcRenderer.invoke('get-clients'),
        updateClients: (clients) => ipcRenderer.invoke('update-clients', clients),
        showBookmarkContextMenu: (clientId, bmId) => ipcRenderer.send('show-bookmark-context-menu', clientId, bmId),
        onBookmarkAction: (callback) => {
            ipcRenderer.on('bookmark-action', (_event, action, clientId, bmId) => callback(action, clientId, bmId));
        }
    });
}

// ---------------------------------------------------------------------------
// Webview Preload — Injected into every WebContentsView page.
//
// Monitors login forms for credential entry and forwards captured
// username/password pairs back to the main process so the user can be
// prompted to save them.
// ---------------------------------------------------------------------------

/**
 * Safely extract username and password values from the current page.
 * Returns null if no password field is found or it is empty.
 */
function extractCredentials() {
    try {
        const pwdInput = document.querySelector('input[type="password"]');
        if (!pwdInput || !pwdInput.value) return null;

        // Attempt to locate the username field using common selectors
        const userInput =
            document.querySelector('input[type="email"]') ||
            document.querySelector('input[type="text"][name*="user"]') ||
            document.querySelector('input[type="text"][name*="email"]') ||
            document.querySelector('input[type="text"][name*="login"]') ||
            document.querySelector('input[type="text"]');

        return {
            username: userInput ? userInput.value : '',
            password: pwdInput.value,
            title: document.title || window.location.hostname
        };
    } catch (err) {
        console.error('extractCredentials failed:', err);
        return null;
    }
}

/**
 * Send extracted credentials to the main process for the save prompt.
 */
function sendCredentials(creds) {
    if (creds && creds.password) {
        ipcRenderer.send('prompt-save-credential', creds.username, creds.password, creds.title);
    }
}

// ---------------------------------------------------------------------------
// Event Listeners — all captured (useCapture: true) so they fire before
// the page's own handlers can preventDefault or stopPropagation.
// ---------------------------------------------------------------------------

// 1. Standard form submissions
window.addEventListener('submit', (e) => {
    sendCredentials(extractCredentials());
}, true);

// 2. Clicks on authentication-style buttons (covers SPAs like React/Angular)
window.addEventListener('click', (e) => {
    const btn = e.target.closest('button') || e.target.closest('input[type="submit"]');
    if (!btn) return;

    const text = (btn.textContent || btn.value || '').toLowerCase();
    const isAuthButton =
        btn.type === 'submit' ||
        text.includes('sign in') ||
        text.includes('log in') ||
        text.includes('next') ||
        text.includes('submit');

    if (isAuthButton) {
        sendCredentials(extractCredentials());
    }
}, true);

// 3. Enter keypress inside password fields
window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'INPUT' && e.target.type === 'password') {
        sendCredentials(extractCredentials());
    }
}, true);
