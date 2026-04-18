export type SidebarIconName =
  | 'home'
  | 'discover'
  | 'roaming'
  | 'liked'
  | 'history'
  | 'songs'
  | 'favorites'
  | 'artists'
  | 'local'

export type HomeSidebarNavItem = {
  id: string
  label: string
  icon: SidebarIconName
}

export type HomeSidebarPlaylistFilter = 'created' | 'favorites'
export type HomeSidebarCollectionTone = 'mono' | 'violet' | 'mist' | 'ocean'
export type HomeSidebarCollectionKind = 'playlist' | 'album'

export type HomeSidebarCollectionSelection = {
  uiId: string
  sourceId: string | number
  kind: HomeSidebarCollectionKind
  name: string
  coverUrl: string
  summary: string
}
