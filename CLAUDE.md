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
npm run test:run         # Run regular tests once
npm run test:native      # Run better-sqlite3 native tests with ABI restore
npm run test:ci          # Run regular + native tests
npm run test:coverage    # Regular tests with renderer coverage

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
- `descriptors.ts` - Platform descriptors (id, display name, runtime, capabilities, enabled state)
- `loginRouting.ts` - Legacy login bridge routing and primary profile resolution
- `plugin/BuiltInAdapterLoader.ts` - Loads built-in platform adapters (NetEase, QQ)
- `plugin/ExternalAdapterProxy.ts` - Proxies external plugin-provided adapters
- `plugin/PluginAdapterBridge.ts` - Bridges plugin SDK adapters into the MusicPlatformAdapter interface
- `index.ts` - `getMusicAdapter(platformId)` factory resolving local vs. external adapter runtime

**Runtime Platforms** (`src/platform/`):

- `common/platformService.ts` - `PlatformServiceBase` with `IPlatformService` interface
- `electron/electronPlatformService.ts` - Electron-specific (window controls, IPC, cache)
- `web/webPlatformService.ts` - Browser fallback
- `index.ts` - Auto-detects and initializes correct platform via `getPlatformService()`

Use `import platform from '@/platform'` for legacy compatibility or `getPlatformService()` for typed access.

### Player Architecture

The player is split across two locations:

**Player engine** — `src/utils/player/` (framework-agnostic audio logic):

```
player/
├── core/
│   ├── playerCore.ts        # Audio element wrapper, events, playback
│   ├── playbackController.ts  # Play mode logic, next/prev/seek
│   └── playlistManager.ts   # Queue manipulation, shuffle
├── modules/
│   └── playbackErrorHandler.ts  # Auto-skip failed tracks
├── constants/
│   ├── index.ts             # PLAY_MODE enum
│   ├── volume.ts            # VOLUME defaults
│   └── timeInterval.ts      # SKIP_CONFIG
├── helpers/
│   ├── timeFormatter.ts     # formatTime utility
│   └── shuffleHelper.ts     # Shuffle algorithm
├── audioManager.ts          # Audio context management
├── lyric-parser.ts          # LRC parsing, time-synced lookup
├── lyric-display.ts         # Lyric display state
└── mediaProxy.ts            # MediaSession proxy layer
```

**Player store** — `src/store/player/` (Pinia state, persistence, IPC):

```
player/
├── playerState.ts           # Core reactive state
├── playbackActions.ts       # Play/pause/next/prev/seek actions
├── audioEvents.ts           # Audio element event handlers
├── lyricSync.ts             # Lyric synchronization with playback
├── ipcHandlers.ts           # IPC event registration
├── playerPersistence.ts     # localStorage persistence
├── playerSnapshot.ts        # State snapshot for IPC/sync
├── playerStoreDeps.ts       # Dependency injection config
├── songPrefetcher.ts        # Next-song URL prefetch
├── runtime.ts               # Runtime initialization
└── index.ts                 # Re-exports
```

`playerStore.ts` imports from `src/store/player/` — avoid adding business logic directly to the store index.

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

| Target       | Tool           | Output                       |
| ------------ | -------------- | ---------------------------- |
| Renderer     | Vite           | `build/`                     |
| Main process | electron-vite  | `build/electron/main.cjs`    |
| Preload      | electron-vite  | `build/electron/preload.cjs` |
| API server   | tsdown         | `build/service/index.cjs`    |
| Package      | Electron Forge | `release/`                   |

Path utilities are centralized in `electron/utils/paths.ts` - never use `__dirname` directly.

## Key Constraints

1. **No direct Electron imports in renderer** - Use `src/platform/` abstraction or preload IPC
2. **No `any` types** - Migrating to TypeScript; all new code must be typed
3. **Single source of truth** - Player state lives in `playerStore.ts`, not scattered in components
4. **ESM throughout** - Use `import/export` syntax; Electron main uses CJS output via electron-vite and the local API service uses CJS output via tsdown
5. **npm only** - No pnpm; project uses `package-lock.json`
6. **UTF-8 only** - Text files must use UTF-8 (no BOM)

## Common Patterns

### Adding a new music platform

1. Register a platform descriptor in `src/platform/music/descriptors.ts`
2. Implement the adapter via a plugin (built-in or external) following `MusicPlatformAdapter` in `src/platform/music/interface.ts`
3. Built-in adapters are loaded by `BuiltInAdapterLoader`; external adapters go through `ExternalAdapterProxy`
4. Create API endpoints in `src/api/` for the platform if needed

### Adding IPC between main/renderer

1. Define channel in `packages/shared/protocol/channels.ts`
2. Add type mapping in `electron/ipc/IpcService.ts`
3. Register handler in `electron/ipc/handlers/` directory
4. Expose via `electron/sandbox/index.ts` using `contextBridge.exposeInMainWorld`

### Running tests for specific areas

```bash
# Test a specific file
npm run test:run -- tests/store/playerStore.test.ts

# Test with pattern
npm run test:run -- -t "lyric"

# Watch mode
npm run test:watch
```

## Package Manager

Use **npm**. The project has `package-lock.json` and enforces Node.js 24+ via `engines` field.
