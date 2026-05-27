/* ═══════════════════════════════════════════════════════════════
   The Doctor — Renderer Process (UI Logic)
   Version 46 Beta
   ═══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let clients = [];
let activeClientId = null;
let activeTabId = null;

// Per-client tab tracking: { [clientId]: [ { id, url, title } ] }
let clientTabsState = {};

let isVaultOpen = false;
let isHistoryOpen = false;
let isDropdownOpen = false;
let pendingCredential = null;

// Fallback colour palette when adding clients without the picker
const defaultColours = [
    '#264653', '#2a9d8f', '#e9c46a', '#f4a261',
    '#e76f51', '#3a0ca3', '#7209b7', '#4cc9f0'
];

// ── DOM References ────────────────────────────────────────────
const tabList            = document.getElementById('tab-list');
const addTabBtn          = document.getElementById('add-tab-btn');

const addressInput       = document.getElementById('address-input');
const backBtn            = document.getElementById('back-btn');
const forwardBtn         = document.getElementById('forward-btn');
const refreshBtn         = document.getElementById('refresh-btn');
const bookmarkBtn        = document.getElementById('bookmark-btn');
const historyBtn         = document.getElementById('history-btn');
const vaultToggleBtn     = document.getElementById('vault-toggle-btn');
const clientAvatarBtn    = document.getElementById('client-avatar-btn');

const bookmarksBar       = document.getElementById('bookmarks-bar');
const bookmarksList      = document.getElementById('bookmarks-list');
const bookmarksEmptyMsg  = document.getElementById('bookmarks-empty-msg');
const importBtn          = document.getElementById('import-bookmarks-btn');
const fileInput          = document.getElementById('bookmark-file-input');

const webviewContainer   = document.getElementById('webview-container');
const emptyState         = document.getElementById('empty-state');

const clientDropdown     = document.getElementById('client-dropdown');
const clientSearch       = document.getElementById('client-search');
const clientListEl       = document.getElementById('client-list');
const addClientBtn       = document.getElementById('add-client-btn');

const vaultContainer     = document.getElementById('vault-container');
const vaultCloseBtn      = document.getElementById('vault-close-btn');
const vaultClientName    = document.getElementById('vault-client-name');
const credentialsList    = document.getElementById('credentials-list');
const addCredWrapper     = document.getElementById('add-cred-wrapper');
const saveCredBtn        = document.getElementById('save-cred-btn');
const credLabel          = document.getElementById('cred-label');
const credUsername        = document.getElementById('cred-username');
const credPassword        = document.getElementById('cred-password');
const vaultSearch        = document.getElementById('vault-search');

const historyContainer   = document.getElementById('history-container');
const historyCloseBtn    = document.getElementById('history-close-btn');
const historyClientName  = document.getElementById('history-client-name');
const historyList        = document.getElementById('history-list');
const historySearch      = document.getElementById('history-search');
const clearHistoryBtn    = document.getElementById('clear-history-btn');

const cancelClientBtn    = document.getElementById('cancel-client-btn');
const saveClientBtn      = document.getElementById('save-client-btn');

const saveCredModal        = document.getElementById('save-cred-modal');
const saveCredSiteName     = document.getElementById('save-cred-site-name');
const saveCredLabelInput   = document.getElementById('save-cred-label');
const saveCredUsernameInput = document.getElementById('save-cred-username');
const saveCredDismissBtn   = document.getElementById('save-cred-dismiss-btn');
const saveCredConfirmBtn   = document.getElementById('save-cred-confirm-btn');


/* ═══════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════ */

async function init() {
    clients = await window.api.getClients();

    // Ensure every client has the expected arrays
    clients.forEach(c => {
        clientTabsState[c.id] = [];
        if (!c.bookmarks) c.bookmarks = [];
        function migrateBookmark(bm) {
            if (!bm.id) bm.id = 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9);
            if (!bm.type) bm.type = bm.url ? 'url' : 'folder';
            if (bm.type === 'folder' && !bm.children) bm.children = [];
            if (bm.children) bm.children.forEach(migrateBookmark);
        }
        c.bookmarks.forEach(migrateBookmark);
        if (!c.credentials) c.credentials = [];
        if (!c.history) c.history = [];
    });

    window.addEventListener('resize', updateViewBounds);
    setupEventListeners();

    // Check if we were launched with a specific client
    const urlParams = new URLSearchParams(window.location.search);
    const clientIdParam = urlParams.get('client');

    if (clientIdParam && clients.find(c => c.id === clientIdParam)) {
        switchClient(clientIdParam);
    } else {
        // No client selected -> empty state
        activeClientId = null;
        emptyState.classList.remove('hidden');
        bookmarksBar.classList.add('hidden');
    }
}


/* ═══════════════════════════════════════════════════════════
   VIEW BOUNDS — tells main process where to position WebContentsView
   ═══════════════════════════════════════════════════════════ */

function updateViewBounds() {
    if (!activeTabId || isDropdownOpen) return;

    const isModalOpen = !document.getElementById('client-modal').classList.contains('hidden') || 
                        !document.getElementById('bookmark-modal').classList.contains('hidden') ||
                        !document.getElementById('prompt-modal').classList.contains('hidden') ||
                        !document.getElementById('save-cred-modal').classList.contains('hidden');
    if (isModalOpen) return;

    const rect = webviewContainer.getBoundingClientRect();
    let width = Math.round(rect.width);
    let x = Math.round(rect.x);

    // Reduce width when side panels are open
    if (isVaultOpen) {
        width -= 380; // vault panel width
    }
    if (isHistoryOpen) {
        width -= 400; // history panel width
    }

    // Clamp to a minimum so we never send negative/zero
    if (width < 100) width = 100;

    window.api.resizeView({
        x,
        y: Math.round(rect.y),
        width,
        height: Math.round(rect.height)
    });
}


