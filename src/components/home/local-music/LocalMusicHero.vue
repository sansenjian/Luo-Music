<script setup lang="ts">
import type { LocalLibraryScanStatus } from '@/types/localLibrary'

defineProps<{
  hasEnabledFolders: boolean
  isScanning: boolean
  lastScanLabel: string
  mutating: boolean
  status: LocalLibraryScanStatus
  totalFolderLabel: string
  totalTrackLabel: string
}>()

defineEmits<{
  'add-folder': []
  rescan: []
}>()
</script>

<template>
  <section class="local-hero">
    <div class="local-summary">
      <p class="local-kicker">资料库</p>
      <h1>本地音乐</h1>
      <div class="local-meta">
        <span>{{ totalFolderLabel }}</span>
        <span>{{ totalTrackLabel }}</span>
        <span>最近扫描 {{ lastScanLabel }}</span>
      </div>
      <p class="local-status" :class="[`is-${status.phase}`]">
        {{ status.message }}
      </p>
      <div v-if="isScanning" class="local-progress">
        <span>已扫描 {{ status.scannedFolders }} 个文件夹</span>
        <span>已检查 {{ status.scannedFiles }} 个文件</span>
        <span>已收录 {{ status.discoveredTracks }} 首</span>
      </div>
    </div>

    <div class="local-actions">
      <button
        type="button"
        class="hero-action hero-action-primary"
        :disabled="mutating"
        @click="$emit('add-folder')"
      >
        添加文件夹
      </button>
      <button
        type="button"
        class="hero-action"
        :disabled="mutating || !hasEnabledFolders"
        @click="$emit('rescan')"
      >
        {{ isScanning ? '扫描中...' : '重新扫描' }}
      </button>
    </div>
  </section>
</template>
