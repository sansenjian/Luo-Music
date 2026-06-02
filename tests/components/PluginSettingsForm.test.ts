import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginSettingDefinition } from '@plugin-sdk'

import PluginSettingsForm from '@/components/settings/PluginSettingsForm.vue'

const audioOutputSettingsSchema: PluginSettingDefinition[] = [
  {
    key: 'mode',
    type: 'select',
    label: '输出模式',
    default: 'shared',
    options: [
      { value: 'shared', label: '共享模式' },
      { value: 'exclusive', label: '真独占模式' },
      { value: 'voicemeeter', label: '类独占模式（Voicemeeter）' }
    ]
  },
  {
    key: 'sharedDeviceId',
    type: 'select',
    label: 'Chromium / 回退输出设备',
    default: '',
    options: [{ value: '', label: '系统默认输出设备' }]
  },
  {
    key: 'deviceId',
    type: 'select',
    label: '原生输出设备',
    default: '',
    options: [{ value: '', label: '原生默认输出设备' }]
  },
  {
    key: 'bufferFrames',
    type: 'text',
    label: 'Buffer frames',
    default: 960
  },
  {
    key: 'fallbackToShared',
    type: 'boolean',
    label: '独占失败时回退共享模式',
    default: true
  },
  {
    key: 'diagnosticsEnabled',
    type: 'boolean',
    label: '启用诊断日志',
    default: false
  }
]

function mountForm(options: { platformId?: string; mode?: string } = {}) {
  return mount(PluginSettingsForm, {
    props: {
      platformId: options.platformId ?? 'builtin.audio-output',
      settingsSchema: audioOutputSettingsSchema,
      settingValues: {
        mode: options.mode ?? 'shared',
        sharedDeviceId: '',
        deviceId: '',
        bufferFrames: 960,
        fallbackToShared: true,
        diagnosticsEnabled: false
      },
      isSaving: false
    }
  })
}

describe('PluginSettingsForm', () => {
  it('shows Chromium fallback and native device controls in audio-output shared mode', () => {
    const wrapper = mountForm({ mode: 'shared' })

    expect(wrapper.text()).toContain('输出模式')
    expect(wrapper.text()).toContain('Chromium / 回退输出设备')
    expect(wrapper.text()).toContain('原生输出设备')
    expect(wrapper.text()).toContain('启用诊断日志')
    expect(wrapper.text()).not.toContain('Buffer frames')
    expect(wrapper.text()).not.toContain('独占失败时回退共享模式')
  })

  it('switches audio-output settings to exclusive controls immediately', async () => {
    const wrapper = mountForm({ mode: 'shared' })

    await wrapper.setProps({
      settingValues: {
        mode: 'exclusive',
        sharedDeviceId: '',
        deviceId: '',
        bufferFrames: 960,
        fallbackToShared: true,
        diagnosticsEnabled: true
      }
    })

    expect(wrapper.text()).toContain('Chromium / 回退输出设备')
    expect(wrapper.text()).toContain('原生输出设备')
    expect(wrapper.text()).toContain('Buffer frames')
    expect(wrapper.text()).toContain('独占失败时回退共享模式')
    expect(wrapper.text()).toContain('启用诊断日志')
  })

  it('does not filter generic plugin settings by mode', () => {
    const wrapper = mountForm({ platformId: 'external.plugin', mode: 'shared' })

    expect(wrapper.text()).toContain('Chromium / 回退输出设备')
    expect(wrapper.text()).toContain('原生输出设备')
    expect(wrapper.text()).toContain('独占失败时回退共享模式')
  })
})
