# OmniClient — Build Pack

## Technology Stack

| Component       | Technology                        | Version  |
|-----------------|-----------------------------------|----------|
| Runtime         | Electron                          | 42.1.0   |
| Packager        | electron-builder                  | 26.8.1   |
| Language        | JavaScript (Node.js + Browser)    | ES2020+  |
| Output Format   | AppImage (Linux)                  | —        |
| Credential Store| Electron safeStorage (KDE Wallet / GNOME Keyring) | — |

OmniClient has **zero npm runtime dependencies**. The only packages in `devDependencies` are `electron` and `electron-builder`. Everything else is hand-written vanilla JS, CSS, and HTML.

---

## Project Structure

```
msp-browser/
├── assets/
│   └── OmniClient-512.png    # App icon (used in taskbar, sidebar, empty state)
├── main.js                       # Electron Main process (Node.js context)
├── preload.js                    # Context bridge for the renderer UI
├── webview-preload.js            # Context bridge injected into every WebContentsView
├── renderer.js                   # Frontend UI logic (browser context)
├── index.html                    # Application shell / layout
├── styles.css                    # Full dark-themed UI stylesheet
├── package.json                  # Manifest, scripts, build config
└── dist/
    └── OmniClient-X.X.X.AppImage  # Compiled output
```

---

## Architecture

OmniClient uses a **three-process architecture** enforced by Electron's security model:

### 1. Main Process (`main.js`)

This is the privileged Node.js process. It owns the application lifecycle and has full access to the OS. Responsibilities:

- **Window Management** — Creates the `BrowserWindow` and manages `WebContentsView` instances for each browser tab.
- **Tab Lifecycle** — `createTab()` builds isolated `WebContentsView` instances with unique `persist:partition` strings per client. Each partition has its own cookies, localStorage, and session data — completely walled off from every other client.
- **IPC Router** — Handles all `ipcMain.handle()` and `ipcMain.on()` calls for client CRUD, tab management, navigation, and credential operations.
- **Credential Encryption** — Uses `electron.safeStorage.encryptString()` to encrypt passwords into raw binary buffers, which are then hex-encoded for safe JSON storage. Decryption happens exclusively here at the moment of injection — the plaintext password never enters the renderer's memory.
- **Context Menu** — Builds native right-click menus per `WebContentsView` with spellcheck suggestions, "Add to Dictionary", and clipboard operations.
- **Keyboard Shortcut Forwarding** — Intercepts `before-input-event` on all `webContents` (both the main window and each tab) and forwards `Ctrl+N` (new tab) and `Ctrl+H` (history) to the renderer via IPC.

### 2. Renderer Process (`renderer.js`, `index.html`, `styles.css`)

This is the browser-context process that renders the UI. It has **no Node.js access** (`nodeIntegration: false`, `contextIsolation: true`). It communicates with the Main process exclusively through the `window.api` object exposed by `preload.js`.

Responsibilities:

- **Client Sidebar** — Renders the client list with colored avatars, drag-to-reorder, search filtering, delete, and a resizable drag handle (140px–450px).
- **Tab Bar** — Manages per-client tab state, tab switching, tab creation, and tab closing.
- **Bookmarks Bar** — Per-client bookmark persistence, star-to-save, right-click-to-delete, HTML import, Ctrl/Middle-click to open in new tab.
- **Vault Panel** — 340px side panel showing per-client credentials with inline edit, delete, search, and inject buttons.
- **History Panel** — 400px side panel with searchable, per-client browsing history. Click to navigate, middle-click for new tab.
- **Auto-Save Credential Prompt** — Listens for `show-save-credential-prompt` IPC events and displays a modal pre-filled with the detected username and website title.

### 3. WebView Preload (`webview-preload.js`)

A separate preload script injected into every `WebContentsView` (the actual web pages the user visits). It runs in the page's isolated context and has limited `ipcRenderer` access.

Responsibilities:

- **Login Detection** — Monitors `submit` events, clicks on "Sign In" / "Next" buttons, and `Enter` keypresses in password fields.
- **Credential Extraction** — When a login attempt is detected, reads the `<input type="password">` and any adjacent username field, then sends the values to the Main process via `ipcRenderer.send('prompt-save-credential', ...)`.
- This script has **no access** to `window.api`, the DOM of the renderer, or any client data. It can only send one specific IPC message.

---

## IPC Channel Map

