import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// 全局配置 Vue Test Utils
config.global.plugins = []

// 在每个测试前设置 Pinia
beforeEach(() => {
  setActivePinia(createPinia())
})

// 模拟 window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// 模拟 IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback) {
    this.callback = callback
    this.elements = new Set()
  }
  disconnect() {
    this.elements.clear()
  }
  observe(element) {
    this.elements.add(element)
  }
  unobserve(element) {
    this.elements.delete(element)
  }
  trigger(entries) {
    this.callback(entries)
  }
}

// 模拟 ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(callback) {
    this.callback = callback
    this.elements = new Set()
  }
  disconnect() {
    this.elements.clear()
  }
  observe(element) {
    this.elements.add(element)
  }
  unobserve(element) {
    this.elements.delete(element)
  }
  trigger(entries) {
    this.callback(entries)
  }
}

// 模拟 PointerEvent
class MockPointerEvent extends MouseEvent {
  constructor(type, options = {}) {
    super(type, options)
    this.pointerId = options.pointerId ?? 0
    this.pointerType = options.pointerType ?? 'mouse'
    this.isPrimary = options.isPrimary ?? true
    this.pressure = options.pressure ?? 0
    this.tangentialPressure = options.tangentialPressure ?? 0
    this.tiltX = options.tiltX ?? 0
    this.tiltY = options.tiltY ?? 0
    this.twist = options.twist ?? 0
    this.width = options.width ?? 1
    this.height = options.height ?? 1
    this.altitudeAngle = options.altitudeAngle ?? 0
    this.azimuthAngle = options.azimuthAngle ?? 0
  }
}
global.PointerEvent = MockPointerEvent

// 模拟 Touch
class MockTouch {
  constructor(options = {}) {
    this.identifier = options.identifier ?? 0
    this.target = options.target ?? null
    this.clientX = options.clientX ?? 0
    this.clientY = options.clientY ?? 0
    this.screenX = options.screenX ?? 0
    this.screenY = options.screenY ?? 0
    this.pageX = options.pageX ?? 0
    this.pageY = options.pageY ?? 0
    this.radiusX = options.radiusX ?? 0
    this.radiusY = options.radiusY ?? 0
    this.rotationAngle = options.rotationAngle ?? 0
    this.force = options.force ?? 0
  }
}
global.Touch = MockTouch

// 模拟 TouchList
class MockTouchList {
  constructor(touches = []) {
    this.touches = touches
    touches.forEach((touch, index) => {
      this[index] = touch
    })
    this.length = touches.length
  }
  item(index) {
    return this.touches[index] ?? null
  }
  [Symbol.iterator]() {
    return this.touches[Symbol.iterator]()
  }
}
global.TouchList = MockTouchList

// 模拟 TouchEvent
class MockTouchEvent extends Event {
  constructor(type, options = {}) {
    super(type, options)
    this.touches = new MockTouchList(options.touches ?? [])
    this.targetTouches = new MockTouchList(options.targetTouches ?? [])
    this.changedTouches = new MockTouchList(options.changedTouches ?? [])
    this.altKey = options.altKey ?? false
    this.ctrlKey = options.ctrlKey ?? false
    this.metaKey = options.metaKey ?? false
    this.shiftKey = options.shiftKey ?? false
  }
}
global.TouchEvent = MockTouchEvent

// 模拟 requestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  return setTimeout(callback, 16)
})
global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id)
})

// 模拟 URL
global.URL = class URL {
  constructor(url, base) {
    this.href = url
    this.origin = ''
    this.protocol = 'https:'
    this.host = ''
    this.hostname = ''
    this.port = ''
    this.pathname = ''
    this.search = ''
    this.hash = ''
  }
  toString() {
    return this.href
  }
}

// 模拟 Anime.js
vi.mock('animejs', () => {
  const animeInstance = {
    play: vi.fn(),
    pause: vi.fn(),
    reverse: vi.fn(),
    seek: vi.fn(),
    restart: vi.fn(),
    finished: Promise.resolve(),
  }
  
  return {
    default: {
      __esModule: true,
      ...animeInstance,
      random: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      ticking: vi.fn(),
      running: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      restart: vi.fn(),
      reverse: vi.fn(),
      seek: vi.fn(),
    },
  }
})

// 模拟 localStorage
const localStorageMock = {
  store: {},
  clear() {
    this.store = {}
  },
  getItem(key) {
    return this.store[key] || null
  },
  setItem(key, value) {
    this.store[key] = String(value)
  },
  removeItem(key) {
    delete this.store[key]
  },
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

Object.defineProperty(window, 'sessionStorage', {
  value: { ...localStorageMock },
})

// 模拟 fetch
global.fetch = vi.fn()

// 全局辅助函数
export function resetAllMocks() {
  vi.clearAllMocks()
}

export function restoreAllMocks() {
  vi.restoreAllMocks()
}

export async function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