/* ═══════════════════════════════════════════════════════════
   CLIENT MANAGEMENT
   ═══════════════════════════════════════════════════════════ */

// ── Client Dropdown Toggle ──
function toggleDropdown() {
    if (isDropdownOpen) {
        closeDropdown();
    } else {
        openDropdown();
    }
}

function openDropdown() {
    // Close other panels first
    closeVault();
    closeHistory();

    isDropdownOpen = true;
    clientDropdown.classList.remove('hidden');
    clientSearch.value = '';
    clientSearch.focus();
    renderClientDropdown();
    clientAvatarBtn.classList.add('active');
    
    // Hide WebContentsView so the dropdown isn't obscured
    if (activeTabId) window.api.hideView();
}

function closeDropdown() {
    isDropdownOpen = false;
    clientDropdown.classList.add('hidden');
    clientAvatarBtn.classList.remove('active');
    
    // Restore WebContentsView
    if (activeTabId) window.api.showView();
}

// ── Render Client List in Dropdown ──

let draggedClientId = null;

function renderClientDropdown() {
    clientListEl.innerHTML = '';
    const query = clientSearch.value.toLowerCase().trim();
    const filtered = query
        ? clients.filter(c => c.name.toLowerCase().includes(query))
        : clients;

    if (filtered.length === 0) {
        const empty = document.createElement('li');
        empty.style.padding = '16px';
        empty.style.color = 'var(--chrome-text-secondary)';
        empty.style.textAlign = 'centre';
        empty.style.cursor = 'default';
        empty.textContent = query ? 'No matching clients' : 'No clients yet';
        clientListEl.appendChild(empty);
        return;
    }

    filtered.forEach(client => {
        const li = document.createElement('li');
        li.setAttribute('draggable', 'true');
        li.dataset.clientId = client.id;

        // Coloured avatar
        const avatar = document.createElement('div');
        avatar.className = 'client-list-avatar';
        avatar.style.backgroundColor = client.color || 'var(--accent)';
        avatar.textContent = client.name.charAt(0).toUpperCase();

        // Name
        const nameSpan = document.createElement('span');
        nameSpan.className = 'client-list-name';
        nameSpan.textContent = client.name;

        // Edit button (visible on hover via CSS)
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-client-btn';
        editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        editBtn.title = 'Edit client';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openClientModal(client.id);
        });

        // Delete button (visible on hover via CSS)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-client-btn';
        deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        deleteBtn.title = 'Delete client';
        deleteBtn.addEventListener('click', (e) => deleteClient(client.id, e));

        li.appendChild(avatar);
        li.appendChild(nameSpan);
        li.appendChild(editBtn);
        li.appendChild(deleteBtn);

        if (client.id === activeClientId) {
            li.classList.add('active');
        }

        // ── Drag-to-reorder ──
        li.addEventListener('dragstart', (e) => {
            draggedClientId = client.id;
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            draggedClientId = null;
            clientListEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedClientId && draggedClientId !== client.id) {
                li.classList.add('drag-over');
            }
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', async (e) => {
            e.preventDefault();
            li.classList.remove('drag-over');
            if (!draggedClientId || draggedClientId === client.id) return;

            const fromIndex = clients.findIndex(c => c.id === draggedClientId);
            const toIndex = clients.findIndex(c => c.id === client.id);
            if (fromIndex === -1 || toIndex === -1) return;

            const [moved] = clients.splice(fromIndex, 1);
            clients.splice(toIndex, 0, moved);
            await window.api.updateClients(clients);
            renderClientDropdown();
        });

        li.addEventListener('click', () => {
            window.api.openClientWindow(client.id);
            closeDropdown();
        });

        clientListEl.appendChild(li);
    });
}

// ── Switch Active Client ──
async function switchClient(clientId) {
    activeClientId = clientId;
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    // Update avatar button to reflect active client
    updateAvatarButton(client);
    emptyState.classList.add('hidden');

    renderBookmarks(clientId);

    // Open (or switch to) tabs for this client
    if (!clientTabsState[clientId] || clientTabsState[clientId].length === 0) {
        await createNewTab(client);
    } else {
        const lastTab = clientTabsState[clientId][clientTabsState[clientId].length - 1];
        switchTab(clientId, lastTab.id);
    }

    // If vault is open, refresh it for the new client
    if (isVaultOpen) renderVault(client);
    if (isHistoryOpen) {
        const cl = clients.find(c => c.id === activeClientId);
        if (cl) renderHistory(cl);
    }
}

// ── Delete Client ──
async function deleteClient(clientId, event) {
    event.stopPropagation();
    if (!confirm('Are you sure you want to delete this client?')) return;

    const clientToDelete = clients.find(c => c.id === clientId);
    if (!clientToDelete) return;

    // Close all tabs belonging to this client
    const tabsToClose = clientTabsState[clientId] ? [...clientTabsState[clientId]] : [];
    tabsToClose.forEach(t => {
        window.api.closeTab(t.id, clientToDelete.partition);
    });

    clients = clients.filter(c => c.id !== clientId);
    await window.api.updateClients(clients);
    delete clientTabsState[clientId];

    if (activeClientId === clientId) {
        activeClientId = null;
        activeTabId = null;
        emptyState.classList.remove('hidden');
        bookmarksBar.classList.add('hidden');
        addressInput.value = '';
        tabList.innerHTML = '';
        resetAvatarButton();
    }

    renderClientDropdown();
}

