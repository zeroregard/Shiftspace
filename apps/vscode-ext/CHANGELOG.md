# Changelog

All notable changes to Shiftspace will be documented in this file.

## [0.1.42] — 2026-04-11

### Added

- add negativePattern, hint fields to code smells insight (#105) _(vscode-ext)_

### Changed

- Add Sentry-based error telemetry with opt-in consent
- decompose ShiftspacePanel and add max-lines lint rule (#109) _(vscode-ext)_
- Add worktree sorting functionality with multiple sort modes
- share GitDataProvider between sidebar and tab views (#96) _(vscode-ext)_

### Fixed

- prevent externally-controlled format string in MCP log calls (CWE-134) (#106) _(shiftspace)_
- break 0-files insight loop and add cancel button (#104) _(vscode-ext)_
- strip stale [Unreleased] section when prepending versioned changelog entry (#103)

## [0.1.41] — 2026-04-10

### Added

- auto-generate marketplace changelogs from conventional commits (#102)
- add worktree plus button to grove and sidebar views (#99) _(renderer-grove)_
- add repoDiscovery setting to control cross-repo tracking (#100) _(vscode-ext)_

### Changed

- Add relative time formatting with auto-updating hook
- enforce kebab-case filenames via oxlint unicorn/filename-case (#98)

### Fixed

- resolve code scanning alerts #17 and #18 (#97)

## [0.1.40] — 2026-04-08

### Added

- animated work tree re-ordering (motion) + handle worktree path changes+ improve error resilience

### Fixed

- mitigate sporadic FSEvents dropped events error (#95) _(vscode-ext)_

## [0.1.39] — 2026-04-08

### Fixed

- fix config key double-prefix and missing TooltipProvider (#94) _(vscode-ext)_

## [0.1.37] — 2026-04-07

### Changed

- Automate VS Code extension publishing from Release workflow

### Fixed

- resolve GitHub code scanning security alerts (#89)

## [0.1.36] — 2026-04-07

### Changed

- Add worktree management actions and improve sidebar styling
- Add package management functionality to preview app

## [0.1.35] — 2026-04-06

### Added

- jump-to-line support for annotation badges (#83)
- status bar insights, resizable file list, animated loader, stability fixes (#80)

### Changed

- button linting, styling (#82)

## [0.1.34] — 2026-04-05

### Added

- bundled VSCode themes (dark, light)

## [0.1.33] — 2026-04-05

### Added

- less rasta icon

### Changed

- Refactor color palette to modern 3-layer depth system
- Deduplicate partially-staged files in tree view
- Add Playwright component tests for core UI components
- Add "All files" diff mode to browse all tracked repository files
- Add deterministic seeded PRNG for stable E2E test screenshots

## [0.1.32] — 2026-04-05

### Fixed

- render slim grove view in sidebar instead of redirect (#74) _(shiftspace)_

## [0.1.31] — 2026-04-05

### Changed

- better tab icon

### Fixed

- use status bar pls (#72)

## [0.1.30] — 2026-04-05

### Changed

- Improve command execution security with input validation
- Add sidebar view with slim worktree cards

## [0.1.29] — 2026-04-05

### Changed

- Add test IDs to file node badges and simplify release workflow

## [0.1.28] — 2026-04-05

### Changed

- Add VS Code Marketplace publishing workflow and improve extension metadata
