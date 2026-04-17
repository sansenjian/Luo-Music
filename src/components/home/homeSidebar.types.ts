export type HomeSidebarCollectionKind = 'playlist' | 'album'

export type HomeSidebarCollectionSelection = {
  uiId: string
  sourceId: string | number
  kind: HomeSidebarCollectionKind
  name: string
  coverUrl: string
  summary: string
}
