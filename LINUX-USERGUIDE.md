# OmniClient — Linux User Guide

## Deploying to Another Linux Machine

OmniClient is distributed as an **AppImage** — a self-contained, portable Linux executable that bundles Electron, Chromium, and all application code into a single file. No installation, no package manager, no dependencies.

---

## Quick Start (Any Linux Distro)

### Step 1: Transfer the AppImage

Copy the file to the target machine using any method:

```bash
# Via SCP
scp OmniClient-1.0.0.AppImage user@target-machine:~/

# Via USB drive
cp /media/usb/OmniClient-1.0.0.AppImage ~/

# Via network share, cloud storage, etc.
```

### Step 2: Make It Executable

```bash
chmod +x ~/OmniClient-1.0.0.AppImage
```

### Step 3: Run It

```bash
./OmniClient-1.0.0.AppImage
```

That's it. It runs on any 64-bit Linux distribution with a graphical desktop.

---

## Proper Installation (Persistent with Desktop Integration)

For a proper "installed app" experience with a desktop icon, application menu entry, and taskbar pinning:

### 1. Move to a Permanent Location

```bash
mkdir -p ~/.local/bin
cp OmniClient-1.0.0.AppImage ~/.local/bin/OmniClient.AppImage
chmod +x ~/.local/bin/OmniClient.AppImage
```

### 2. Install the Icon

```bash
mkdir -p ~/.local/share/icons

# If you have the source repo:
cp assets/OmniClient-512.png ~/.local/share/icons/omniclient.png

# If you only have the AppImage, extract the icon:
cd /tmp
./~/.local/bin/OmniClient.AppImage --appimage-extract usr/share/icons 2>/dev/null
cp squashfs-root/usr/share/icons/hicolor/512x512/apps/*.png ~/.local/share/icons/omniclient.png 2>/dev/null
rm -rf squashfs-root
```

### 3. Create a Desktop Entry

Create the file `~/.local/share/applications/omniclient.desktop`:

```ini
[Desktop Entry]
Name=OmniClient
Comment=Multi-tenant MSP browser with isolated client sessions
Exec=/home/YOUR_USERNAME/.local/bin/OmniClient.AppImage
Icon=omniclient
Type=Application
Categories=Network;WebBrowser;
StartupWMClass=omniclient
```

> **Important:** Replace `YOUR_USERNAME` with the actual username on the target machine. The `Exec` path must be absolute.

### 4. Refresh the Desktop Database

```bash
update-desktop-database ~/.local/share/applications/
```

### 5. Pin to Taskbar

- **KDE Plasma:** Open the Application Launcher → search "OmniClient" → right-click → "Pin to Task Manager"
- **GNOME:** Open Activities → search "OmniClient" → right-click the icon → "Add to Favorites"
- **XFCE:** Right-click the panel → "Panel" → "Add New Items" → "Launcher" → browse to the `.desktop` file
- **Cinnamon:** Open Menu → search "OmniClient" → right-click → "Add to panel"

---

## Desktop Environment Compatibility

### KDE Plasma (Arch, Fedora KDE, Kubuntu, etc.)

- **Credential Encryption:** Uses **KDE Wallet** (kwallet) via `safeStorage`
- **Taskbar Pinning:** Works via `.desktop` file with `StartupWMClass`
- **Context Menus:** Native Qt-style menus
- **Status:** ✅ Primary development and test environment

### GNOME (Ubuntu, Fedora Workstation, Pop!_OS, etc.)

- **Credential Encryption:** Uses **GNOME Keyring** (gnome-keyring-daemon) via `safeStorage`
- **Taskbar Pinning:** Uses "Favorites" in the GNOME dock
- **Desktop Entry:** Same `.desktop` file format works
- **Potential Issue:** If GNOME Keyring is not running, `safeStorage.isEncryptionAvailable()` returns `false` and passwords fall back to a basic hex encoding (not secure). Ensure the keyring service is running:
  ```bash
  # Check if keyring is active
  systemctl --user status gnome-keyring-daemon

  # Start if not running
  systemctl --user enable --now gnome-keyring-daemon
  ```
- **Status:** ✅ Fully compatible

### XFCE (Xubuntu, Manjaro XFCE, etc.)

- **Credential Encryption:** Uses **libsecret** / GNOME Keyring if installed
- **Dependency:** You may need to install a keyring backend:
  ```bash
  # Debian/Ubuntu-based
  sudo apt install gnome-keyring libsecret-1-0

  # Arch-based
  sudo pacman -S gnome-keyring libsecret
  ```
- **Status:** ✅ Compatible with keyring backend installed

### Cinnamon (Linux Mint, etc.)

- **Credential Encryption:** Uses **GNOME Keyring** (ships by default on Mint)
- **Status:** ✅ Fully compatible out of the box

### Headless / No Desktop (Server)

- OmniClient requires a graphical desktop. It will not run on a headless server.
- If you need remote access, use X11 forwarding (`ssh -X`) or a VNC session.

---

## Data Storage Locations

All user data is stored under a single directory:

