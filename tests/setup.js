import { config } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { MockAudio } from './mocks/audio'
import { vi } from 'vitest'

// 模拟 Audio
vi.stubGlobal('Audio', MockAudio)
window.Audio = MockAudio

// 全局配置 Vue Test Utils
config.global.plugins = []

// 在每个测试前设置 Pinia
beforeEach(() => {
  setActivePinia(createPinia())
})
// ... rest of the file
