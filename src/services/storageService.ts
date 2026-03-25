export type StorageService = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  getJSON<T>(key: string): T | null
  setJSON<T>(key: string, value: T): void
}

type StorageLike = Pick<Storage, 'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'> & {
  readonly length: number
}

function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>()

  return {
    get length(): number {
      return data.size
    },
    clear(): void {
      data.clear()
    },
    getItem(key: string): string | null {
      return data.get(key) ?? null
    },
    key(index: number): string | null {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string): void {
      data.delete(key)
    },
    setItem(key: string, value: string): void {
      data.set(key, value)
    }
  }
}

const memoryStorage = createMemoryStorage()

function getStorage(): StorageLike {
  if (typeof window === 'undefined') {
    return memoryStorage
  }

  try {
    return window.localStorage
  } catch {
    return memoryStorage
  }
}

export const storageAdapter: StorageLike = {
  get length(): number {
    return getStorage().length
  },
  clear(): void {
    getStorage().clear()
  },
  getItem(key: string): string | null {
    return getStorage().getItem(key)
  },
  key(index: number): string | null {
    return getStorage().key(index)
  },
  removeItem(key: string): void {
    getStorage().removeItem(key)
  },
  setItem(key: string, value: string): void {
    getStorage().setItem(key, value)
  }
}

export function createStorageService(): StorageService {
  return {
    getItem(key: string): string | null {
      return storageAdapter.getItem(key)
    },

    setItem(key: string, value: string): void {
      storageAdapter.setItem(key, value)
    },

    removeItem(key: string): void {
      storageAdapter.removeItem(key)
    },

    getJSON<T>(key: string): T | null {
      const value = storageAdapter.getItem(key)
      if (!value) {
        return null
      }

      try {
        return JSON.parse(value) as T
      } catch {
        return null
      }
    },

    setJSON<T>(key: string, value: T): void {
      storageAdapter.setItem(key, JSON.stringify(value))
    }
  }
}
