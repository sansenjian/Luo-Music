import { beforeEach } from 'vite-plus/test'

import { createTestPinia, installMockAudio } from './setup.shared'

installMockAudio()

beforeEach(() => {
  createTestPinia()
})
