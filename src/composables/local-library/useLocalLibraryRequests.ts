import { ref } from 'vue'

import type {
  LocalLibraryMutationRunner,
  LocalLibraryPageRunner,
  LocalLibraryRequestRunner
} from './types'

export function useLocalLibraryRequests() {
  const loading = ref(false)
  const pageLoading = ref(false)
  const mutating = ref(false)
  const activeRequestCount = ref(0)
  const activePageRequestCount = ref(0)

  function beginRequest(): void {
    activeRequestCount.value += 1
    loading.value = activeRequestCount.value > 0
  }

  function endRequest(): void {
    activeRequestCount.value = Math.max(0, activeRequestCount.value - 1)
    loading.value = activeRequestCount.value > 0
  }

  function beginPageRequest(): void {
    activePageRequestCount.value += 1
    pageLoading.value = activePageRequestCount.value > 0
  }

  function endPageRequest(): void {
    activePageRequestCount.value = Math.max(0, activePageRequestCount.value - 1)
    pageLoading.value = activePageRequestCount.value > 0
  }

  const runRequest: LocalLibraryRequestRunner = async task => {
    beginRequest()
    try {
      return await task()
    } finally {
      endRequest()
    }
  }

  const runPageRequest: LocalLibraryPageRunner = async task => {
    beginPageRequest()
    try {
      return await task()
    } finally {
      endPageRequest()
    }
  }

  const runMutation: LocalLibraryMutationRunner = async task => {
    mutating.value = true
    try {
      return await runRequest(task)
    } finally {
      mutating.value = false
    }
  }

  return {
    loading,
    mutating,
    pageLoading,
    runMutation,
    runPageRequest,
    runRequest
  }
}
