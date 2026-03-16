import type { Component } from 'vue'
import { mount, type MountingOptions } from '@vue/test-utils'

export interface MockSong {
  id: number
  name: string
  artist: string
  album: string
  duration: number
  url: string
  cover: string
}

export interface MockLyrics {
  lrc: { lyric: string }
  tlyric: { lyric: string }
}

export function createMockSong(overrides: Partial<MockSong> = {}): MockSong {
  return {
    id: 123,
    name: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 180,
    url: 'http://example.com/test.mp3',
    cover: 'http://example.com/cover.jpg',
    ...overrides
  }
}

export function createMockLyrics(): MockLyrics {
  return {
    lrc: {
      lyric: `[00:00.00]歌词第一行
[00:05.00]歌词第二行
[00:10.00]歌词第三行
[00:15.00]歌词第四行`
    },
    tlyric: {
      lyric: `[00:00.00]Translation line 1
[00:05.00]Translation line 2
[00:10.00]Translation line 3
[00:15.00]Translation line 4`
    }
  }
}

export function mountComponent(component: Component, options: MountingOptions<any> = {}) {
  return mount(component, {
    global: {
      stubs: {
        'router-link': true,
        'router-view': true
      }
    },
    ...options
  })
}

export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function mockApiResponse<T>(data: T): Promise<{ data: T }> {
  return Promise.resolve({ data })
}

export function mockApiError(message = 'API Error'): Promise<never> {
  return Promise.reject(new Error(message))
}
