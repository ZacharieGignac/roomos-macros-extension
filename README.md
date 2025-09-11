## RoomOS Macros – VS Code Extension

Edit and manage Cisco RoomOS codec macros directly from VS Code. Browse, open, edit, create, rename, activate/deactivate, and remove macros on your device, with multi‑codec profile support and a virtual filesystem.

### Key features

- Browse macros in the Codec Macros explorer
- Open/edit macros via a virtual filesystem (`codecfs:`) by clicking items
- Save, create, rename, remove, activate/deactivate macros
- Restart macro framework from the context menu
- Multi‑codec profiles directory (secure credentials storage) with a management UI
- Seamless profile switching without reloading
- xAPI schema‑aware IntelliSense (completion and hover)
- Product filter for schema: Auto‑detect or force a specific device
- Settings toggles for confirmation prompts (macro delete, framework restart)
- Schema management: Refresh and View JSON

### Requirements

- Node.js 18+ / npm
- VS Code 1.70+
- Network access to the Cisco codec (Room/Board/Desk series)
- Admin credentials on the target codec

### Installation (development)

1. Install dependencies:
   - `npm install`
2. Build:
   - `npm run compile`
3. Launch in VS Code:
   - Press F5 (Run Extension) to open a Development Host

### Getting started

1. Open the Codec Macros explorer (Activity Bar → Explorer → Codec Macros)
2. Manage profiles (devices) via the view toolbar → “Manage Codec Profiles”
   - Add profiles by specifying Label, Host, Username, Password
   - Set Active to pick the current device; switching connects seamlessly
   - Passwords are stored in VS Code Secrets; host/username/label in global storage
3. After connecting, your macros appear in the tree
4. Click a macro to open it. Edit as desired and press Ctrl+S to save
   - On save you’ll see “Saved macro <name>” and the “unsaved” badge clears

### Explorer actions (context menu)

- Create Macro: prompts for a name, creates an empty macro, opens it
- Rename Macro: atomically renames on device (xAPI Rename)
- Remove Macro: removes from device (xAPI Remove)
- Activate Macro: enables the macro (xAPI Activate)
- Deactivate Macro: disables the macro (xAPI Deactivate)
- Restart Macro Framework: restarts the macro runtime on the device


### Dirty‑state indicator

When a `codecfs:` document has unsaved changes, its item in the tree shows the description “unsaved”. The badge updates live on change/open/save/close.


### Profiles directory (credentials)

- Profiles are managed in a dedicated webview (Manage Codec Profiles)
- Storage:
  - Host/username/label: VS Code Global State (per‑user on this machine)
  - Passwords: VS Code Secrets (Keychain/Credential Manager/Keyring)
- Editing a profile allows inline changes (Label, Host, Username), and optional password update
- Switching profiles reconnects and hot‑swaps the active device in the explorer and filesystem without reloading

### Settings & preferences

- Automatically restart macro framework when saving a macro
- Schema product selection:
  - Auto: use device detection
  - Choose a specific product to filter schema/IntelliSense
- Confirmation prompts:
  - Confirm before deleting a macro
  - Confirm before restarting the Macro Framework
### Security considerations

- Passwords are stored using VS Code’s secure secret storage

### Troubleshooting

- Cannot connect
  - Verify IP/hostname, credentials, and that the codec allows WebSocket connections over `wss:`


### Development status and disclaimer

This project is under active development and provided “as is”, without warranty of any kind. The author assumes no responsibility for any outcomes arising from the use of this software, including but not limited to:

- Loss of data
- Loss of hair
- Loss of enjoyment
- Fire in the engine room

Use at your own risk. Test changes in non‑production environments first.

### Development scripts

- Build once: `npm run compile`
- Watch build: `npm run watch`

### License

MIT (see LICENSE if present). Cisco, RoomOS, and related marks are property of their respective owners.


