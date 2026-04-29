# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog. Versions follow Semantic Versioning.

## [0.7.0] - 2026-04-29

### Removed
- SSH connection support. All connections now use WebSocket Secure (WSS) exclusively.

### Changed
- Complete redesign of Settings page with modern, card-based layout.
- Simplified profile management by removing connection method selection.
- Existing profiles with SSH configured will automatically use WSS.
- Compact, single-line preference items with tooltip descriptions.
- Improved visual hierarchy with enhanced typography and spacing.
- Responsive design for better layout on various screen sizes.

### Highlights from Recent Releases
- Enhanced IntelliSense with automatic method completions on leaf nodes (`.get()`, `.on()`, `.set()`).
- Automatic `import xapi from 'xapi';` added to new macros.
- Reworked context menus with improved access to Create and Restart commands.
- Array notation support for xAPI paths (e.g., `xapi.Status.Call[1].Status`).
- Flexible cursor positioning for Insert Stub and Show Help commands.

## [0.6.3] - 2026-04-29

### Added
- Array notation support for xAPI intellisense (e.g., `xapi.Status.Call[1].Status`, `xapi.Status.Audio.Input.Connectors.Line[1].Mute`).
- Leaf node method completions for Status (`.get()`, `.on()`), Config (`.get()`, `.set()`), and Event (`.on()`) categories.
- TypeScript interfaces for improved type safety in xAPI language provider (`XapiParseContext`, `SchemaMetadata`, `SchemaParameter`).
- Comprehensive JSDoc documentation for xAPI parsing and schema methods.
- New macros now automatically include `import xapi from 'xapi';` at the top.
- "Actions (right-click)" item at the top of macro tree view for easy access to Create and Restart commands.
- Create Macro command now available in context menu when right-clicking any macro or the Actions item.

### Changed
- xAPI path parser now strips array indices before schema lookup while preserving bracket notation in word ranges.
- Improved completion provider to detect leaf nodes and provide appropriate method suggestions.
- Enhanced word range detection regex to support array bracket notation (`[n]`).
- Refactored shared constants (`XapiCategory` type, `XAPI_CATEGORIES` array) for better maintainability.
- Create Macro and Restart Macro Framework commands now accessible from tree view title bar menu.
- "Insert Stub" command now inserts code on a new line below the current line with preserved indentation.
- "Insert Stub" and "Show Help" commands now work with cursor positioned anywhere within an xAPI path (beginning, middle, or end).
- Exported `getWordRangeAt` function for consistent xAPI path extraction across language features.

### Fixed
- Intellisense now correctly provides completions after array-indexed path segments.
- Method completions (`.get()`, `.on()`, `.set()`) now appear on leaf status/config/event nodes.
- "Insert Stub" and "Show Help" commands no longer require cursor to be at the end of the xAPI path.
- Hover provider now correctly constructs text ranges when extracting xAPI paths (fixed incorrect Range constructor parameters).

## [0.6.2] - 2026-03-02

### Added
- Reconnect action in the RoomOS explorer title bar to manually re-enable and retry the active profile.
- Connection-failure notification prompting manual re-enable after retry exhaustion.

### Changed
- Connection activation now waits for codec readiness before reporting connected state.
- Automatic reconnect now stops after capped retries and transitions cleanly to offline state.
- Extension activation startup no longer blocks Settings while schema/product warmup runs.

## [0.6.1] - 2025-10-02

### Changed
- Temporarily force all connections to WSS to avoid a critical SSH save bug.
- Default connection method to WSS when adding new codecs.

### Note
- SSH selection is accepted in UI but is treated as WSS until the bug is fixed.

## [0.6.0] - 2025-09-29

### Added
- Profiles webview UI with improved profile management.
- SSH/WSS connection method support in profiles.
- Macro log output channel and event subscription.
- xAPI help and stub insertion commands in editor context menu.
- Context menu items to activate/deactivate macros directly from codecfs files.

### Changed
- Refactored extension services and schema path resolution.
- Status bar now shows the active profile label.
- Product code mapping moved to its own module.

### Removed
- Disclaimer section from settings.
- Old VSIX artifacts from the repository.

### Build
- Added `devpak` script for date-stamped VSIX builds and updated `pak` script output naming.

### Docs
- Updated README and added `README_DAILY.md`.

[0.6.0]: https://github.com/ZacharieGignac/roomos-macros-extension/releases/tag/v0.6.0
[0.6.1]: https://github.com/ZacharieGignac/roomos-macros-extension/releases/tag/v0.6.1
[0.6.2]: https://github.com/ZacharieGignac/roomos-macros-extension/releases/tag/v0.6.2
[0.6.3]: https://github.com/ZacharieGignac/roomos-macros-extension/releases/tag/v0.6.3