let clients = [];
let activeClientId = null;
let currentFolderId = 'root'; // 'root' means top level

const folderTreeEl = document.getElementById('folder-tree');
const bookmarkGridEl = document.getElementById('bookmark-grid');
const currentFolderTitleEl = document.getElementById('current-folder-title');
const searchInput = document.getElementById('search-input');

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    activeClientId = urlParams.get('clientId');

    clients = await window.api.getClients();
    render();
}

function getClientBookmarks() {
    const client = clients.find(c => c.id === activeClientId);
    return client ? client.bookmarks : [];
}

function findFolder(items, id) {
    if (id === 'root') return { id: 'root', title: 'Bookmarks Bar', children: items };
    for (const item of items) {
        if (item.id === id) return item;
        if (item.type === 'folder' && item.children) {
            const found = findFolder(item.children, id);
            if (found) return found;
        }
    }
    return null;
}

function render() {
    if (!activeClientId) return;
    const bookmarks = getClientBookmarks();
    
    // Render sidebar tree (folders only)
    folderTreeEl.innerHTML = '';
    
    const rootEl = document.createElement('div');
    rootEl.className = 'tree-item' + (currentFolderId === 'root' ? ' active' : '');
    rootEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> Bookmarks Bar`;
    rootEl.onclick = () => { currentFolderId = 'root'; render(); };
    rootEl.addEventListener('dragover', (e) => { e.preventDefault(); rootEl.classList.add('drag-over'); });
    rootEl.addEventListener('dragleave', () => rootEl.classList.remove('drag-over'));
    rootEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        rootEl.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId) await moveItem(draggedId, 'root');
    });
    folderTreeEl.appendChild(rootEl);

    function renderTree(items, depth) {
        items.forEach(item => {
            if (item.type === 'folder') {
                const el = document.createElement('div');
                el.className = 'tree-item' + (currentFolderId === item.id ? ' active' : '');
                el.style.paddingLeft = `${16 + depth * 16}px`;
                el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> <span>${item.title}</span>`;
                el.onclick = () => { currentFolderId = item.id; render(); };
                el.oncontextmenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.api.showBookmarkContextMenu(activeClientId, item.id);
                };
                el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
                el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
                el.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    el.classList.remove('drag-over');
                    const draggedId = e.dataTransfer.getData('text/plain');
                    if (draggedId && draggedId !== item.id) await moveItem(draggedId, item.id);
                });
                folderTreeEl.appendChild(el);
                if (item.children) renderTree(item.children, depth + 1);
            }
        });
    }
    renderTree(bookmarks, 1);

    // Render main grid
    const currentFolder = findFolder(bookmarks, currentFolderId);
    if (!currentFolder) {
        currentFolderId = 'root';
        return render();
    }
    
    currentFolderTitleEl.textContent = currentFolder.title || 'Bookmarks Bar';
    bookmarkGridEl.innerHTML = '';

    const searchTerm = searchInput.value.toLowerCase();
    
    let itemsToShow = currentFolder.children || [];
    if (currentFolderId === 'root') itemsToShow = bookmarks;

    if (searchTerm) {
        // Flatten all if searching
        itemsToShow = [];
        function searchItems(items) {
            items.forEach(item => {
                if (item.title.toLowerCase().includes(searchTerm) || (item.url && item.url.toLowerCase().includes(searchTerm))) {
                    itemsToShow.push(item);
                }
                if (item.type === 'folder' && item.children) {
                    searchItems(item.children);
                }
            });
        }
        searchItems(bookmarks);
    }

    itemsToShow.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bm-card' + (item.type === 'folder' ? ' folder' : '');
        card.draggable = true;
        card.dataset.id = item.id;
        
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.id);
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        
        const actions = `
            <div class="bm-actions">
                <button class="action-btn edit-btn" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                <button class="action-btn delete-btn" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        `;

        if (item.type === 'folder') {
            card.innerHTML = `
                ${actions}
                <div class="bm-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div>
                <div class="bm-title">${item.title}</div>
            `;
            card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== item.id) await moveItem(draggedId, item.id);
            });
            card.onclick = (e) => {
                if (e.target.closest('.delete-btn')) {
                    deleteItem(item.id);
                } else if (e.target.closest('.edit-btn')) {
                    editItem(item);
                } else {
                    currentFolderId = item.id;
                    searchInput.value = '';
                    render();
                }
            };
        } else {
            let hostname = '';
            try { hostname = new URL(item.url).hostname; } catch(e) {}
            card.innerHTML = `
                ${actions}
                <div class="bm-icon"><img src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32" class="bm-favicon" onerror="this.style.display='none'"></div>
                <div class="bm-title" title="${item.title}">${item.title}</div>
                <div class="bm-url" title="${item.url}">${item.url}</div>
            `;
            card.onclick = (e) => {
                if (e.target.closest('.delete-btn')) {
                    deleteItem(item.id);
                } else if (e.target.closest('.edit-btn')) {
                    editItem(item);
                } else {
                    window.api.showBookmarkContextMenu(activeClientId, item.id);
                }
            };
        }

        bookmarkGridEl.appendChild(card);
    });
}