```
~/.config/omniclient/
├── clients.json                    # Client definitions, bookmarks, encrypted credentials, history
├── Preferences                     # Chromium preferences (auto-managed)
├── Local State                     # Chromium local state (auto-managed)
├── Dictionaries/                   # Spellcheck dictionaries (auto-managed)
└── Partitions/
    ├── persist:client_a/           # Session data for Client A (cookies, cache, localStorage)
    ├── persist:client_b/           # Session data for Client B
    └── ...
```

### Migrating Data Between Machines

To move your entire OmniClient configuration (all clients, bookmarks, and session data) to another machine:

```bash
# On the source machine — archive everything
tar czf grizzly-backup.tar.gz -C ~/.config omniclient/

# Transfer to target machine
scp grizzly-backup.tar.gz user@target:~/

# On the target machine — restore
mkdir -p ~/.config
tar xzf grizzly-backup.tar.gz -C ~/.config/
```

> **⚠️ Warning about encrypted credentials:**
> Passwords encrypted via `safeStorage` are tied to the **source machine's system keychain**. If you move `clients.json` to a different machine, the encrypted `passwordValue` fields **will not be decryptable** on the new machine. The credentials will still be visible (label + username), but injection will fail for encrypted passwords.
>
> **Workaround:** After migrating, open the Vault on the new machine, click **Edit** on each credential, and re-enter the password. It will be re-encrypted with the new machine's keychain.

### Migrating Only Client Structure (No Secrets)

If you only want to transfer client names, bookmarks, and URLs (not passwords):

```bash
# On the source machine
cp ~/.config/omniclient/clients.json ~/grizzly-clients-export.json

# Edit the file and clear all passwordValue fields, or use jq:
jq '.[].credentials = []' ~/grizzly-clients-export.json > ~/grizzly-clients-clean.json

# Transfer and place on the target machine
cp ~/grizzly-clients-clean.json ~/.config/omniclient/clients.json
```

---

## System Requirements

| Requirement        | Minimum                                           |
|--------------------|---------------------------------------------------|
| Architecture       | x86_64 (64-bit)                                   |
| Kernel             | Linux 4.x or later                                |
| Desktop            | Any with X11 or Wayland (KDE, GNOME, XFCE, etc.) |
| GLIBC              | 2.28+ (Ubuntu 18.04+, Fedora 29+, Arch current)  |
| RAM                | 2 GB minimum, 4 GB+ recommended                   |
| Disk               | ~250 MB for the AppImage + ~100 MB per client session |
| Keychain (optional)| KDE Wallet, GNOME Keyring, or libsecret for password encryption |
| FUSE               | Required for AppImage mounting (see below)         |

### FUSE Requirement

AppImages require FUSE to mount themselves. Most desktop distros have it pre-installed.

```bash
# Check if FUSE is available
which fusermount || which fusermount3

# Install if missing:

# Debian / Ubuntu
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs

# Arch
sudo pacman -S fuse2

# openSUSE
sudo zypper install fuse
```

If FUSE is not available and cannot be installed, you can extract the AppImage instead:

```bash
./OmniClient-1.0.0.AppImage --appimage-extract
./squashfs-root/AppRun
```

---

## Updating

When a new version is built:

```bash
# Replace the installed AppImage
cp OmniClient-X.X.X.AppImage ~/.local/bin/OmniClient.AppImage
chmod +x ~/.local/bin/OmniClient.AppImage
```

No other changes needed. The `.desktop` file points to `OmniClient.AppImage` (no version in the filename), so updates are seamless. Your data in `~/.config/omniclient/` is completely untouched by the update.

---

## Troubleshooting

### "Text file busy" when copying

Close OmniClient before replacing the AppImage:

```bash
pkill -f OmniClient
cp OmniClient-X.X.X.AppImage ~/.local/bin/OmniClient.AppImage
```

### Blank white screen on launch

Usually a GPU driver issue. Try disabling GPU acceleration:

```bash
./OmniClient.AppImage --disable-gpu
```

### Credentials not encrypting (fallback warning)

Ensure your keychain service is running:

```bash
# KDE
kwalletd6 &

# GNOME
gnome-keyring-daemon --start --components=secrets
```

### No icon showing in taskbar

Verify the icon path is correct in the `.desktop` file, and that the icon file exists:

```bash
ls -la ~/.local/share/icons/omniclient.png
```

If the icon file is missing, extract it from the AppImage:

```bash
cd /tmp
~/.local/bin/OmniClient.AppImage --appimage-extract usr/share/icons 2>/dev/null
find squashfs-root -name "*.png" -exec cp {} ~/.local/share/icons/omniclient.png \;
rm -rf squashfs-root
```

### AppImage won't run — "cannot execute binary file"

```bash
# Check architecture
file OmniClient-1.0.0.AppImage
# Should say: "ELF 64-bit LSB executable, x86-64"

# Ensure it's executable
chmod +x OmniClient-1.0.0.AppImage

# If on ARM (Raspberry Pi, etc.) — this AppImage is x86_64 only
```

---

## Uninstalling

```bash
# Remove the AppImage
rm ~/.local/bin/OmniClient.AppImage

# Remove desktop integration
rm ~/.local/share/applications/omniclient.desktop
rm ~/.local/share/icons/omniclient.png

# Remove all user data (clients, sessions, credentials)
rm -rf ~/.config/omniclient/

# Refresh desktop database
update-desktop-database ~/.local/share/applications/
```
