## Macros Virtual Filesystem for Cisco Codecs

Edit Cisco codec macros directly from VS Code via a virtual filesystem.

### Install from Marketplace

Install directly from the VS Code Marketplace:
https://marketplace.visualstudio.com/items?itemName=ZacharieGignac.roomos-macros-extension

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

### Install (.vsix)

- Get the VSIX file (from a release or by building locally via `npm run pak`).
- In VS Code: Extensions view → three-dot menu → Install from VSIX… → pick the file.
- Or via CLI:

```bash
code --install-extension dist/Macros-Virtual-Filesystem-for-Cisco-Codecs-<version>.vsix
```

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

Cisco and RoomOS © 2025 Cisco Systems, Inc. and/or its affiliates. All rights reserved.

Cisco and the Cisco logo are trademarks or registered trademarks of Cisco and/or its affiliates in the U.S. and other countries.

This project is an independent community project and is not affiliated with, sponsored, or endorsed by Cisco.