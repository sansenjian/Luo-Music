import { ref } from 'vue'
import { useAiDialogue } from './useAiDialogue'
import AiDialogueButton from './AiDialogueButton.vue'
import AiDialoguePanel from './AiDialoguePanel.vue'

export function useAiDialogueExtension() {
  const { messages, status, error, isElectron, sendMessage, clearMessages } = useAiDialogue()
  const isOpen = ref(false)

  function toggle() {
    isOpen.value = !isOpen.value
    if (!isOpen.value) {
      clearMessages()
    }
  }

  function close() {
    isOpen.value = false
  }

  async function send(content: string) {
    await sendMessage(content)
  }

  return {
    isOpen,
    isElectron,
    messages,
    status,
    error,
    toggle,
    close,
    send
  }
}

export { AiDialogueButton, AiDialoguePanel }
