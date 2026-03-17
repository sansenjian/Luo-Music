# Lightweight Dependency Graph

Generated: 2026-03-15T09:25:48.728Z

## Scope

- Scanned files: 162
- Module groups: 20
- Cross-group import edges: 47

## Groups

- src/views
- src/components
- src/composables
- src/store
- src/services
- src/platform
- src/api
- src/utils
- src/base
- src/config
- src/core
- src/router
- src/types
- src/entry
- electron/main
- electron/ipc
- electron/shared
- electron/sandbox
- electron/utils
- electron/core

## Mermaid

```mermaid
graph LR
  src_views["src/views"]
  src_components["src/components"]
  src_composables["src/composables"]
  src_store["src/store"]
  src_services["src/services"]
  src_platform["src/platform"]
  src_api["src/api"]
  src_utils["src/utils"]
  src_base["src/base"]
  src_config["src/config"]
  src_core["src/core"]
  src_router["src/router"]
  src_types["src/types"]
  src_entry["src/entry"]
  electron_main["electron/main"]
  electron_ipc["electron/ipc"]
  electron_shared["electron/shared"]
  electron_sandbox["electron/sandbox"]
  electron_utils["electron/utils"]
  electron_core["electron/core"]
  src_store -->|13| src_utils
  electron_ipc -->|12| electron_core
  src_components -->|11| src_store
  src_views -->|10| src_components
  electron_ipc -->|9| electron_shared
  electron_main -->|7| electron_core
  src_components -->|7| src_composables
  src_store -->|7| src_platform
  src_views -->|6| src_store
  src_api -->|5| src_utils
  src_components -->|5| src_api
  src_composables -->|5| src_api
  src_views -->|5| src_composables
  src_components -->|4| src_platform
  src_composables -->|4| src_platform
  src_platform -->|4| src_api
  src_platform -->|4| src_base
  src_utils -->|4| src_platform
  electron_core -->|3| electron_utils
  electron_main -->|3| electron_utils
```

## Top Cross-Group Edges

- src/store -> src/utils (13)
- electron/ipc -> electron/core (12)
- src/components -> src/store (11)
- src/views -> src/components (10)
- electron/ipc -> electron/shared (9)
- electron/main -> electron/core (7)
- src/components -> src/composables (7)
- src/store -> src/platform (7)
- src/views -> src/store (6)
- src/api -> src/utils (5)
- src/components -> src/api (5)
- src/composables -> src/api (5)
- src/views -> src/composables (5)
- src/components -> src/platform (4)
- src/composables -> src/platform (4)
- src/platform -> src/api (4)
- src/platform -> src/base (4)
- src/utils -> src/platform (4)
- electron/core -> electron/utils (3)
- electron/main -> electron/utils (3)

## Potential Architecture Smells

- [UI -> Platform] src/components/CacheManager.vue -> src/platform/index.ts (src/components -> src/platform)
- [UI -> Platform] src/components/LyricFloat.vue -> src/platform/index.ts (src/components -> src/platform)
- [UI -> Platform] src/components/SettingsPanel.vue -> src/platform/index.ts (src/components -> src/platform)
- [UI -> Platform] src/components/UserAvatar.vue -> src/platform/index.ts (src/components -> src/platform)
- [UI -> Platform] src/views/Home.vue -> src/platform/index.ts (src/views -> src/platform)
