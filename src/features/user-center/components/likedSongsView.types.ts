export type LikedSongsFilterScope = 'all' | 'name' | 'artist' | 'album'

export interface LikedSongsFilterScopeOption {
  value: LikedSongsFilterScope
  label: string
}
