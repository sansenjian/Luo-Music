# Home Refactor Plan

## Goal

Split `Home.vue` by responsibility instead of by visual chunks so the page becomes easier to maintain without scattering store access across many components.

## Target Structure

```text
src/views/Home.vue
src/composables/useHomePage.ts
src/components/home/HomeHeader.vue
src/components/home/HomeWorkspace.vue
src/components/home/HomeFooter.vue
src/components/home/HomeSearchResults.vue
src/components/home/HomeTabBar.vue
```

## Split Strategy

### 1. Keep `Home.vue` as the page shell

Responsibilities:

- Compose top-level layout
- Wire page sections together
- Keep only route-level lifecycle concerns

### 2. Move page orchestration into `useHomePage.ts`

Responsibilities:

- Coordinate `searchStore`, `playerStore`, and `toastStore`
- Handle search submit flow
- Handle result-to-play flow
- Manage active tab state
- Run page initialization logic

Suggested exposed state:

```ts
{
  ;(activeTab,
    isSearching,
    searchError,
    searchResults,
    totalResults,
    handleSearch,
    handlePlayResult,
    handlePlayAll,
    switchTab)
}
```

### 3. Split page sections into focused components

#### `HomeHeader.vue`

- Logo / title
- Search input
- User entry
- Receives props and emits events only

#### `HomeWorkspace.vue`

- Main content area
- Tab switching shell
- Search results / lyric / playlist view switching
- Presentation only

#### `HomeFooter.vue`

- Player mounting area
- Compact vs normal footer layout
- Status bar rendering

### 4. Split workspace content into smaller presentational components

#### `HomeSearchResults.vue`

- Search result list
- Loading / empty / error states
- Emits `play` and `play-all`

#### `HomeTabBar.vue`

- Tab button rendering
- Emits `change-tab`

## Data Flow Rules

- `Home.vue` uses `useHomePage()`
- `useHomePage()` is the only page-level place that talks to stores
- Child components receive props and emit events
- New home subcomponents should not import `searchStore` or `playerStore` directly

## Execution Order

1. Create `useHomePage.ts`
2. Extract `HomeTabBar.vue`
3. Extract `HomeSearchResults.vue`
4. Extract `HomeHeader.vue`
5. Extract `HomeWorkspace.vue`
6. Extract `HomeFooter.vue`

## Notes

- Reuse existing `LyricDisplay.vue`, `Playlist.vue`, `SearchInput.vue`, and `UserAvatar.vue`
- Do not change behavior during the split
- Prefer thin components and stable props over deep component nesting
