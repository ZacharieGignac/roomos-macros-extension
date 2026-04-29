# RoomOS Macros Extension for VS Code

**Edit your Cisco codec macros directly in VS Code** — No more web interface copy-paste! Manage all your RoomOS macros with the power of Visual Studio Code's editor, IntelliSense, and debugging tools.


---

## ✨ What Can You Do?

- 📝 **Edit macros in VS Code** — Use your favorite editor with syntax highlighting, code completion, and formatting
- 🔌 **Live sync** — Save changes with `Ctrl+S` and they're instantly deployed to your device
- 🌳 **Manage multiple codecs** — Switch between devices using profiles
- 🚀 **Smart IntelliSense** — Get code suggestions for xAPI commands, status, config, and events
- 📊 **Live macro logs** — See console output from running macros in the VS Code Output panel
- 🛠️ **Quick stubs** — Generate code templates for common xAPI patterns instantly
- 🔄 **Auto-reconnect** — Handles network issues gracefully with automatic retry

---

## 🚀 Quick Start

### 1. Install the Extension

**From VS Code Marketplace:**
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "**RoomOS Macros**"
4. Click **Install**

Or install directly: [VS Code Marketplace Link](https://marketplace.visualstudio.com/items?itemName=ZacharieGignac.roomos-macros-extension)

### 2. Add Your First Codec

1. Open the **RoomOS Macros** view in the Explorer sidebar
2. Click the **Settings** button (⚙️) in the view title bar
3. Click **Add New Profile** and enter:
   - **Profile Name** — A friendly name (e.g., "Meeting Room A")
   - **Host/IP** — Your codec's IP address or hostname
   - **Username** — Admin username
   - **Password** — Admin password
4. Click **Save** and **Activate** the profile

### 3. Start Editing!

1. Your macros appear in the **RoomOS Macros** tree view
2. Click any macro to open and edit it
3. Make your changes
4. Press `Ctrl+S` to save — changes deploy instantly!
5. Right-click macros to activate/deactivate or delete them

---

## 🎯 Key Features

### 📂 Virtual Filesystem
Your codec's macros appear as files in VS Code using a special `codecfs://` virtual filesystem. Edit them like regular files!

### 🧠 Intelligent xAPI IntelliSense
Start typing `xapi.` and get smart suggestions:
- **Commands** — `xapi.Command.Audio.Volume.Increase()`
- **Status** — `xapi.Status.Call[1].Status.get()`
- **Config** — `xapi.Config.Audio.DefaultVolume.set(50)`
- **Events** — `xapi.Event.CallDisconnect.on(event => {...})`


### 🎨 Insert Code Stubs
Place your cursor on any xAPI path and:
1. Right-click → **xAPI: Insert Stub**
2. Or use Command Palette (`Ctrl+Shift+P`) → "xAPI: Insert Stub"

The extension generates ready-to-use code on the line below, with proper indentation!

**Example:** Cursor on `xapi.Status.Audio.Volume` inserts:
```javascript
const value = await xapi.Status.Audio.Volume.get();
```


### 📖 Instant xAPI Documentation
Hover over any xAPI path or right-click → **xAPI: Show Help for Symbol** to see:
- Parameter descriptions
- Value ranges
- Required vs optional parameters
- Default values

### 📺 Live Macro Logs
View `console.log()` output from your running macros in real-time:
1. Open **Output** panel (`Ctrl+Shift+U`)
2. Select **RoomOS Macros Log** from the dropdown
3. See all logs from your active macros

### 🔄 Profile Management
- **Multiple codecs** — Create profiles for all your devices
- **Quick switching** — Activate any profile from the Settings UI
- **Secure storage** — Credentials stored safely in VS Code's secure storage
- **Connection status** — See online/offline status in the status bar

---

## ⚙️ Settings

Configure the extension in VS Code Settings (`Ctrl+,`) → search "codec":

| Setting | Default | Description |
|---------|---------|-------------|
| `codec.autoRestartOnSave` | `true` | Auto-restart macro framework when saving |
| `codec.autoRestartOnActivateDeactivate` | `true` | Auto-restart when activating/deactivating macros |
| `codec.confirmMacroDelete` | `true` | Ask for confirmation before deleting |
| `codec.showSchemaHover` | `false` | Show xAPI documentation on hover |
| `codec.applySchemaToIntellisense` | `true` | Enable xAPI IntelliSense |
| `codec.forcedProduct` | `"auto"` | Force specific product for schema filtering |

---

## 📚 Common Tasks

### Create a New Macro
1. Right-click **Actions (right-click)** in the RoomOS Macros view
2. Select **Create Macro**
3. Enter a name (without `.js` extension)
4. Edit and save!

New macros automatically include `import xapi from 'xapi';` at the top.

### Activate/Deactivate Macros
**From the tree view:**
- Right-click a macro → **Activate Macro** or **Deactivate Macro**

**From an open file:**
- Right-click in the editor → **Activate Macro** or **Deactivate Macro**

### Rename or Delete Macros
- Right-click a macro in the tree view
- Select **Rename Macro** or **Delete Macro**

### Restart Macro Framework
- Click **Actions (right-click)** in the tree view
- Select **Restart Macro Framework**

Or use Command Palette → "Codec: Restart Macro Framework"

### Reconnect After Network Issue
If connection fails:
1. Check the notification with reconnect prompt
2. Or click the **Reconnect** button (🔄) in the RoomOS Macros view title bar
3. Or manually re-activate your profile in Settings

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file for details.

### Cisco Trademark Notice

Cisco and RoomOS © 2025 Cisco Systems, Inc. and/or its affiliates. All rights reserved.

Cisco and the Cisco logo are trademarks or registered trademarks of Cisco and/or its affiliates in the U.S. and other countries.

**This project is an independent community project and is not affiliated with, sponsored, or endorsed by Cisco.**

---

**Made with ❤️ for the Cisco collaboration community**
