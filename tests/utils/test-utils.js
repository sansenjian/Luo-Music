import { mount } from '@vue/test-utils'

// 创建测试用的歌曲数据
export function createMockSong(overrides = {}) {
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

// 创建测试用的歌词数据
export function createMockLyrics() {
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

// 挂载组件的辅助函数
export function mountComponent(component, options = {}) {
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

// 等待指定时间
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 模拟 API 响应
export function mockApiResponse(data) {
  return Promise.resolve({ data })
}

// 模拟 API 错误
export function mockApiError(message = 'API Error') {
  return Promise.reject(new Error(message))
}
