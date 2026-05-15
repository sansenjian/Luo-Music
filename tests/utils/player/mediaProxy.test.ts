import { describe, expect, it } from 'vitest'

import {
  createRemoteMediaProxyUrl,
  isRemoteMediaProxyUrl,
  resolvePlaybackMediaUrl,
  shouldProxyRemoteMediaUrl
} from '@/utils/player/mediaProxy'

describe('mediaProxy', () => {
  it('wraps remote media URLs for Electron playback', () => {
    const sourceUrl = 'http://m7.music.126.net/song.mp3?vuutv=a+b='

    expect(resolvePlaybackMediaUrl(sourceUrl, true)).toBe(createRemoteMediaProxyUrl(sourceUrl))
    expect(resolvePlaybackMediaUrl(sourceUrl, false)).toBe(sourceUrl)
  })

  it('does not proxy non-http or already proxied media URLs', () => {
    const proxiedUrl = createRemoteMediaProxyUrl('https://song.test/stream.mp3')

    expect(isRemoteMediaProxyUrl(proxiedUrl)).toBe(true)
    expect(shouldProxyRemoteMediaUrl(proxiedUrl, true)).toBe(false)
    expect(resolvePlaybackMediaUrl('luo-media://media?path=D%3A%2FMusic%2Fsong.mp3', true)).toBe(
      'luo-media://media?path=D%3A%2FMusic%2Fsong.mp3'
    )
  })
})
