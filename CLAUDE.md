# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

```bash
# Development
npm run dev              # Full dev (API server + Vite)
npm run dev:web          # Web-only (no API server)
npm run dev:electron     # Electron development

# Building
npm run build:web        # Output to dist/ (Vercel deployment)
npm run build:electron   # Output to build/ + release/

# Testing
npm run test:run         # Run all tests once
npm run test:ui          # Interactive test UI
npm run test:coverage    # Tests with coverage

# Type checking
npm run typecheck        # Run vue-tsc and tsc

# Linting
npm run lint             # Check for issues
npm run lint:fix         # Auto-fix issues
```

## Architecture Overview

### Platform Abstraction Layer

The codebase uses a dual-abstraction pattern for cross-platform support:

**Music Platforms** (`src/platform/music/`):
- `interface.ts` - Base `MusicPlatformAdapter` class defining `search`, `getSongUrl`, `getLyric`, `getPlaylistDetail`
- `netease.ts` / `qq.ts` - Platform-specific implementations
- `index.ts` - `getMusicAdapter(platform)` factory function

**Runtime Platforms** (`src/platform/`):
- `common/platformService.ts` - `PlatformServiceBase` with `IPlatformService` interface
- `electron/electronPlatformService.ts` - Electron-specific (window controls, IPC, cache)
- `web/webPlatformService.ts` - Browser fallback
- `index.ts` - Auto-detects and initializes correct platform via `getPlatformService()`

Use `import platform from '@/platform'` for legacy compatibility or `getPlatformService()` for typed access.

### Player Architecture

The player is modularized under `src/utils/player/`:

```
player/
├── core/
│   ├── playerCore.ts      # Audio element wrapper, events, playback
│   ├── playbackController.ts  # Play mode logic, next/prev/seek
│   ├── playlistManager.ts # Queue manipulation, shuffle
│   └── lyric.ts           # LRC parsing, time-synced lookup
├── modules/
│   └── playbackErrorHandler.ts  # Auto-skip failed tracks
├── constants/
│   ├── playMode.ts        # PLAY_MODE enum
│   ├── volume.ts          # VOLUME defaults
│   └── timeInterval.ts    # SKIP_CONFIG
└── helpers/
    └── timeFormatter.ts   # formatTime utility
```

`playerStore.ts` orchestrates these modules - avoid adding business logic directly to the store.

### API Layer

`src/api/` follows an adapter pattern:

- `adapter.ts` - `QQMusicAdapter` and `NeteaseAdapter` classes wrapping HTTP requests
- `responseHandler.ts` - `parseQQMusicResponse`, `parseNeteaseResponse`, `handleApiError`
- Platform-specific files (`netease.ts`, `qqmusic.ts`) - Endpoint functions

All API calls go through adapters; do not call `axios` directly from components.

### State Management

Pinia stores in `src/store/`:
- `playerStore.ts` - Playback state, playlist, lyrics, IPC
- `searchStore.ts` - Search results, platform selection
- `userStore.ts` - User profile, login state
- `playlistStore.ts` - User playlists
- `toastStore.ts` - Global notifications

Stores use `pinia-plugin-persistedstate` for localStorage persistence of specific fields.

### Build System

**electron-vite** handles Electron builds:

| Target | Tool | Output |
|--------|------|--------|
| Renderer | Vite | `build/` |
| Main process | electron-vite | `build/electron/main.cjs` |
| Preload | electron-vite | `build/electron/preload.cjs` |
| API server | tsup | `build/server/server.cjs` |
| Package | Electron Forge | `release/` |

Path utilities are centralized in `electron/utils/paths.ts` - never use `__dirname` directly.

## Key Constraints

1. **No direct Electron imports in renderer** - Use `src/platform/` abstraction or preload IPC
2. **No `any` types** - Migrating to TypeScript; all new code must be typed
3. **Single source of truth** - Player state lives in `playerStore.ts`, not scattered in components
4. **ESM throughout** - Use `import/export` syntax; Electron main uses CJS output via tsup
5. **npm only** - No pnpm; project uses `package-lock.json`
6. **UTF-8 only** - Text files must use UTF-8 (no BOM)

## Common Patterns

### Adding a new music platform

1. Create `src/platform/music/newplatform.ts` extending `MusicPlatformAdapter`
2. Add platform ID to `src/platform/music/index.ts` factory
3. Create `src/api/newplatform.ts` for endpoint functions
4. Update `searchStore.ts` to include platform option

### Adding IPC between main/renderer

1. Define channel in `electron/ipc.ts`
2. Expose via `electron/sandbox/index.ts` using `contextBridge.exposeInMainWorld`
3. Handle in `src/platform/electron/electronPlatformService.ts`

### Running tests for specific areas

```bash
# Test a specific file
npx vitest run tests/store/playerStore.test.ts

# Test with pattern
npx vitest run -t "lyric"

# Watch mode
npm run test -- --watch
```

## Package Manager

Use **npm**. The project has `package-lock.json` and enforces Node.js 24+ via `engines` field.
