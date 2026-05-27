const { contextBridge, ipcRenderer } = require('electron');

// ---------------------------------------------------------------------------
// Expose a safe, limited API to the renderer process via window.api.
// Every method maps 1:1 to an IPC channel handled in main.js.
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('api', {
    // ---- Client CRUD ----
    getClients: () => ipcRenderer.invoke('get-clients'),
    addClient: (client) => ipcRenderer.invoke('add-client', client),
    updateClients: (clients) => ipcRenderer.invoke('update-clients', clients),
    openClientWindow: (clientId) => ipcRenderer.send('open-client-window', clientId),

    // ---- Credential Security ----
    encryptCredential: (text) => ipcRenderer.invoke('secure:encrypt', text),
    injectCredential: (tabId, type, value, isEncrypted) =>
        ipcRenderer.send('inject-credential', tabId, type, value, isEncrypted),

    // ---- Tab Lifecycle ----
    createTab: (partition, url) => ipcRenderer.invoke('create-tab', partition, url),
    switchTab: (tabId) => ipcRenderer.send('switch-tab', tabId),
    closeTab: (tabId, partition) => ipcRenderer.send('close-tab', tabId, partition),

    // ---- View Geometry & Navigation ----
    resizeView: (bounds) => ipcRenderer.send('resize-view', bounds),
    hideView: () => ipcRenderer.send('hide-view'),
    showView: () => ipcRenderer.send('show-view'),
    navigate: (url) => ipcRenderer.send('navigate', url),
    reload: () => ipcRenderer.send('reload'),
    goBack: () => ipcRenderer.send('go-back'),
    goForward: () => ipcRenderer.send('go-forward'),

    // ---- Bookmarks Context Menus ----
    showBookmarkContextMenu: (clientId, bmId) => ipcRenderer.send('show-bookmark-context-menu', clientId, bmId),
    showBookmarksBarContextMenu: (clientId) => ipcRenderer.send('show-bookmarks-bar-context-menu', clientId),
    showBookmarkFolderMenu: (clientId, folder) => ipcRenderer.send('show-bookmark-folder-menu', clientId, JSON.stringify(folder)),

    onClientsUpdated: (callback) => {
        ipcRenderer.on('clients-updated', (_event, data) => callback(data));
    },
    onUrlUpdated: (callback) => {
        ipcRenderer.on('view-url-updated', (_event, data) => callback(data));
    },
    onTitleUpdated: (callback) => {
        ipcRenderer.on('view-title-updated', (_event, data) => callback(data));
    },
    onShortcutNewTab: (callback) => {
        ipcRenderer.on('shortcut-new-tab', () => callback());
    },
    onShortcutHistory: (callback) => {
        ipcRenderer.on('shortcut-history', () => callback());
    },
    onShortcutOpenTab: (callback) => {
        ipcRenderer.on('shortcut-open-tab', (_event, url) => callback(url));
    },
    onOpenLinkNewTab: (callback) => {
        ipcRenderer.on('open-link-new-tab', (_event, data) => callback(data));
    },
    onShowSaveCredentialPrompt: (callback) => {
        ipcRenderer.on('show-save-credential-prompt', (_event, username, password, title) =>
            callback(username, password, title)
        );
    },
    onBookmarkAction: (callback) => {
        ipcRenderer.on('bookmark-action', (_event, action, clientId, bmId) => callback(action, clientId, bmId));
    }
});
