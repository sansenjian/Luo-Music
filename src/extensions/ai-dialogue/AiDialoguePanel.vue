<template>
  <div v-if="isOpen" class="ai-dialogue-panel" :style="panelStyle" @mousedown="startDrag">
    <div class="ai-dialogue-panel__header">
      <span>AI 助手</span>
      <div class="ai-dialogue-panel__header-actions">
        <button
          @click="showSettings = !showSettings"
          aria-label="设置"
          class="ai-dialogue-panel__icon-btn"
        >
          ⚙
        </button>
        <button @click="emit('close')" aria-label="关闭" class="ai-dialogue-panel__icon-btn">
          ×
        </button>
      </div>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="ai-dialogue-panel__settings">
      <!-- Tab 切换 -->
      <div class="ai-dialogue-panel__tabs">
        <button
          :class="['ai-dialogue-panel__tab', { active: settingsTab === 'api' }]"
          @click="settingsTab = 'api'"
        >
          API 设置
        </button>
        <button
          :class="['ai-dialogue-panel__tab', { active: settingsTab === 'jargon' }]"
          @click="settingsTab = 'jargon'"
        >
          黑话管理
        </button>
      </div>

      <!-- API 设置 -->
      <div v-if="settingsTab === 'api'" class="ai-dialogue-panel__settings-body">
        <label class="ai-dialogue-setting">
          <span>API Key</span>
          <input v-model="settings.apiKey" type="password" placeholder="sk-..." />
        </label>
        <label class="ai-dialogue-setting">
          <span>Base URL</span>
          <input v-model="settings.baseUrl" type="text" placeholder="https://api.deepseek.com/v1" />
        </label>
        <label class="ai-dialogue-setting">
          <span>Model</span>
          <input v-model="settings.model" type="text" placeholder="deepseek-chat" />
        </label>
        <button @click="saveSettings" class="ai-dialogue-panel__save-btn">保存</button>
      </div>

      <!-- 黑话管理 -->
      <JargonManager v-if="settingsTab === 'jargon'" />
    </div>

    <!-- 消息列表 -->
    <div v-show="!showSettings" class="ai-dialogue-panel__messages" ref="messagesRef">
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="ai-dialogue-message"
        :class="`ai-dialogue-message--${message.role}`"
      >
        {{ message.content }}
      </div>
      <div v-if="status === 'loading'" class="ai-dialogue-message ai-dialogue-message--loading">
        思考中...
      </div>
      <div v-if="error" class="ai-dialogue-message ai-dialogue-message--error">
        {{ error }}
      </div>
    </div>

    <!-- 输入区 -->
    <div v-show="!showSettings" class="ai-dialogue-panel__input">
      <input
        v-model="inputText"
        type="text"
        placeholder="试试说：播放下一首、音量调到 50%、播放晴天"
        @keydown.enter="send"
        :disabled="status === 'loading'"
      />
      <button @click="send" :disabled="status === 'loading' || !inputText.trim()">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, reactive, onUnmounted } from 'vue'
import type { ChatMessage, AiDialogueStatus } from './types'
import { loadConfig, saveConfig, type LlmConfig } from './llmClient'
import JargonManager from './JargonManager.vue'

const props = defineProps<{
  isOpen: boolean
  messages: ChatMessage[]
  status: AiDialogueStatus
  error: string | null
}>()

const emit = defineEmits<{
  close: []
  send: [content: string]
}>()

const inputText = ref('')
const messagesRef = ref<HTMLElement>()
const showSettings = ref(false)
const settingsTab = ref<'api' | 'jargon'>('api')
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

const settings = reactive<LlmConfig>(loadConfig())

const panelStyle = computed(() => ({
  transform: `translate(${position.value.x}px, ${position.value.y}px)`
}))

watch(
  () => props.messages,
  () => {
    nextTick(() => {
      const el = messagesRef.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
  { deep: true }
)

function startDrag(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.ai-dialogue-panel__input') || target.closest('.ai-dialogue-panel__settings'))
    return

  isDragging.value = true
  dragOffset.value = {
    x: event.clientX - position.value.x,
    y: event.clientY - position.value.y
  }

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value) return
  position.value = {
    x: event.clientX - dragOffset.value.x,
    y: event.clientY - dragOffset.value.y
  }
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 组件销毁时确保拖拽监听器被移除，防止泄漏
onUnmounted(() => {
  if (isDragging.value) {
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', stopDrag)
    isDragging.value = false
  }
})

function send() {
  const text = inputText.value.trim()
  if (!text) return
  emit('send', text)
  inputText.value = ''
}

function saveSettings() {
  saveConfig({ ...settings })
  showSettings.value = false
}
</script>

<style scoped>
.ai-dialogue-panel {
  position: fixed;
  right: 24px;
  bottom: 160px;
  width: 360px;
  height: 480px;
  background: var(--panel-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  z-index: 1001;
}

.ai-dialogue-panel__header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
}

.ai-dialogue-panel__header-actions {
  display: flex;
  gap: 4px;
}

.ai-dialogue-panel__icon-btn {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-secondary, #6b7280);
}

.ai-dialogue-panel__icon-btn:hover {
  background: var(--message-bg, #f3f4f6);
}

.ai-dialogue-panel__settings {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.ai-dialogue-panel__tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding: 0 12px;
  flex-shrink: 0;
}

.ai-dialogue-panel__tab {
  padding: 10px 14px;
  border: none;
  background: none;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.ai-dialogue-panel__tab.active {
  color: var(--primary-color, #3b82f6);
  border-bottom-color: var(--primary-color, #3b82f6);
}

.ai-dialogue-panel__settings-body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
}

.ai-dialogue-panel__settings .jargon-manager {
  padding: 12px 16px;
}

.ai-dialogue-setting {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.ai-dialogue-setting input {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  outline: none;
  font-size: 14px;
}

.ai-dialogue-panel__save-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
  margin-top: 4px;
}

.ai-dialogue-panel__messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-dialogue-message {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}

.ai-dialogue-message--user {
  align-self: flex-end;
  background: var(--primary-color, #3b82f6);
  color: white;
}

.ai-dialogue-message--assistant {
  align-self: flex-start;
  background: var(--message-bg, #f3f4f6);
}

.ai-dialogue-message--loading {
  align-self: flex-start;
  color: var(--text-secondary, #6b7280);
}

.ai-dialogue-message--error {
  align-self: flex-start;
  color: #dc2626;
  background: #fee2e2;
}

.ai-dialogue-panel__input {
  padding: 12px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  gap: 8px;
}

.ai-dialogue-panel__input input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  outline: none;
}

.ai-dialogue-panel__input button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
}
</style>
