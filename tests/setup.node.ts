import { beforeEach } from 'vitest'

import { createTestPinia, installMockAudio } from './setup.shared'

installMockAudio()

beforeEach(() => {
  createTestPinia()
})
