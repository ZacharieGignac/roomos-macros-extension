## RoomOS Macro Editor

Edit Cisco RoomOS codec macros directly from VS Code.

### Features

- Browse, open, and edit device macros via a virtual filesystem (`codecfs:`)
- Create, rename, remove, activate/deactivate macros
- Profiles for multiple codecs (credentials stored securely)
- xAPI-aware IntelliSense and quick stubs
- Live macro logs in the Output panel

### Quick start

1) Open the “RoomOS Macros” view in the Explorer
2) Click “Settings” to add a profile (host, username, password)
3) Select your profile and browse your macros
4) Open a macro and press Ctrl+S to save changes back to the device

### Build locally

- Install dependencies: `npm ci`
- Typecheck: `npm run compile`
- Build: `npm run build`
- Package VSIX: `npm run pak` (outputs to `dist/`)

### Notes

- Requires VS Code 1.75+ and Node.js 18+
- SSH is the default connection; WSS can be configured per profile

### License

MIT
   - Press F5 (Run Extension) to open a Development Host



### Getting started
