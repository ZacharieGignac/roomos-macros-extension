# RoomOS Macro Editor – Daily Build Readme

If you are evaluating a daily / insider build, prefer this document. For the stable marketplace listing, see README.md.

---
## At a Glance

Edit, manage, and debug Cisco RoomOS codec macros directly inside VS Code using a virtual filesystem (`codecfs:`), multi‑device profiles, resilient auto‑reconnect, schema‑aware IntelliSense, product‑filtered xAPI help, and live macro log streaming.

---
## Core Feature Set
- Codec Macros explorer view with tree of macros
- Open / edit macros via virtual file system scheme `codecfs:`
- Create, save, rename, delete, activate, deactivate macros
- Restart Macro Framework command
- Multi‑codec Profile management UI (add, edit, remove, switch, secure secret storage)
- Seamless profile switching without window reload
- xAPI schema‑aware IntelliSense (completion, optional hover help)
- xAPI Help panel (context command) and stub insertion (command palette or context menu)
- Product filter (auto detection or forced product) for schema filtering
- Settings toggles for confirmations (delete macro, restart framework)
- Schema management (Refresh schema, view raw JSON, status query)
- Live macro logs (color / badge formatted severity) in dedicated Output channel
- Dirty state indicator ("unsaved" label) in tree per macro
- Secure credential handling (VS Code Secret Storage)

---
## New features

### 1. Dual Connection Methods (SSH & WSS)
- Each profile can choose between SSH (default) or Secure WebSocket (WSS) for xAPI transport.

### 2. Resilient Auto‑Reconnect Logic
- Automatic exponential backoff reconnect when the connection drops (network hiccups, codec reboot, websocket closure).
- Health probe every 5s (lightweight SystemUnit name get) to proactively detect silent drops and trigger reconnect.

### 3. Better network error handling
- yep

### 4. Connection Debug Output Channel
- A dedicated "RoomOS Macro Connection" Output channel streams structured debug entries (timestamped, host tagged) including reconnect attempts and probe results.

### 5. Macro Log Formatting Enhancements
- Log lines show HH:MM:SS.mmm time slice, severity badge (🔴 error, 🟡 warn, 🟢 info/other), and optional [MacroName] prefix.

### 6. Unsaved Macro Safety on Profile Switch
- Attempting to switch the active profile while `codecfs:` documents are dirty prompts to save all (codec macros only). Switch is aborted if save fails or user cancels.

### 7. Legacy Settings
- On activation, legacy single‑device settings (`codec.host`, `codec.username`, `codec.password`) are deleted

### 8. Product Auto‑Detection Intelligence
- Tries `Status.SystemUnit.ProductPlatform` first, normalizes and maps to internal code table; falls back to `Status.SystemUnit.ProductId` if needed.
- Stores platform & productId internally for status diagnostics (schema status query: `ciscoCodec.getSchemaStatus`).

### 9. Schema Index Persistence & Filtering
- Schema fetched from `https://roomos.cisco.com/api/schema/latest` then compactly indexed and cached (with Set of products per subtree) for fast completion / help lookup.
- Product filter hides unsupported branches; if filtering would hide everything (unknown code), falls back to unfiltered view.

### 10. Forced Product Override
- Setting `codec.forcedProduct` (via command `ciscoCodec.setForcedProduct`) pins IntelliSense filtering even if connected device differs (useful for offline authoring or targeting a different model).

### 11. Status Bar Context Key
- Connection state sets context `codec.connected` enabling conditional UI contributions (menus, when clauses) for connected vs disconnected scenarios.

### 12. Macro Activation/Deactivation Auto‑Restart (Optional)
- Setting `codec.autoRestartOnActivateDeactivate` triggers an automatic framework restart after activating or deactivating a macro (with error handling if restart fails).

### 13. Auto‑Restart on Save (Optional)
- Setting `codec.autoRestartOnSave` restarts the macro framework after successful save (with user notifications on success/failure).

### 14. Dirty Macro Tracking Service
- Central tracker listens to open/save/close/change events on `codecfs:` docs and updates tree descriptions in real time.

### 15. Schema Stub Insertion Logic
- Command builds parameter object with defaults (if provided) for Command nodes and contextually inserts at the current line replacing the partially typed path token.

### 16. Product Catalog Utilities
- Internal mapping file (`products.ts`)

### 17. Health Probe Visibility in Debug Channel
- Successful probes log `probe ok` with system unit name snippet; failures log and drive reconnection scheduling.

### 18. Safe Error JSON Serialization
- Connection debug logging converts Error instances into serializable shapes (name/message/stack) to improve bug reports without leaking raw object references.

---
## Daily Build Usage Tips
- Use the "RoomOS Macro Connection" Output channel to diagnose reconnect behavior or schema fetch failures.
- If schema completion seems stale, run the Refresh Schema command and reopen your macro file to nudge IntelliSense reloads.
- For offline work / targeting a different model than the connected device, set a forced product and continue coding—remember to revert to auto later for validation.

---
## Development (Daily Context)
Same steps as README.md plus you can:
- Inspect debug output: View → Output → RoomOS Macro Connection.
- Tail macro runtime logs: View → Output → RoomOS Macro Logs.
- Use VS Code Developer Tools (Help → Toggle Developer Tools) to capture any webview or activation errors for filing issues.

---
## License
MIT (same as main). Cisco, RoomOS, and related marks remain property of their respective owners.

---
_Last generated: 2025-09-25_
