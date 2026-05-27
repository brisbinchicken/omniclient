<p align="center">
  <img src="assets/omniclient-512.png" alt="OmniClient Logo" width="200"/>
</p>

<h1 align="center">OmniClient</h1>

<p align="center">
  <strong>The Ultimate Multi-Tenant Browser for MSPs & IT Support Engineers</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Linux-blue?style=flat-square" alt="Linux">
  <img src="https://img.shields.io/badge/Framework-Electron-47848F?style=flat-square&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/License-GPL_3.0-green?style=flat-square" alt="License">
</p>

<hr>

OmniClient is a powerful, Chromium-based browser meticulously engineered for Level 1-3 IT Support Engineers and Managed Service Providers (MSPs). 

If you manage multiple Microsoft 365, Azure, Entra, or Intune environments simultaneously, you know the pain of constantly juggling incognito windows, clearing cookies, or accidentally applying changes to the wrong tenant. OmniClient solves this by providing **hardware-level partitioning for every single client you manage.**

## ✨ Core Features

* 🛡️ **Strict Session Isolation**: Every client profile you create operates in a completely sandboxed `WebContentsView` partition. Cookies, local storage, and cache are strictly isolated. You can have 10 tabs open across 10 different Microsoft 365 Admin Centers at the exact same time without them ever bleeding into one another.
* 👥 **Client Switching**: Seamlessly switch between client environments using the integrated avatar dropdown in the navigation bar. Your active tabs, browsing history, and Vault credentials immediately rotate to match the active client context.
* 🔐 **The Credential Vault**: An encrypted, built-in credential manager allowing you to securely save and auto-copy tenant passwords (AES-256-GCM encrypted) per client. Say goodbye to insecure plain-text password spreadsheets.
* 🔖 **Native Bookmark Management**: A fully integrated hierarchical bookmark system tailored for your tenant URLs. Create folders, manage nested links, drag-and-drop to reorganise, and access native context menus for lightning-fast navigation.
* 🎨 **Sleek, Dynamic Interface**: Built natively in Electron and JavaScript, the interface features a custom "glassmorphism" aesthetic, complete with dark mode, glowing accents, and smooth micro-animations.

## 🚀 Why OmniClient?

Working in IT support demands precision. OmniClient acts as your absolute command centre, giving you an all-encompassing, omnipotent view over your entire client roster from a single, unified interface.

## 📸 Screenshots

<p align="center">
  <img src="assets/screenshot1.png" alt="OmniClient Main Interface" width="800"/>
  <br>
  <em>Main Browser Interface & Client Switcher</em>
</p>

<p align="center">
  <img src="assets/screenshot2.png" alt="OmniClient Vault" width="800"/>
  <br>
  <em>The Credential Vault & Bookmark Manager</em>
</p>

---

<p align="center">
  <i>Disclaimer: Antigravity was used to help during the creation process of this software.</i>
</p>
