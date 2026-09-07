import { config } from '@vue/test-utils'
import { beforeEach } from 'vitest'

import { createTestPinia, installMockAudio } from './setup.shared'

installMockAudio()

if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = () => false
}

if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = () => {}
}

beforeEach(() => {
  const pinia = createTestPinia()
  config.global.plugins = [pinia]
})
