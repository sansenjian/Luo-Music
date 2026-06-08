import { describe, expect, it } from 'vitest'

import {
  REMOTE_AUDIO_CACHE_MAX_BYTES,
  createByteLimitTransform,
  isRejectedRemoteMediaContentType,
  parseContentRange,
  resolveRemoteAudioCacheExtension,
  resolveRemoteAudioSourceUrl,
  resolveRemoteMediaRangeSupport,
  sanitizeRemoteRangeChunkBytes
} from '../../electron/main/audioOutputRemoteCache'

describe('audioOutputRemoteCache', () => {
  it('resolves plain and proxied remote audio URLs', () => {
    const sourceUrl = 'https://song.test/path/audio.mp3?token=1'
    const proxyUrl = `luo-media://remote?url=${encodeURIComponent(sourceUrl)}`

    expect(resolveRemoteAudioSourceUrl(sourceUrl)).toBe(sourceUrl)
    expect(resolveRemoteAudioSourceUrl(proxyUrl)).toBe(sourceUrl)
    expect(resolveRemoteAudioSourceUrl('file:///D:/Music/audio.mp3')).toBeNull()
    expect(resolveRemoteAudioSourceUrl('http://127.0.0.1/audio.mp3')).toBeNull()
  })

  it('parses valid byte ranges and rejects malformed ranges', () => {
    expect(parseContentRange('bytes 10-19/100')).toStrictEqual({
      start: 10,
      end: 19,
      totalBytes: 100
    })
    expect(parseContentRange('bytes 10-9/100')).toBeUndefined()
    expect(parseContentRange('bytes 10-100/100')).toBeUndefined()
  })

  it('detects range support from response headers', () => {
    expect(
      resolveRemoteMediaRangeSupport(
        new Response('abc', {
          status: 206,
          headers: {
            'content-range': 'bytes 0-2/3'
          }
        })
      )
    ).toBe(true)
    expect(
      resolveRemoteMediaRangeSupport(
        new Response('abc', {
          headers: {
            'accept-ranges': 'bytes'
          }
        })
      )
    ).toBe(true)
  })

  it('rejects obvious non-audio response content types', () => {
    expect(isRejectedRemoteMediaContentType('text/html; charset=utf-8')).toBe(true)
    expect(isRejectedRemoteMediaContentType('application/json')).toBe(true)
    expect(isRejectedRemoteMediaContentType('audio/mpeg')).toBe(false)
  })

  it('keeps known path extensions and infers audio content-type extensions', () => {
    expect(resolveRemoteAudioCacheExtension('https://song.test/path/file.flac', null)).toBe('.flac')
    expect(resolveRemoteAudioCacheExtension('https://song.test/stream', 'audio/opus')).toBe('.opus')
    expect(resolveRemoteAudioCacheExtension('https://song.test/stream', 'application/json')).toBe(
      '.bin'
    )
  })

  it('clamps range chunk sizes and errors when the byte limit is exceeded', async () => {
    expect(sanitizeRemoteRangeChunkBytes(undefined)).toBeGreaterThan(0)
    expect(sanitizeRemoteRangeChunkBytes(0)).toBe(1)
    expect(sanitizeRemoteRangeChunkBytes(Number.POSITIVE_INFINITY)).toBeGreaterThan(0)
    expect(sanitizeRemoteRangeChunkBytes(REMOTE_AUDIO_CACHE_MAX_BYTES + 1)).toBe(
      REMOTE_AUDIO_CACHE_MAX_BYTES
    )

    const transform = createByteLimitTransform(3)
    const error = await new Promise<unknown>(resolve => {
      transform.on('error', resolve)
      transform.write(Buffer.from('abcd'))
    })

    expect(error).toBeInstanceOf(Error)
  })
})
