export type UserTab = 'liked' | 'playlist' | 'album' | 'events'

export type UserTabStateMap = Record<UserTab, boolean>

export function createLoadingMap(): UserTabStateMap {
  return {
    liked: false,
    playlist: false,
    album: false,
    events: false
  }
}

export function createMountedTabs(activeTab: UserTab = 'liked'): UserTabStateMap {
  return {
    liked: activeTab === 'liked',
    playlist: activeTab === 'playlist',
    album: activeTab === 'album',
    events: activeTab === 'events'
  }
}

export function createLoadedTabs(): UserTabStateMap {
  return {
    liked: false,
    playlist: false,
    album: false,
    events: false
  }
}

export function parseQueryValue(value: unknown): string | null {
  const normalizedValue = Array.isArray(value) ? value[0] : value
  if (normalizedValue == null) {
    return null
  }

  const stringValue = String(normalizedValue).trim()
  return stringValue.length > 0 ? stringValue : null
}

export function parseUserTab(value: unknown): UserTab {
  const normalizedValue = parseQueryValue(value)
  if (
    normalizedValue === 'playlist' ||
    normalizedValue === 'album' ||
    normalizedValue === 'events' ||
    normalizedValue === 'liked'
  ) {
    return normalizedValue
  }

  return 'liked'
}
