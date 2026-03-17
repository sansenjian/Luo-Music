import { defineStore } from 'pinia'

type ToastType = 'info' | 'success' | 'warning' | 'error'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastState {
  toasts: ToastItem[]
  nextId: number
}

export const useToastStore = defineStore('toast', {
  state: (): ToastState => ({
    toasts: [],
    nextId: 0
  }),
  actions: {
    show(message: string, type: ToastType = 'info', duration = 3000) {
      const id = this.nextId++
      this.toasts.push({ id, message, type })

      setTimeout(() => {
        this.remove(id)
      }, duration)
    },
    remove(id: number) {
      const index = this.toasts.findIndex(toast => toast.id === id)
      if (index > -1) {
        this.toasts.splice(index, 1)
      }
    },
    success(message: string, duration = 3000) {
      this.show(message, 'success', duration)
    },
    error(message: string, duration = 4000) {
      this.show(message, 'error', duration)
    },
    warning(message: string, duration = 3500) {
      this.show(message, 'warning', duration)
    },
    info(message: string, duration = 3000) {
      this.show(message, 'info', duration)
    }
  }
})