// ── Add Client ──
async function saveClient(id, name, colour, url) {
    if (id) {
        const client = clients.find(c => c.id === id);
        if (client) {
            client.name = name;
            client.color = colour;
            client.url = url || 'https://portal.office.com';
            clients = await window.api.updateClients(clients);
            renderClientDropdown();
            if (activeClientId === id) {
                updateAvatarButton(client);
            }
        }
    } else {
        const partitionRaw = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const partition = `persist:${partitionRaw}`;

        const newClient = {
            id: Date.now().toString(),
            name,
            partition,
            color: colour || defaultColours[clients.length % defaultColours.length],
            bookmarks: [],
            credentials: [],
            history: [],
            url: url || 'https://portal.office.com'
        };

        clients = await window.api.addClient(newClient);
        clientTabsState[newClient.id] = [];
        renderClientDropdown();
    }
}

// ── Avatar Button Helpers ──
function updateAvatarButton(client) {
    clientAvatarBtn.style.backgroundColor = client.color || 'var(--chrome-border)';
    clientAvatarBtn.textContent = client.name.charAt(0).toUpperCase();
    clientAvatarBtn.title = `Client: ${client.name}`;
    const activeClientNameEl = document.getElementById('active-client-name');
    if (activeClientNameEl) {
        activeClientNameEl.textContent = client.name;
        activeClientNameEl.classList.remove('hidden');
    }
}

function resetAvatarButton() {
    clientAvatarBtn.style.backgroundColor = 'var(--chrome-border)';
    clientAvatarBtn.textContent = '';
    clientAvatarBtn.title = 'Switch client';
    const activeClientNameEl = document.getElementById('active-client-name');
    if (activeClientNameEl) {
        activeClientNameEl.textContent = '';
        activeClientNameEl.classList.add('hidden');
    }
}


/* ═══════════════════════════════════════════════════════════
   TAB MANAGEMENT
   ═══════════════════════════════════════════════════════════ */

async function createNewTab(client, url = null) {
    const startUrl = url || client.url || 'https://portal.office.com';
    const tabId = await window.api.createTab(client.partition, startUrl);

    const newTab = { id: tabId, url: startUrl, title: 'Loading…' };
    if (!clientTabsState[client.id]) clientTabsState[client.id] = [];
    clientTabsState[client.id].push(newTab);

    switchTab(client.id, tabId);
}

function switchTab(clientId, tabId) {
    activeTabId = tabId;
    window.api.switchTab(tabId);

    const tabData = clientTabsState[clientId]?.find(t => t.id === tabId);
    if (tabData) {
        addressInput.value = tabData.url;
    }

    renderTabs(clientId);
    setTimeout(updateViewBounds, 50);
}

function closeTab(clientId, tabId, event) {
    if (event) event.stopPropagation();
    const client = clients.find(c => c.id === clientId);
    if (!client) return;

    window.api.closeTab(tabId, client.partition);
    clientTabsState[clientId] = clientTabsState[clientId].filter(t => t.id !== tabId);

    if (clientTabsState[clientId].length === 0) {
        activeTabId = null;
        createNewTab(client);
    } else if (activeTabId === tabId) {
        const nextTab = clientTabsState[clientId][clientTabsState[clientId].length - 1];
        switchTab(clientId, nextTab.id);
    } else {
        renderTabs(clientId);
    }
}

function renderTabs(clientId) {
    // Instead of innerHTML = '', clear only the tabs
    Array.from(tabList.children).forEach(child => {
        if (child !== addTabBtn) child.remove();
    });

    const tabs = clientTabsState[clientId] || [];
    const client = clients.find(c => c.id === clientId);
    const dotColour = client?.color || 'var(--accent)';

    tabs.forEach(tab => {
        const li = document.createElement('li');
        li.className = 'tab';
        if (tab.id === activeTabId) li.classList.add('active');

        // Coloured dot
        const dot = document.createElement('span');
        dot.className = 'tab-dot';
        dot.style.backgroundColor = dotColour;

        // Title
        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        titleSpan.textContent = tab.title || 'New Tab';

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-tab-btn';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (e) => closeTab(clientId, tab.id, e));

        li.appendChild(dot);
        li.appendChild(titleSpan);
        li.appendChild(closeBtn);

        // Click to switch, middle-click to close
        li.addEventListener('click', () => switchTab(clientId, tab.id));
        li.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                closeTab(clientId, tab.id, e);
            }
        });

        tabList.insertBefore(li, addTabBtn);
    });
}


/* ═══════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════ */

function navigateFromAddressBar() {
    let url = addressInput.value.trim();
    if (!url) return;
    window.api.navigate(url);
}


/* ═══════════════════════════════════════════════════════════
   BOOKMARKS
   ═══════════════════════════════════════════════════════════ */

