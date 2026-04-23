# Changelog

All notable changes to this project will be documented in this file.

## [0.0.1] - 2026-04-23

Initial public release.

### Added

- `/effort` slash command for inspecting and changing Pi thinking level
- `/effort show` and `/effort options` for current/default/model-specific visibility
- `/effort default <level>` and `/effort default clear` for persistent defaults
- model-aware effort discovery using Pi's current `xhigh` support rules
- unit tests for command parsing, settings writes, and model-level availability
- runtime integration tests proving:
  - session effort changes through the Pi session runtime
  - persistent defaults are written to Pi settings
  - new sessions inherit `defaultThinkingLevel` from Pi core settings behavior

### Notes

- `pi-effort` uses Pi's own thinking vocabulary: `off`, `minimal`, `low`,
  `medium`, `high`, `xhigh`
- provider-native effort labels are intentionally not exposed directly