async function moveItem(draggedId, targetFolderId) {
    const bookmarks = getClientBookmarks();
    let draggedItem = null;
    
    // Find and remove the item
    function extract(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === draggedId) {
                draggedItem = items.splice(i, 1)[0];
                return true;
            }
            if (items[i].type === 'folder' && items[i].children) {
                if (extract(items[i].children)) return true;
            }
        }
        return false;
    }
    
    if (!extract(bookmarks) || !draggedItem) return;
    
    // Insert into target folder
    if (targetFolderId === 'root') {
        bookmarks.push(draggedItem);
    } else {
        const target = findFolder(bookmarks, targetFolderId);
        if (target) {
            if (!target.children) target.children = [];
            target.children.push(draggedItem);
        } else {
            // fallback to root
            bookmarks.push(draggedItem);
        }
    }
    
    await window.api.updateClients(clients);
    render();
}

async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this bookmark?')) return;
    
    const bookmarks = getClientBookmarks();
    function remove(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === id) {
                items.splice(i, 1);
                return true;
            }
            if (items[i].type === 'folder' && items[i].children) {
                if (remove(items[i].children)) return true;
            }
        }
        return false;
    }
    remove(bookmarks);
    await window.api.updateClients(clients);
    render();
}

// ---- Edit Modal ----
const editModal = document.getElementById('edit-modal');
const editIdInput = document.getElementById('edit-id');
const editTitleInput = document.getElementById('edit-title');
const editUrlInput = document.getElementById('edit-url');
const editUrlGroup = document.getElementById('edit-url-group');
const editFolderSelect = document.getElementById('edit-folder-select');

function populateFolderSelect(items, selectEl, level = 0, excludeId = null) {
    if (level === 0) {
        selectEl.innerHTML = '<option value="root">Bookmarks Bar</option>';
    }
    for (const item of items) {
        if (item.type === 'folder' && item.id !== excludeId) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = '\u00A0\u00A0'.repeat(level) + '└ ' + item.title;
            selectEl.appendChild(opt);
            if (item.children) populateFolderSelect(item.children, selectEl, level + 1, excludeId);
        }
    }
}

function findParentFolderId(items, id, parentId = 'root') {
    for (const item of items) {
        if (item.id === id) return parentId;
        if (item.type === 'folder' && item.children) {
            const found = findParentFolderId(item.children, id, item.id);
            if (found) return found;
        }
    }
    return null;
}

function editItem(item) {
    editIdInput.value = item.id;
    editTitleInput.value = item.title || '';
    
    if (item.type === 'folder') {
        editUrlGroup.style.display = 'none';
        editUrlInput.value = '';
    } else {
        editUrlGroup.style.display = 'block';
        editUrlInput.value = item.url || '';
    }

    const bookmarks = getClientBookmarks();
    populateFolderSelect(bookmarks, editFolderSelect, 0, item.type === 'folder' ? item.id : null);
    
    // Determine current parent folder
    const parentId = findParentFolderId(bookmarks, item.id);
    if (parentId) {
        editFolderSelect.value = parentId;
    }
    
    editModal.classList.remove('hidden');
    editTitleInput.focus();
}

