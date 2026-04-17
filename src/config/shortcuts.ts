import type { ShortcutConfig } from './shortcuts.d'

// 定义快捷键配置
// keys: Web/Renderer 进程使用的键码 (KeyboardEvent.key/code)
// globalKeys: Electron 主进程使用的 Accelerator 字符串
// modifiers: Web 端需要的修饰键 ['ctrl', 'meta', 'alt', 'shift']
// action: 对应的动作标识

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    id: 'playPause',
    name: '播放/暂停',
    keys: ['Space'],
    globalKeys: ['MediaPlayPause'],
    action: 'togglePlay'
  },
  {
    id: 'prevTrack',
    name: '上一首',
    keys: ['ArrowLeft'],
    modifiers: ['ctrlOrMeta'], // 特殊标识，处理跨平台
    globalKeys: ['MediaPreviousTrack'],
    action: 'playPrev'
  },
  {
    id: 'nextTrack',
    name: '下一首',
    keys: ['ArrowRight'],
    modifiers: ['ctrlOrMeta'],
    globalKeys: ['MediaNextTrack'],
    action: 'playNext'
  },
  {
    id: 'volumeUp',
    name: '增加音量',
    keys: ['ArrowUp'],
    globalKeys: ['CommandOrControl+Up'],
    action: 'volumeUp'
  },
  {
    id: 'volumeDown',
    name: '减少音量',
    keys: ['ArrowDown'],
    globalKeys: ['CommandOrControl+Down'],
    action: 'volumeDown'
  },
  {
    id: 'seekForward',
    name: '快进',
    keys: ['ArrowRight'],
    // 无修饰键时触发
    globalKeys: ['CommandOrControl+Right'], // Electron 对应
    action: 'seekForward'
  },
  {
    id: 'seekBack',
    name: '快退',
    keys: ['ArrowLeft'],
    // 无修饰键时触发
    globalKeys: ['CommandOrControl+Left'], // Electron 对应
    action: 'seekBack'
  },
  {
    id: 'playerDocked',
    name: '切换底栏播放器',
    keys: ['Tab'],
    globalKeys: [], // Tab 不注册为全局
    action: 'togglePlayerDocked'
  }
]
