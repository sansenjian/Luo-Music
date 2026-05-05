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
    <div class="local-hero-topbar">
      <div class="local-chip-group" aria-label="本地资料库摘要">
        <span class="local-chip local-chip-accent">本地资料库</span>
        <span class="local-chip">{{ totalFolderLabel }}</span>
        <span class="local-chip">{{ totalTrackLabel }}</span>
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
    </div>

    <div class="local-hero-header">
      <div class="local-summary">
        <h1>本地音乐</h1>
        <p class="local-hero-caption">{{ status.message }}</p>
      </div>

      <div class="local-meta">
        <span>最近扫描 {{ lastScanLabel }}</span>
        <span v-if="isScanning">已扫描 {{ status.scannedFolders }} 个文件夹</span>
        <span v-if="isScanning">已检查 {{ status.scannedFiles }} 个文件</span>
        <span v-if="isScanning">已收录 {{ status.discoveredTracks }} 首</span>
        <span class="local-status-pill" :class="[`is-${status.phase}`]">
          {{
            isScanning ? '正在同步资料库' : status.phase === 'error' ? '扫描异常' : '资料库已就绪'
          }}
        </span>
      </div>
    </div>
  </section>
</template>