let newlyCreatedItemId = null;

document.getElementById('edit-cancel-btn').addEventListener('click', () => {
    editModal.classList.add('hidden');
    if (newlyCreatedItemId) {
        const bookmarks = getClientBookmarks();
        function remove(items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].id === newlyCreatedItemId) {
                    items.splice(i, 1);
                    return true;
                }
                if (items[i].type === 'folder' && items[i].children) {
                    if (remove(items[i].children)) return true;
                }
            }
            return false;
        }
        remove(bookmarks);
        newlyCreatedItemId = null;
        render(); // remove from UI since it was never saved
    }
});

document.getElementById('edit-save-btn').addEventListener('click', async () => {
    newlyCreatedItemId = null; // clear it since we are saving
    const id = editIdInput.value;
    const title = editTitleInput.value.trim();
    const url = editUrlInput.value.trim();
    const targetFolderId = editFolderSelect.value;
    
    const bookmarks = getClientBookmarks();
    let bmToMove = null;

    // Remove the item from its current location
    function extract(items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === id) {
                bmToMove = items.splice(i, 1)[0];
                return true;
            }
            if (items[i].type === 'folder' && items[i].children) {
                if (extract(items[i].children)) return true;
            }
        }
        return false;
    }

    extract(bookmarks);

    if (bmToMove) {
        bmToMove.title = title;
        if (bmToMove.type !== 'folder') {
            bmToMove.url = url;
        }

        if (targetFolderId === 'root') {
            bookmarks.push(bmToMove);
        } else {
            const target = findFolder(bookmarks, targetFolderId);
            if (target) {
                if (!target.children) target.children = [];
                target.children.push(bmToMove);
            } else {
                bookmarks.push(bmToMove); // fallback
            }
        }

        await window.api.updateClients(clients);
        render();
    }
    
    editModal.classList.add('hidden');
});

document.getElementById('add-bookmark-btn').addEventListener('click', () => {
    const newBmId = 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const newBm = { id: newBmId, title: '', url: '', type: 'page' };
    
    // By default, place in current folder
    const target = currentFolderId === 'root' ? getClientBookmarks() : findFolder(getClientBookmarks(), currentFolderId)?.children;
    if (target) target.push(newBm);
    else getClientBookmarks().push(newBm); // fallback

    newlyCreatedItemId = newBmId;
    editItem(newBm);
});

document.getElementById('add-folder-btn').addEventListener('click', () => {
    const newBmId = 'bm_' + Date.now().toString() + Math.random().toString(36).substring(2, 9);
    const newBm = { id: newBmId, title: '', type: 'folder', children: [] };
    
    // By default, place in current folder
    const target = currentFolderId === 'root' ? getClientBookmarks() : findFolder(getClientBookmarks(), currentFolderId)?.children;
    if (target) target.push(newBm);
    else getClientBookmarks().push(newBm); // fallback

    newlyCreatedItemId = newBmId;
    editItem(newBm);
});

searchInput.addEventListener('input', render);

if (window.api.onClientsUpdated) {
    window.api.onClientsUpdated((newClients) => {
        clients = newClients;
        render();
    });
}

if (window.api.onBookmarkAction) {
    window.api.onBookmarkAction((action, clientId, bmId) => {
        if (clientId !== activeClientId) return;
        
        let bm = null;
        if (bmId) {
            function findBm(items) {
                for (const item of items) {
                    if (item.id === bmId) return item;
                    if (item.type === 'folder' && item.children) {
                        const found = findBm(item.children);
                        if (found) return found;
                    }
                }
                return null;
            }
            bm = findBm(getClientBookmarks());
        }
        
        if (action === 'edit' && bm) {
            editItem(bm);
        } else if (action === 'delete' && bm) {
            deleteItem(bm.id);
        }
    });
}

init();
