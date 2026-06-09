import { afterEach, describe, expect, it } from 'vitest'

import {
  replaceRuntimePlatformDescriptors,
  resetRuntimePlatformDescriptors
} from '@/platform/music/descriptors'
import { getPlatformDisplayInfo } from '@/platform/music/display'

describe('platform music display helpers', () => {
  afterEach(() => {
    resetRuntimePlatformDescriptors()
  })

  it('uses registered platform descriptors for display names', () => {
    replaceRuntimePlatformDescriptors([
      {
        id: 'kugou',
        displayName: 'Kugou Music',
        source: 'external',
        runtime: 'external-host',
        enabled: true,
        capabilities: {
          search: true,
          songUrl: true,
          songDetail: true,
          lyric: true,
          playlistDetail: true,
          needsHydration: false,
          supportsLyricFetch: true,
          supportsUrlRefreshOnFailure: false
        }
      }
    ])

    expect(getPlatformDisplayInfo('kugou')).toEqual({
      id: 'kugou',
      displayName: 'Kugou Music',
      badgeText: 'KUGOU',
      className: 'platform-kugou'
    })
  })

  it('formats unknown platform ids without assuming built-in services', () => {
    expect(getPlatformDisplayInfo('community-source')).toEqual({
      id: 'community-source',
      displayName: 'Community Source',
      badgeText: 'COMMUNITY SOURCE',
      className: 'platform-community-source'
    })
  })

  it('falls back safely when the platform id is empty', () => {
    expect(getPlatformDisplayInfo('')).toEqual({
      id: 'unknown',
      displayName: 'Unknown',
      badgeText: 'UNKNOWN',
      className: 'platform-unknown'
    })
  })
})
