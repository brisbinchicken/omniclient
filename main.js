const { app, BrowserWindow, WebContentsView, ipcMain, safeStorage, Menu, MenuItem, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
    { scheme: 'the-doctor', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

app.setPath('userData', path.join(app.getPath('home'), '.config', 'the-doctor'));

const dataPath = path.join(app.getPath('userData'), 'clients.json');
const DEFAULT_URL = 'https://portal.office.com';

// windowId -> { window: BrowserWindow, clientId: string|null, activeTabId: string|null, viewBounds: Object }
let appWindows = {}; 
// tabId -> { view: WebContentsView, windowId: number, partition: string }
let tabs = {}; 

// ---------------------------------------------------------------------------
// Client Data Persistence
// ---------------------------------------------------------------------------
function loadClients() {
    try {
        if (fs.existsSync(dataPath)) {
            const raw = fs.readFileSync(dataPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed;
        }
    } catch (err) {
        console.error('Failed to load clients:', err);
    }
    return [];
}

function saveClients(clients) {
    try {
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dataPath, JSON.stringify(clients, null, 2), 'utf-8');
    } catch (err) {
        console.error('Failed to save clients:', err);
    }
}

// ---------------------------------------------------------------------------
// Keyboard Shortcut Forwarding
// ---------------------------------------------------------------------------
function attachKeyListeners(webContents, targetWindow) {
    webContents.on('before-input-event', (event, input) => {
        if (!input.control) return;
        const key = input.key.toLowerCase();
        if (key === 'n') {
            event.preventDefault();
            targetWindow.webContents.send('shortcut-new-tab');
        }
        if (key === 'h') {
            event.preventDefault();
            targetWindow.webContents.send('shortcut-history');
        }
    });
}

// ---------------------------------------------------------------------------
// Main Window Management
// ---------------------------------------------------------------------------
function createWindow(clientId = null, startUrl = null) {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'OmniClient',
        icon: path.join(__dirname, 'assets', 'omniclient-512.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    win.setMenu(null);
    attachKeyListeners(win.webContents, win);

    appWindows[win.id] = {
        window: win,
        clientId: clientId,
        activeTabId: null,
        viewBounds: { x: 200, y: 86, width: 800, height: 600 }
    };

    let query = '';
    if (clientId) {
        query = `?client=${encodeURIComponent(clientId)}`;
        if (startUrl) query += `&url=${encodeURIComponent(startUrl)}`;
    }
    
    win.loadFile('index.html', { search: query });

    win.on('closed', () => {
        // Cleanup tabs for this window
        Object.keys(tabs).forEach(tabId => {
            if (tabs[tabId].windowId === win.id) {
                tabs[tabId].view.webContents.destroy();
                delete tabs[tabId];
            }
        });
        delete appWindows[win.id];
    });

    return win;
}

// ---------------------------------------------------------------------------
// Tab Management
// ---------------------------------------------------------------------------
function createTab(windowId, partition, url) {
    const tabId = `tab_${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const view = new WebContentsView({
        webPreferences: {
            partition: partition,
            contextIsolation: true,
            preload: path.join(__dirname, 'webview-preload.js')
        }
    });

    const targetWindow = appWindows[windowId].window;

    // ---- Context menu ----
    view.webContents.on('context-menu', (_event, params) => {
        const menu = new Menu();
        
        if (params.linkURL) {
            menu.append(new MenuItem({
                label: 'Open link in new tab',
                click: () => {
                    targetWindow.webContents.send('shortcut-open-tab', params.linkURL);
                }
            }));
            menu.append(new MenuItem({
                label: 'Open link in new window',
                click: () => {
                    const clients = loadClients();
                    const client = clients.find(c => c.partition === partition);
                    if (client) {
                        createWindow(client.id, params.linkURL);
                    }
                }
            }));
            menu.append(new MenuItem({ type: 'separator' }));
        }

        if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
            for (const suggestion of params.dictionarySuggestions) {
                menu.append(new MenuItem({ label: suggestion, click: () => view.webContents.replaceMisspelling(suggestion) }));
            }
            menu.append(new MenuItem({ type: 'separator' }));
        }
        if (params.misspelledWord) {
            menu.append(new MenuItem({ label: 'Add to dictionary', click: () => view.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord) }));
            menu.append(new MenuItem({ type: 'separator' }));
        }
        menu.append(new MenuItem({ role: 'cut' }));
        menu.append(new MenuItem({ role: 'copy' }));
        menu.append(new MenuItem({ role: 'paste' }));
        menu.popup();
    });

    // ---- Navigation & events ----
    view.webContents.on('did-navigate', (_event, newUrl) => {
        targetWindow.webContents.send('view-url-updated', { tabId, url: newUrl });
    });
    view.webContents.on('did-navigate-in-page', (_event, newUrl) => {
        targetWindow.webContents.send('view-url-updated', { tabId, url: newUrl });
    });
    view.webContents.on('page-title-updated', (_event, title) => {
        targetWindow.webContents.send('view-title-updated', { tabId, title });
    });

    // Handle window.open natively
    view.webContents.setWindowOpenHandler((details) => {
        const clients = loadClients();
        const client = clients.find(c => c.partition === partition);
        if (client) {
            targetWindow.webContents.send('open-link-new-tab', { clientId: client.id, url: details.url });
        }
        return { action: 'deny' };
    });

    attachKeyListeners(view.webContents, targetWindow);
    
    let startUrl = url || DEFAULT_URL;
    if (!startUrl.startsWith('http://') && !startUrl.startsWith('https://') && !startUrl.startsWith('the-doctor://')) {
        startUrl = 'https://' + startUrl;
    }
    view.webContents.loadURL(startUrl);

    tabs[tabId] = { view, windowId, partition };
    return tabId;
}

// ---------------------------------------------------------------------------
// App Lifecycle & IPC
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
    function registerCustomProtocol(sess) {
        try {
            sess.protocol.handle('the-doctor', (request) => {
                const { net } = require('electron');
                let url = request.url.substr(13); // strip 'the-doctor://'
                url = url.split('?')[0].split('#')[0];
                
                let filePath;
                if (url === 'bookmarks' || url === 'bookmarks/') {
                    filePath = path.join(__dirname, 'bookmark-manager.html');
                } else if (url.startsWith('assets/')) {
                    filePath = path.join(__dirname, url);
                } else if (url.endsWith('bookmark-manager.js') || url.endsWith('styles.css') || url.endsWith('preload.js')) {
                    const fileName = url.split('/').pop();
                    filePath = path.join(__dirname, fileName);
                } else {
                    filePath = path.join(__dirname, 'index.html');
                }
                return net.fetch(`file://${filePath}`);
            });
        } catch (err) {
            // Ignore if already registered
        }
    }

    // Register for default session
    registerCustomProtocol(require('electron').session.defaultSession);

    // Register for all newly created sessions (like our client partitions)
    app.on('session-created', (sess) => {
        registerCustomProtocol(sess);
    });

    createWindow();

    ipcMain.handle('get-clients', () => loadClients());

    ipcMain.handle('add-client', (_event, client) => {
        const clients = loadClients();
        client.url = client.url || DEFAULT_URL;
        clients.push(client);
        saveClients(clients);
        return clients;
    });

    ipcMain.handle('update-clients', (_event, newClients) => {
        saveClients(newClients);
        for (const winId in appWindows) {
            if (appWindows[winId] && appWindows[winId].window) {
                appWindows[winId].window.webContents.send('clients-updated', newClients);
            }
        }
        return newClients;
    });

    // ---- Multi-Window routing ----
    ipcMain.on('open-client-window', (event, clientId) => {
        const senderId = BrowserWindow.fromWebContents(event.sender).id;
        const senderState = appWindows[senderId];

        // Check if window already exists for this client
        for (const winId in appWindows) {
            if (appWindows[winId].clientId === clientId) {
                appWindows[winId].window.focus();
                return;
            }
        }

        // If current window is unassigned, assign it and reload
        if (!senderState.clientId) {
            senderState.clientId = clientId;
            const query = `?client=${encodeURIComponent(clientId)}`;
            senderState.window.loadFile('index.html', { search: query });
            return;
        }

        // Spawn new window
        createWindow(clientId);
    });

    // ---- Tab lifecycle ----
    ipcMain.handle('create-tab', (event, partition, url) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        return createTab(winId, partition, url);
    });

    ipcMain.on('switch-tab', (event, tabId) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        
        if (winState.activeTabId && tabs[winState.activeTabId]) {
            winState.window.contentView.removeChildView(tabs[winState.activeTabId].view);
        }

        winState.activeTabId = tabId;
        const tabData = tabs[tabId];
        if (tabData) {
            winState.window.contentView.addChildView(tabData.view);
            tabData.view.setBounds(winState.viewBounds);
            winState.window.webContents.send('view-url-updated', { tabId, url: tabData.view.webContents.getURL() });
            winState.window.webContents.send('view-title-updated', { tabId, title: tabData.view.webContents.getTitle() });
        }
    });

    ipcMain.on('close-tab', (event, tabId, partition) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (!tabs[tabId]) return;

        if (winState.activeTabId === tabId) {
            winState.window.contentView.removeChildView(tabs[tabId].view);
            winState.activeTabId = null;
        }

        tabs[tabId].view.webContents.destroy();
        delete tabs[tabId];
    });

    // ---- View geometry ----
    ipcMain.on('resize-view', (event, bounds) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        winState.viewBounds = bounds;
        if (winState.activeTabId && tabs[winState.activeTabId]) {
            tabs[winState.activeTabId].view.setBounds(bounds);
        }
    });

    ipcMain.on('hide-view', (event) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (winState.activeTabId && tabs[winState.activeTabId]) {
            tabs[winState.activeTabId].view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
    });

    ipcMain.on('show-view', (event) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (winState.activeTabId && tabs[winState.activeTabId]) {
            tabs[winState.activeTabId].view.setBounds(winState.viewBounds);
        }
    });

    // ---- Navigation ----
    ipcMain.on('reload', (event) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (winState.activeTabId && tabs[winState.activeTabId]) {
            tabs[winState.activeTabId].view.webContents.reload();
        }
    });

    ipcMain.on('navigate', (event, url) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (!winState.activeTabId || !tabs[winState.activeTabId]) return;

        let targetUrl = url;
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://') && !targetUrl.startsWith('the-doctor://')) {
            targetUrl = 'https://' + targetUrl;
        }
        tabs[winState.activeTabId].view.webContents.loadURL(targetUrl);
    });

    ipcMain.on('go-back', (event) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (winState.activeTabId && tabs[winState.activeTabId] && tabs[winState.activeTabId].view.webContents.canGoBack()) {
            tabs[winState.activeTabId].view.webContents.goBack();
        }
    });

    ipcMain.on('go-forward', (event) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        const winState = appWindows[winId];
        if (winState.activeTabId && tabs[winState.activeTabId] && tabs[winState.activeTabId].view.webContents.canGoForward()) {
            tabs[winState.activeTabId].view.webContents.goForward();
        }
    });

    // ---- Credential Security ----
    ipcMain.handle('secure:encrypt', (_event, text) => {
        if (safeStorage.isEncryptionAvailable()) {
            return safeStorage.encryptString(text).toString('hex');
        }
        return 'unencrypted:' + Buffer.from(text).toString('hex');
    });

    ipcMain.on('inject-credential', (_event, tabId, type, value, isEncrypted) => {
        if (!tabs[tabId]) return;
        let injectValue = value;
        if (isEncrypted) {
            if (value.startsWith('unencrypted:')) {
                injectValue = Buffer.from(value.replace('unencrypted:', ''), 'hex').toString('utf8');
            } else if (safeStorage.isEncryptionAvailable()) {
                try { injectValue = safeStorage.decryptString(Buffer.from(value, 'hex')); } catch (err) { return; }
            } else return;
        }

        const jsCode = `
            (() => {
                let targetInput = document.activeElement && document.activeElement.tagName === 'INPUT' 
                    ? document.activeElement 
                    : document.querySelector('input[type="${type === 'password' ? 'password' : 'email'}"]') || document.querySelector('input[type="text"]');
                if (targetInput) {
                    targetInput.value = ${JSON.stringify(injectValue)};
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            })();
        `;
        tabs[tabId].view.webContents.executeJavaScript(jsCode).catch(() => {});
    });

    ipcMain.on('prompt-save-credential', (event, username, password, title) => {
        const winId = BrowserWindow.fromWebContents(event.sender).id;
        // The sender is the webview preload. We need to find the parent window.
        // Wait, event.sender is the webContents of the WebContentsView.
        // Let's find which tab this belongs to.
        let targetWindow = null;
        for (const tId in tabs) {
            if (tabs[tId].view.webContents === event.sender) {
                const wId = tabs[tId].windowId;
                if (appWindows[wId]) targetWindow = appWindows[wId].window;
                break;
            }
        }
        if (targetWindow) {
            targetWindow.webContents.send('show-save-credential-prompt', username, password, title);
        }
    });

    // ---- Bookmarks Context Menus ----
    ipcMain.on('show-bookmark-context-menu', (event, clientId, bmId) => {
        const sender = event.sender;
        const menu = new Menu();
        menu.append(new MenuItem({ label: 'Open in new tab', click: () => sender.send('bookmark-action', 'open-tab', clientId, bmId) }));
        menu.append(new MenuItem({ label: 'Open in new window', click: () => sender.send('bookmark-action', 'open-window', clientId, bmId) }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Edit...', click: () => sender.send('bookmark-action', 'edit', clientId, bmId) }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Delete', click: () => sender.send('bookmark-action', 'delete', clientId, bmId) }));
        menu.popup();
    });

    ipcMain.on('show-bookmark-folder-menu', (event, clientId, folderStr) => {
        const sender = event.sender;
        const folder = JSON.parse(folderStr);
        
        function buildMenu(items) {
            const m = new Menu();
            if (!items || items.length === 0) {
                m.append(new MenuItem({ label: '(Empty)', enabled: false }));
                return m;
            }
            for (const item of items) {
                if (item.type === 'folder') {
                    m.append(new MenuItem({
                        label: item.title,
                        submenu: buildMenu(item.children)
                    }));
                } else {
                    m.append(new MenuItem({
                        label: item.title || item.url,
                        click: () => sender.send('bookmark-action', 'navigate', clientId, item.url)
                    }));
                }
            }
            return m;
        }
        
        const menu = buildMenu(folder.children);
        menu.popup();
    });

    ipcMain.on('show-bookmarks-bar-context-menu', (event, clientId) => {
        const sender = event.sender;
        const menu = new Menu();
        menu.append(new MenuItem({ label: 'Add bookmark...', click: () => sender.send('bookmark-action', 'add-page', clientId, null) }));
        menu.append(new MenuItem({ label: 'Add folder...', click: () => sender.send('bookmark-action', 'add-folder', clientId, null) }));
        menu.append(new MenuItem({ type: 'separator' }));
        menu.append(new MenuItem({ label: 'Open bookmark manager', click: () => sender.send('bookmark-action', 'open-manager', clientId, null) }));
        menu.popup();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