| Channel                      | Direction          | Type    | Purpose                                        |
|------------------------------|--------------------|---------|------------------------------------------------|
| `get-clients`                | Renderer → Main    | invoke  | Load all clients from `clients.json`           |
| `add-client`                 | Renderer → Main    | invoke  | Add a new client and persist                   |
| `update-clients`             | Renderer → Main    | invoke  | Overwrite entire client array (reorder, edit)  |
| `create-tab`                 | Renderer → Main    | invoke  | Create a new `WebContentsView` tab             |
| `switch-tab`                 | Renderer → Main    | send    | Show a specific tab in the viewport            |
| `close-tab`                  | Renderer → Main    | send    | Destroy a tab and its webContents              |
| `resize-view`                | Renderer → Main    | send    | Update the active view's pixel bounds          |
| `hide-view` / `show-view`    | Renderer → Main    | send    | Temporarily hide/restore the active view       |
| `navigate`                   | Renderer → Main    | send    | Navigate the active tab to a URL               |
| `go-back` / `go-forward`     | Renderer → Main    | send    | Browser history navigation                     |
| `secure:encrypt`             | Renderer → Main    | invoke  | Encrypt a password via safeStorage             |
| `inject-credential`          | Renderer → Main    | send    | Decrypt and inject a credential into a tab     |
| `prompt-save-credential`     | WebView → Main     | send    | Forward detected login to Main                 |
| `show-save-credential-prompt`| Main → Renderer    | send    | Trigger the save-password modal in the UI      |
| `view-url-updated`           | Main → Renderer    | send    | Notify renderer of a tab's URL change          |
| `view-title-updated`         | Main → Renderer    | send    | Notify renderer of a tab's title change        |
| `shortcut-new-tab`           | Main → Renderer    | send    | Forward Ctrl+N from a webview                  |
| `shortcut-history`           | Main → Renderer    | send    | Forward Ctrl+H from a webview                  |

---

## Data Persistence

All client data is stored in a single JSON file:

```
~/.config/omniclient/clients.json
```

This path is explicitly pinned via `app.setPath('userData', ...)` in `main.js` so that both `npm start` (dev mode) and the packaged AppImage always read/write the same file.

### Schema

```json
[
  {
    "id": "1779060566947",
    "name": "Client Name",
    "partition": "persist:client_name",
    "color": "#264653",
    "url": "https://portal.office.com",
    "bookmarks": [
      { "title": "Admin Center", "url": "https://admin.cloud.microsoft/" }
    ],
    "credentials": [
      {
        "id": "1779063941146",
        "label": "M365 Global",
        "username": "admin@client.onmicrosoft.com",
        "passwordValue": "763131ad7debe30215..."
      }
    ],
    "history": [
      {
        "url": "https://portal.azure.com",
        "title": "Microsoft Azure",
        "timestamp": 1779063850555
      }
    ]
  }
]
```

The `passwordValue` field contains a hex-encoded buffer produced by `safeStorage.encryptString()`. It is **not** reversible without the same user's system keychain (KDE Wallet on Plasma, GNOME Keyring on GNOME, libsecret on others).

Session data (cookies, localStorage, IndexedDB) for each client is stored separately by Chromium inside `~/.config/omniclient/Partitions/persist:client_name/`.

---

## Build Commands

### Prerequisites

```bash
# Node.js 18+ and npm required
node --version   # v18.x or higher
npm --version    # 9.x or higher
```

### Install Dependencies

```bash
cd ~/Projects/msp-browser
npm install
```

### Run in Development

```bash
npm start
```

This launches the app directly from source with hot-reload friendly workflow. Changes to `renderer.js`, `styles.css`, and `index.html` take effect on window reload (`Ctrl+Shift+R` in DevTools).

### Build AppImage

```bash
npm run dist
```

Output: `dist/OmniClient-X.X.X.AppImage`

### Install to System

```bash
# Copy to a permanent location
cp dist/OmniClient-X.X.X.AppImage ~/.local/bin/OmniClient.AppImage
chmod +x ~/.local/bin/OmniClient.AppImage

# Copy icon
cp assets/OmniClient-512.png ~/.local/share/icons/omniclient.png

# Create .desktop file (see LINUX-USERGUIDE.md for full details)
```

---

## Security Model Summary

| Layer                 | Access Level                                                |
|-----------------------|-------------------------------------------------------------|
| `main.js`             | Full Node.js + OS access. Handles encryption, decryption, file I/O. |
| `preload.js`          | Restricted bridge. Exposes only whitelisted IPC methods.    |
| `renderer.js`         | Browser sandbox. No Node.js. No direct file access.         |
| `webview-preload.js`  | Minimal. Can only send one IPC message (`prompt-save-credential`). |
| `WebContentsView`     | Fully sandboxed Chromium. Isolated per `persist:partition`.  |

Plaintext passwords exist **only** in:
1. The user's keyboard input (briefly in the renderer's `<input>` field)
2. The Main process memory, for the ~1ms duration of encryption or injection
3. The target webpage's `<input>` field after injection

They are **never** written to disk in plaintext. The `clients.json` file only contains hex-encoded encrypted buffers.
