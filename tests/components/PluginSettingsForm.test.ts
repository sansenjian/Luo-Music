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
    key: 'bitPerfectRequired',
    type: 'boolean',
    label: '强制 bit-perfect 候选输出',
    default: false
  },
  {
    key: 'dspEnabled',
    type: 'boolean',
    label: '启用 DSP 处理',
    default: false
  },
  {
    key: 'dspHeadroomDb',
    type: 'text',
    label: 'DSP headroom (dB)',
    default: 0
  },
  {
    key: 'voicemeeterBus',
    type: 'select',
    label: 'VoiceMeeter bus',
    default: 'A1',
    options: [
      { value: 'A1', label: 'A1' },
      { value: 'B1', label: 'B1' }
    ]
  },
  {
    key: 'voicemeeterHardwareOutBus',
    type: 'select',
    label: 'VoiceMeeter HARDWARE OUT',
    default: 'A1',
    options: [
      { value: 'A1', label: 'A1' },
      { value: 'A2', label: 'A2' }
    ]
  },
  {
    key: 'voicemeeterHardwareOutDriver',
    type: 'select',
    label: 'HARDWARE OUT 驱动',
    default: 'wdm',
    options: [
      { value: 'wdm', label: 'WDM' },
      { value: 'ks', label: 'KS' }
    ]
  },
  {
    key: 'voicemeeterHardwareOutDevice',
    type: 'text',
    label: 'HARDWARE OUT 设备名',
    default: ''
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
        bitPerfectRequired: false,
        dspEnabled: false,
        dspHeadroomDb: 0,
        voicemeeterBus: 'A1',
        voicemeeterHardwareOutBus: 'A1',
        voicemeeterHardwareOutDriver: 'wdm',
        voicemeeterHardwareOutDevice: '',
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
    expect(wrapper.text()).not.toContain('强制 bit-perfect 候选输出')
    expect(wrapper.text()).not.toContain('VoiceMeeter bus')
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
        bitPerfectRequired: true,
        dspEnabled: true,
        dspHeadroomDb: -3,
        voicemeeterBus: 'A1',
        voicemeeterHardwareOutBus: 'A1',
        voicemeeterHardwareOutDriver: 'wdm',
        voicemeeterHardwareOutDevice: '',
        diagnosticsEnabled: true
      }
    })

    expect(wrapper.text()).toContain('Chromium / 回退输出设备')
    expect(wrapper.text()).toContain('原生输出设备')
    expect(wrapper.text()).toContain('Buffer frames')
    expect(wrapper.text()).toContain('独占失败时回退共享模式')
    expect(wrapper.text()).toContain('强制 bit-perfect 候选输出')
    expect(wrapper.text()).toContain('启用诊断日志')
    expect(wrapper.text()).not.toContain('启用 DSP 处理')
    expect(wrapper.text()).not.toContain('DSP headroom (dB)')
    expect(wrapper.text()).not.toContain('VoiceMeeter bus')
    expect(wrapper.text()).not.toContain('VoiceMeeter HARDWARE OUT')
    expect(wrapper.text()).not.toContain('HARDWARE OUT 驱动')
    expect(wrapper.text()).not.toContain('HARDWARE OUT 设备名')
  })

  it('shows Voicemeeter route and hardware out controls without exclusive-only options', () => {
    const wrapper = mountForm({ mode: 'voicemeeter' })

    expect(wrapper.text()).toContain('Chromium / 回退输出设备')
    expect(wrapper.text()).toContain('原生输出设备')
    expect(wrapper.text()).toContain('VoiceMeeter bus')
    expect(wrapper.text()).toContain('VoiceMeeter HARDWARE OUT')
    expect(wrapper.text()).toContain('HARDWARE OUT 驱动')
    expect(wrapper.text()).toContain('HARDWARE OUT 设备名')
    expect(wrapper.text()).toContain('启用诊断日志')
    expect(wrapper.text()).toContain('启用 DSP 处理')
    expect(wrapper.text()).not.toContain('Buffer frames')
    expect(wrapper.text()).not.toContain('独占失败时回退共享模式')
    expect(wrapper.text()).not.toContain('强制 bit-perfect 候选输出')
  })

  it('does not filter generic plugin settings by mode', () => {
    const wrapper = mountForm({ platformId: 'external.plugin', mode: 'shared' })

    expect(wrapper.text()).toContain('Chromium / 回退输出设备')
    expect(wrapper.text()).toContain('原生输出设备')
    expect(wrapper.text()).toContain('独占失败时回退共享模式')
    expect(wrapper.text()).toContain('强制 bit-perfect 候选输出')
  })

  it('shows audio-output DSP headroom only when DSP is enabled', async () => {
    const wrapper = mountForm({ mode: 'shared' })

    expect(wrapper.text()).toContain('启用 DSP 处理')
    expect(wrapper.text()).not.toContain('DSP headroom (dB)')

    await wrapper.setProps({
      settingValues: {
        mode: 'shared',
        sharedDeviceId: '',
        deviceId: '',
        bufferFrames: 960,
        fallbackToShared: true,
        bitPerfectRequired: false,
        dspEnabled: true,
        dspHeadroomDb: -3,
        voicemeeterBus: 'A1',
        voicemeeterHardwareOutBus: 'A1',
        voicemeeterHardwareOutDriver: 'wdm',
        voicemeeterHardwareOutDevice: '',
        diagnosticsEnabled: false
      }
    })

    expect(wrapper.text()).toContain('DSP headroom (dB)')
  })
})
