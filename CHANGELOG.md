# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog. Versions follow Semantic Versioning.

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