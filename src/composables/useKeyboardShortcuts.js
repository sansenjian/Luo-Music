
import { onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../store/playerStore.ts'
import { DEFAULT_SHORTCUTS } from '../config/shortcuts'

export function useKeyboardShortcuts() {
  const playerStore = usePlayerStore()

  // 动作映射表
  const actions = {
    togglePlay: () => playerStore.togglePlay(),
    playPrev: () => playerStore.playPrev(),
    playNext: () => playerStore.playNext(),
    volumeUp: () => playerStore.setVolume(Math.min(1, playerStore.volume + 0.1)),
    volumeDown: () => playerStore.setVolume(Math.max(0, playerStore.volume - 0.1)),
    seekForward: () => playerStore.seek(Math.min(playerStore.duration, playerStore.progress + 5)),
    seekBack: () => playerStore.seek(Math.max(0, playerStore.progress - 5)),
    toggleCompact: () => playerStore.toggleCompactMode()
  }

  function handleKeydown(e) {
    // 忽略输入框
    const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable
    if (isInput) {
      if (e.key === 'Escape') e.target.blur()
      return
    }

    // 遍历配置匹配快捷键
    for (const shortcut of DEFAULT_SHORTCUTS) {
      if (!shortcut.keys.includes(e.key) && !shortcut.keys.includes(e.code)) continue

      // 检查修饰键
      const needsCtrlOrMeta = shortcut.modifiers?.includes('ctrlOrMeta')
      const hasCtrlOrMeta = e.ctrlKey || e.metaKey

      // 1. 如果需要修饰键，但没有按下 -> 不匹配
      if (needsCtrlOrMeta && !hasCtrlOrMeta) continue
      
      // 2. 如果不需要修饰键，但按下了 -> 只有在没有其他冲突配置时才匹配
      // (例如 ArrowRight 用于 seek，Ctrl+ArrowRight 用于 next)
      // 这里的简单逻辑：如果有修饰键但配置不需要 -> 跳过 (除非是 seekForward/Back 这种特殊情况)
      // 我们简化逻辑：精确匹配修饰键状态
      if (!needsCtrlOrMeta && hasCtrlOrMeta) continue

      e.preventDefault()
      actions[shortcut.action]?.()
      return // 匹配一个后立即返回
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