function renderBookmarks(clientId) {
    bookmarksList.innerHTML = '';
    const client = clients.find(c => c.id === clientId);

    if (!client || !client.bookmarks || client.bookmarks.length === 0) {
        bookmarksBar.classList.remove('hidden');
        bookmarksEmptyMsg.classList.remove('hidden');
        setTimeout(updateViewBounds, 50);
        return;
    }

    bookmarksBar.classList.remove('hidden');
    bookmarksEmptyMsg.classList.add('hidden');

    function createBookmarkElement(bm, isDropdownItem = false) {
        const btn = document.createElement('button');
        btn.className = isDropdownItem ? 'bookmark-dropdown-item' : 'bookmark-item';
        
        if (bm.type === 'folder') {
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> <span>${bm.title}</span>`;
            btn.classList.add('bookmark-folder');
            
            // Left click to open native popup menu
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.api.showBookmarkFolderMenu(activeClientId, bm);
            });

            const wrapper = document.createElement('div');
            wrapper.className = 'bookmark-folder-wrapper';
            wrapper.appendChild(btn);
            
            // Right-click to open context menu for folder
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.api.showBookmarkContextMenu(activeClientId, bm.id);
            });
            return wrapper;

        } else {
            // It's a URL
            btn.textContent = bm.title || bm.url;
            btn.title = bm.url;

            // Left-click navigates; Ctrl+click or middle-click opens in new tab
            btn.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    createNewTab(client, bm.url);
                } else {
                    window.api.navigate(bm.url);
                }
            });

            btn.addEventListener('auxclick', (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    createNewTab(client, bm.url);
                }
            });

            // Right-click to open context menu
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.api.showBookmarkContextMenu(activeClientId, bm.id);
            });

            return btn;
        }
    }

    client.bookmarks.forEach(bm => {
        bookmarksList.appendChild(createBookmarkElement(bm));
    });

    setTimeout(updateViewBounds, 50);
}

async function bookmarkCurrentPage() {
    if (!activeClientId || !activeTabId) return;
    const client = clients.find(c => c.id === activeClientId);
    if (!client) return;

    const tab = clientTabsState[activeClientId]?.find(t => t.id === activeTabId);
    if (!tab) return;

    if (!client.bookmarks) client.bookmarks = [];

    // Avoid duplicates
    let bm = client.bookmarks.find(b => b.url === tab.url);
    if (!bm) {
        bm = { 
            id: 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
            type: 'url',
            title: tab.title || 'Bookmark', 
            url: tab.url 
        };
        client.bookmarks.push(bm);
        await window.api.updateClients(clients);
        renderBookmarks(activeClientId);
    }
    
    // Open edit modal for the newly added or existing bookmark
    openBookmarkEditModal(client, bm);
}

async function importBookmarks(file) {
    if (!file || !activeClientId) return;
    const client = clients.find(c => c.id === activeClientId);
    if (!client) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        const html = event.target.result;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links = doc.querySelectorAll('a');

        if (!client.bookmarks) client.bookmarks = [];

        let importedCount = 0;
        links.forEach(a => {
            const url = a.href;
            const title = a.textContent || 'Bookmark';
            if (url && !client.bookmarks.find(b => b.url === url)) {
                client.bookmarks.push({ 
                    id: 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
                    type: 'url',
                    title, 
                    url 
                });
                importedCount++;
            }
        });

        if (importedCount > 0) {
            await window.api.updateClients(clients);
            renderBookmarks(activeClientId);
            alert(`Successfully imported ${importedCount} bookmarks.`);
        } else {
            alert('No new bookmarks found to import.');
        }

        fileInput.value = '';
    };
    reader.readAsText(file);
}


/* ═══════════════════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════════════════ */

function toggleHistory() {
    if (isHistoryOpen) {
        closeHistory();
    } else {
        openHistory();
    }
}

function openHistory() {
    closeVault();      // Only one side panel at a time
    closeDropdown();

    isHistoryOpen = true;
    historyContainer.classList.remove('hidden');
    historySearch.value = '';
    setTimeout(updateViewBounds, 50);

    if (activeClientId) {
        const client = clients.find(c => c.id === activeClientId);
        if (client) renderHistory(client);
    } else {
        historyClientName.textContent = 'Select a client to view history.';
        historyList.innerHTML = '';
    }
}

function closeHistory() {
    isHistoryOpen = false;
    historyContainer.classList.add('hidden');
    setTimeout(updateViewBounds, 50);
}

function renderHistory(client, filter = '') {
    historyClientName.textContent = `History for ${client.name}`;
    historyList.innerHTML = '';

    if (!client.history || client.history.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No browsing history yet.</p>';
        return;
    }

    const query = filter.toLowerCase().trim();
    const filtered = query
        ? client.history.filter(e =>
            (e.title || '').toLowerCase().includes(query) ||
            (e.url || '').toLowerCase().includes(query)
        )
        : client.history;

    if (filtered.length === 0) {
        historyList.innerHTML = '<p class="history-empty">No results found.</p>';
        return;
    }

    filtered.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const time = new Date(entry.timestamp);
        const timeStr = time.toLocaleString();

        item.innerHTML = `
            <span class="history-title">${entry.title || entry.url}</span>
            <span class="history-url">${entry.url}</span>
            <span class="history-time">${timeStr}</span>
        `;

        item.addEventListener('click', () => {
            window.api.navigate(entry.url);
        });

        // Middle-click opens in new tab
        item.addEventListener('auxclick', (e) => {
            if (e.button === 1 && activeClientId) {
                e.preventDefault();
                const cl = clients.find(c => c.id === activeClientId);
                if (cl) createNewTab(cl, entry.url);
            }
        });

        historyList.appendChild(item);
    });
}


/* ═══════════════════════════════════════════════════════════
   VAULT (Credential Management)
   ═══════════════════════════════════════════════════════════ */

function toggleVault() {
    if (isVaultOpen) {
        closeVault();
    } else {
        openVault();
    }
}

function openVault() {
    closeHistory();    // Only one side panel at a time
    closeDropdown();

    isVaultOpen = true;
    vaultContainer.classList.remove('hidden');
    vaultSearch.value = '';
    setTimeout(updateViewBounds, 50);

    if (activeClientId) {
        const client = clients.find(c => c.id === activeClientId);
        renderVault(client);
    } else {
        vaultClientName.textContent = 'Select a client to view credentials.';
        credentialsList.innerHTML = '';
        addCredWrapper.classList.add('hidden');
    }
}

function closeVault() {
    isVaultOpen = false;
    vaultContainer.classList.add('hidden');
    setTimeout(updateViewBounds, 50);
}

function renderVault(client, filter = '') {
    vaultClientName.textContent = `Credentials for ${client.name}`;
    addCredWrapper.classList.remove('hidden');
    credentialsList.innerHTML = '';

    if (!client.credentials) client.credentials = [];

    const query = filter.toLowerCase().trim();
    const filtered = query
        ? client.credentials.filter(c =>
            (c.label || '').toLowerCase().includes(query) ||
            (c.username || '').toLowerCase().includes(query)
        )
        : client.credentials;

    filtered.forEach(cred => {
        const card = document.createElement('div');
        card.className = 'credential-card';
        card.innerHTML = `
            <div class="cred-info">
                <span class="cred-label">${cred.label}</span>
                <span class="cred-username">${cred.username}</span>
            </div>
            <div class="cred-actions">
                <button class="inject-user-btn">Inject Username</button>
                <button class="inject-pass-btn">Inject Password</button>
            </div>
            <div class="cred-manage">
                <button class="cred-manage-btn edit-cred-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    Edit
                </button>
                <button class="cred-manage-btn delete delete-cred-btn">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    Delete
                </button>
            </div>
        `;

        // Inject username
        card.querySelector('.inject-user-btn').addEventListener('click', () => {
            if (activeTabId) window.api.injectCredential(activeTabId, 'email', cred.username, false);
        });

        // Inject password
        card.querySelector('.inject-pass-btn').addEventListener('click', () => {
            if (activeTabId) window.api.injectCredential(activeTabId, 'password', cred.passwordValue, true);
        });

        // Delete credential
        card.querySelector('.delete-cred-btn').addEventListener('click', async () => {
            if (confirm(`Delete credential "${cred.label}"?`)) {
                client.credentials = client.credentials.filter(c => c.id !== cred.id);
                await window.api.updateClients(clients);
                renderVault(client, vaultSearch.value);
            }
        });

        // Inline edit — replaces card content with editable form
        card.querySelector('.edit-cred-btn').addEventListener('click', () => {
            card.innerHTML = `
                <div class="cred-edit-form">
                    <input type="text" class="edit-label" placeholder="Label" value="${cred.label}">
                    <input type="text" class="edit-username" placeholder="Username" value="${cred.username}">
                    <input type="password" class="edit-password" placeholder="New password (blank = keep current)">
                    <div class="edit-actions">
                        <button class="accent-btn save-edit-btn" style="flex:1; font-size:0.75rem; padding:6px;">Save</button>
                        <button class="ghost-btn cancel-edit-btn" style="flex:1; font-size:0.75rem; padding:6px;">Cancel</button>
                    </div>
                </div>
            `;

            card.querySelector('.cancel-edit-btn').addEventListener('click', () => {
                renderVault(client, vaultSearch.value);
            });

            card.querySelector('.save-edit-btn').addEventListener('click', async () => {
                const newLabel = card.querySelector('.edit-label').value.trim();
                const newUsername = card.querySelector('.edit-username').value.trim();
                const newPassword = card.querySelector('.edit-password').value;

                if (newLabel) cred.label = newLabel;
                if (newUsername) cred.username = newUsername;

                if (newPassword && newPassword.trim()) {
                    cred.passwordValue = await window.api.encryptCredential(newPassword);
                }

                await window.api.updateClients(clients);
                renderVault(client, vaultSearch.value);
            });
        });

        credentialsList.appendChild(card);
    });
}


/* ═══════════════════════════════════════════════════════════
   AUTO-SAVE CREDENTIAL PROMPT
   ═══════════════════════════════════════════════════════════ */

function showSaveCredentialModal(username, password, title) {
    if (!activeClientId) return;
    // Don't show if already visible
    if (!saveCredModal.classList.contains('hidden')) return;

    pendingCredential = { username, password };
    saveCredSiteName.textContent = `from: ${title}`;
    saveCredLabelInput.value = title;
    saveCredUsernameInput.value = username;
    saveCredModal.classList.remove('hidden');
    window.api.hideView();
}

function dismissSaveCredentialModal() {
    saveCredModal.classList.add('hidden');
    pendingCredential = null;
    window.api.showView();
}

async function confirmSaveCredential() {
    if (!pendingCredential || !activeClientId) return;
    const client = clients.find(c => c.id === activeClientId);
    if (!client) return;

    const label = saveCredLabelInput.value.trim() || 'Saved Credential';
    const encryptedHex = await window.api.encryptCredential(pendingCredential.password);

    if (!client.credentials) client.credentials = [];
    client.credentials.push({
        id: Date.now().toString(),
        label,
        username: pendingCredential.username,
        passwordValue: encryptedHex
    });

    await window.api.updateClients(clients);
    pendingCredential = null;
    saveCredModal.classList.add('hidden');
    window.api.showView();

    // Refresh vault if it's open
    if (isVaultOpen) renderVault(client);
}


/* ═══════════════════════════════════════════════════════════
   ADD CLIENT MODAL
   ═══════════════════════════════════════════════════════════ */

const clientModal = document.getElementById('client-modal');
const clientModalTitle = document.getElementById('client-modal-title');
const clientIdInput = document.getElementById('client-id-input');

function openClientModal(clientId = null) {
    if (clientId) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            clientModalTitle.textContent = 'Edit Client';
            clientIdInput.value = client.id;
            document.getElementById('client-name').value = client.name;
            document.getElementById('client-colour').value = client.color || '#FFCC00';
            document.getElementById('client-start-url').value = client.url || '';
        }
    } else {
        clientModalTitle.textContent = 'Add New Client';
        clientIdInput.value = '';
        document.getElementById('client-name').value = '';
        document.getElementById('client-colour').value = defaultColours[clients.length % defaultColours.length] || '#FFCC00';
        document.getElementById('client-start-url').value = '';
    }
    clientDropdown.classList.add('hidden');
    clientModal.classList.remove('hidden');
    window.api.hideView();
    document.getElementById('client-name').focus();
}

function closeClientModal() {
    clientModal.classList.add('hidden');
    window.api.showView();
}

/* ═══════════════════════════════════════════════════════════
   BOOKMARK MODAL
   ═══════════════════════════════════════════════════════════ */

const bookmarkModal = document.getElementById('bookmark-modal');
const bookmarkIdInput = document.getElementById('bookmark-id-input');
const bookmarkTitleInput = document.getElementById('bookmark-title');
const bookmarkUrlInput = document.getElementById('bookmark-url');
const bookmarkFolderSelect = document.getElementById('bookmark-folder');
const cancelBookmarkBtn = document.getElementById('cancel-bookmark-btn');
const saveBookmarkBtn = document.getElementById('save-bookmark-btn');

function openBookmarkEditModal(client, bm) {
    bookmarkIdInput.value = bm.id;
    bookmarkTitleInput.value = bm.title;
    
    // Populate folders
    bookmarkFolderSelect.innerHTML = '<option value="root">Bookmarks Bar</option>';
    function addFoldersToSelect(items, prefix = '') {
        items.forEach(item => {
            if (item.type === 'folder' && item.id !== bm.id) { // Prevent putting a folder inside itself
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.textContent = prefix + item.title;
                bookmarkFolderSelect.appendChild(opt);
                if (item.children) {
                    addFoldersToSelect(item.children, prefix + '- ');
                }
            }
        });
    }
    addFoldersToSelect(client.bookmarks);
    
    // Select the current parent folder
    function findParentFolder(items, id) {
        for (const item of items) {
            if (item.type === 'folder' && item.children) {
                if (item.children.find(child => child.id === id)) return item;
                const found = findParentFolder(item.children, id);
                if (found) return found;
            }
        }
        return null;
    }
    const parent = findParentFolder(client.bookmarks, bm.id);
    bookmarkFolderSelect.value = parent ? parent.id : 'root';
    
    if (bm.type === 'folder') {
        bookmarkUrlInput.parentElement.classList.add('hidden');
        bookmarkUrlInput.value = '';
    } else {
        bookmarkUrlInput.parentElement.classList.remove('hidden');
        bookmarkUrlInput.value = bm.url || '';
    }
    bookmarkModal.classList.remove('hidden');
    window.api.hideView();
    bookmarkTitleInput.focus();
}

function closeBookmarkModal() {
    bookmarkModal.classList.add('hidden');
    window.api.showView();
}

/* ═══════════════════════════════════════════════════════════
   PROMPT MODAL
   ═══════════════════════════════════════════════════════════ */
const promptModal = document.getElementById('prompt-modal');
const promptTitle = document.getElementById('prompt-title');
const promptInput = document.getElementById('prompt-input');
const promptCancelBtn = document.getElementById('prompt-cancel-btn');
const promptOkBtn = document.getElementById('prompt-ok-btn');

function showPrompt(title, defaultValue = '') {
    return new Promise((resolve) => {
        promptTitle.textContent = title;
        promptInput.value = defaultValue;
        promptModal.classList.remove('hidden');
        window.api.hideView();
        promptInput.focus();
        
        const cleanup = () => {
            promptOkBtn.removeEventListener('click', onOk);
            promptCancelBtn.removeEventListener('click', onCancel);
            promptInput.removeEventListener('keydown', onKey);
            promptModal.classList.add('hidden');
            window.api.showView();
        };

        const onOk = () => {
            cleanup();
            resolve(promptInput.value.trim());
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        const onKey = (e) => {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        };

        promptOkBtn.addEventListener('click', onOk);
        promptCancelBtn.addEventListener('click', onCancel);
        promptInput.addEventListener('keydown', onKey);
    });
}

/* ═══════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════ */

function setupEventListeners() {
    // ── Toolbar buttons ──
    clientAvatarBtn.addEventListener('click', toggleDropdown);
    backBtn.addEventListener('click', () => window.api.goBack());
    forwardBtn.addEventListener('click', () => window.api.goForward());
    refreshBtn.addEventListener('click', () => {
        if (activeTabId) window.api.reload();
    });
    bookmarkBtn.addEventListener('click', bookmarkCurrentPage);
    historyBtn.addEventListener('click', toggleHistory);
    vaultToggleBtn.addEventListener('click', toggleVault);

    // ── Address bar ──
    addressInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            let url = addressInput.value.trim();
            if (url) {
                // Ctrl+Enter wraps in www...com
                if (e.ctrlKey) {
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('.')) {
                        url = `https://www.${url}.com`;
                        addressInput.value = url;
                    }
                } else {
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('the-doctor://') && !url.includes('.') && !url.includes('localhost')) {
                        // It's a search query
                        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                    }
                }
                window.api.navigate(url);
            }
        }
    });

    // ── New tab button in tab strip ──
    addTabBtn.addEventListener('click', () => {
        if (activeClientId) {
            const client = clients.find(c => c.id === activeClientId);
            if (client) createNewTab(client, 'https://portal.office.com');
        }
    });

    // ── Bookmarks bar ──
    bookmarksBar.addEventListener('contextmenu', (e) => {
        if (e.target === bookmarksBar || e.target === bookmarksList || e.target === bookmarksEmptyMsg) {
            e.preventDefault();
            if (activeClientId) window.api.showBookmarksBarContextMenu(activeClientId);
        }
    });

    importBtn.addEventListener('click', () => {
        if (activeClientId) fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        importBookmarks(e.target.files[0]);
    });

    window.api.onBookmarkAction(async (action, clientId, bmId) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        let bm = null;
        let parentFolder = null;
        if (bmId) {
            function findBm(items, parent = null) {
                for (const item of items) {
                    if (item.id === bmId) return { item, parent };
                    if (item.type === 'folder' && item.children) {
                        const res = findBm(item.children, item);
                        if (res) return res;
                    }
                }
                return null;
            }
            const match = findBm(client.bookmarks);
            if (match) {
                bm = match.item;
                parentFolder = match.parent;
            }
        }

        switch (action) {
            case 'open-tab':
                if (bm) createNewTab(client, bm.url);
                break;
            case 'open-window':
                // For now, just create a tab if they are in the same window, or if it's supposed to be a new window, we need a new IPC to pass the URL.
                // We'll just open a tab for now or prompt.
                if (bm) createNewTab(client, bm.url); 
                break;
            case 'edit':
                if (bm) openBookmarkEditModal(client, bm);
                break;
            case 'delete':
                if (bm && confirm(`Delete bookmark "${bm.title}"?`)) {
                    if (parentFolder) {
                        parentFolder.children = parentFolder.children.filter(b => b.id !== bmId);
                    } else {
                        client.bookmarks = client.bookmarks.filter(b => b.id !== bmId);
                    }
                    await window.api.updateClients(clients);
                    if (activeClientId === clientId) renderBookmarks(clientId);
                }
                break;
            case 'add-page':
                const newBmId = 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9);
                const newBm = { id: newBmId, title: '', url: '', type: 'page' };
                if (bm && bm.type === 'folder') {
                    if (!bm.children) bm.children = [];
                    bm.children.push(newBm);
                } else if (parentFolder) {
                    parentFolder.children.push(newBm);
                } else {
                    client.bookmarks.push(newBm);
                }
                openBookmarkEditModal(client, newBm);
                break;
            case 'add-folder':
                const folderName = await showPrompt('New Folder Name', 'New Folder');
                if (folderName) {
                    const newFolder = {
                        id: 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9),
                        type: 'folder',
                        title: folderName,
                        children: []
                    };
                    if (bm && bm.type === 'folder') {
                        if (!bm.children) bm.children = [];
                        bm.children.push(newFolder);
                    } else if (parentFolder) {
                        parentFolder.children.push(newFolder);
                    } else {
                        client.bookmarks.push(newFolder);
                    }
                    await window.api.updateClients(clients);
                    if (activeClientId === clientId) renderBookmarks(clientId);
                }
                break;
            case 'open-manager':
                createNewTab(client, `the-doctor://bookmarks?clientId=${clientId}`);
                break;
        }
    });

    // ── Client dropdown search ──
    clientSearch.addEventListener('input', () => renderClientDropdown());

    // ── Client modal ──
    addClientBtn.addEventListener('click', () => {
        closeDropdown();
        openClientModal();
    });

    cancelClientBtn.addEventListener('click', closeClientModal);

    saveClientBtn.addEventListener('click', async () => {
        const id = clientIdInput.value;
        const name = document.getElementById('client-name').value.trim();
        const colour = document.getElementById('client-colour').value;
        const url = document.getElementById('client-start-url').value.trim();

        if (!name) {
            alert('Client name is required.');
            return;
        }

        await saveClient(id, name, colour, url);
        closeClientModal();
    });

    // ── Bookmark modal ──
    cancelBookmarkBtn.addEventListener('click', closeBookmarkModal);
    saveBookmarkBtn.addEventListener('click', async () => {
        const id = bookmarkIdInput.value;
        const title = bookmarkTitleInput.value.trim();
        const url = bookmarkUrlInput.value.trim();
        const targetFolderId = bookmarkFolderSelect.value;
        
        const client = clients.find(c => c.id === activeClientId);
        if (client) {
            let bm = null;
            function extractBm(items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].id === id) {
                        bm = items.splice(i, 1)[0];
                        return true;
                    }
                    if (items[i].type === 'folder' && items[i].children) {
                        if (extractBm(items[i].children)) return true;
                    }
                }
                return false;
            }
            
            extractBm(client.bookmarks);
            
            if (bm) {
                if (!title || (bm.type !== 'folder' && !url)) {
                    // Re-insert if validation fails to not lose it
                    client.bookmarks.push(bm);
                    return alert('Required fields missing.');
                }
                
                bm.title = title;
                if (bm.type !== 'folder') bm.url = url;
                
                // Insert into target folder
                if (targetFolderId === 'root') {
                    client.bookmarks.push(bm);
                } else {
                    function findFolder(items, fid) {
                        for (const item of items) {
                            if (item.id === fid) return item;
                            if (item.type === 'folder' && item.children) {
                                const found = findFolder(item.children, fid);
                                if (found) return found;
                            }
                        }
                        return null;
                    }
                    const target = findFolder(client.bookmarks, targetFolderId);
                    if (target) {
                        if (!target.children) target.children = [];
                        target.children.push(bm);
                    } else {
                        client.bookmarks.push(bm);
                    }
                }
                
                await window.api.updateClients(clients);
                renderBookmarks(activeClientId);
            }
        }
        closeBookmarkModal();
    });

    // ── Vault panel ──
    vaultCloseBtn.addEventListener('click', closeVault);

    vaultSearch.addEventListener('input', () => {
        if (!activeClientId) return;
        const client = clients.find(c => c.id === activeClientId);
        if (client) renderVault(client, vaultSearch.value);
    });

    saveCredBtn.addEventListener('click', async () => {
        if (!activeClientId) return;
        const client = clients.find(c => c.id === activeClientId);
        if (!client) return;

        const label = credLabel.value.trim();
        const username = credUsername.value.trim();
        const password = credPassword.value;

        if (!label || !username || !password) {
            alert('Please fill all fields.');
            return;
        }

        const encryptedHex = await window.api.encryptCredential(password);

        if (!client.credentials) client.credentials = [];
        client.credentials.push({
            id: Date.now().toString(),
            label,
            username,
            passwordValue: encryptedHex
        });

        await window.api.updateClients(clients);

        credLabel.value = '';
        credUsername.value = '';
        credPassword.value = '';

        renderVault(client);
    });

    // ── History panel ──
    historyCloseBtn.addEventListener('click', closeHistory);

    historySearch.addEventListener('input', () => {
        if (!activeClientId) return;
        const client = clients.find(c => c.id === activeClientId);
        if (client) renderHistory(client, historySearch.value);
    });

    clearHistoryBtn.addEventListener('click', async () => {
        if (!activeClientId) return;
        if (!confirm('Clear all browsing history for this client?')) return;
        const client = clients.find(c => c.id === activeClientId);
        if (client) {
            client.history = [];
            await window.api.updateClients(clients);
            renderHistory(client);
        }
    });

    // ── Save credential modal (auto-prompt) ──
    saveCredDismissBtn.addEventListener('click', dismissSaveCredentialModal);
    saveCredConfirmBtn.addEventListener('click', confirmSaveCredential);

    // ── Click outside to close panels ──
    document.addEventListener('click', (e) => {
        // Close dropdown if click is outside dropdown & avatar button
        if (isDropdownOpen &&
            !clientDropdown.contains(e.target) &&
            !clientAvatarBtn.contains(e.target)) {
            closeDropdown();
        }
    });

    // ── Keyboard shortcuts (renderer-level) ──
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            if (activeClientId) {
                const client = clients.find(c => c.id === activeClientId);
                if (client) createNewTab(client, 'https://portal.office.com');
            }
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'h') {
            e.preventDefault();
            toggleHistory();
        }
    });

    // ── IPC callbacks from main process ──
    window.api.onClientsUpdated((newClients) => {
        clients = newClients;
        renderClientDropdown();
        if (activeClientId) {
            const client = clients.find(c => c.id === activeClientId);
            if (client) {
                renderBookmarks(client.id);
                if (isVaultOpen) renderVault(client, vaultSearch.value);
                if (isHistoryOpen) renderHistory(client, historySearch.value);
            }
        }
    });

    window.api.onUrlUpdated(({ tabId, url }) => {
        if (activeClientId && clientTabsState[activeClientId]) {
            const tab = clientTabsState[activeClientId].find(t => t.id === tabId);
            if (tab) tab.url = url;
        }
        if (activeTabId === tabId) {
            addressInput.value = url;
        }
    });

    window.api.onTitleUpdated(({ tabId, title }) => {
        if (activeClientId && clientTabsState[activeClientId]) {
            const tab = clientTabsState[activeClientId].find(t => t.id === tabId);
            if (tab) {
                tab.title = title;
                if (activeClientId) renderTabs(activeClientId);

                // Record browsing history on title update
                const client = clients.find(c => c.id === activeClientId);
                if (client && tab.url) {
                    if (!client.history) client.history = [];
                    const url = tab.url;

                    // Skip if same URL as most recent entry (dedup redirects)
                    if (client.history.length === 0 || client.history[0].url !== url) {
                        // Filter noisy auth/redirect intermediate pages
                        const skip = /\/blank$|about:blank|login\.microsoftonline|aadcdn\.msauth/i;
                        if (!skip.test(url)) {
                            client.history.unshift({ url, title, timestamp: Date.now() });
                            if (client.history.length > 500) client.history.length = 500;
                            window.api.updateClients(clients);
                        }
                    } else {
                        // Update title of latest entry if URL matches
                        client.history[0].title = title;
                    }
                }
            }
        }
    });

    // Shortcut forwarded from WebContentsView via main process
    window.api.onShortcutNewTab(() => {
        if (activeClientId) {
            const client = clients.find(c => c.id === activeClientId);
            if (client) createNewTab(client, 'https://portal.office.com');
        }
    });

    window.api.onShortcutHistory(() => {
        toggleHistory();
    });

    // Auto-save credential prompt from webview-preload
    window.api.onShowSaveCredentialPrompt((username, password, title) => {
        showSaveCredentialModal(username, password, title);
    });

    // Handle open link in new tab context menu action
    window.api.onShortcutOpenTab((url) => {
        const client = clients.find(c => c.id === activeClientId);
        if (client) {
            createNewTab(client, url);
        }
    });

    window.api.onOpenLinkNewTab((data) => {
        const { clientId, url } = data;
        const client = clients.find(c => c.id === clientId);
        if (client) {
            createNewTab(client, url);
        }
    });
}


/* ═══════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════ */

init();
