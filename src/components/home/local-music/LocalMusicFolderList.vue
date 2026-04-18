<script setup lang="ts">
import type { LocalLibraryFolder } from '@/types/localLibrary'

defineProps<{
  folders: LocalLibraryFolder[]
  mutating: boolean
  totalFolderLabel: string
}>()

defineEmits<{
  'remove-folder': [folderId: string]
  'toggle-folder': [folder: LocalLibraryFolder]
}>()
</script>

<template>
  <section class="local-folders">
    <div class="local-section-header">
      <h2>已加入的文件夹</h2>
      <span>{{ totalFolderLabel }}</span>
    </div>
    <div class="folder-chip-list">
      <article v-for="folder in folders" :key="folder.id" class="folder-chip">
        <div class="folder-chip-copy">
          <strong>{{ folder.name }}</strong>
          <span>{{ folder.songCount }} 首 · {{ folder.path }}</span>
        </div>
        <div class="folder-chip-actions">
          <button
            type="button"
            class="folder-chip-action"
            :disabled="mutating"
            @click="$emit('toggle-folder', folder)"
          >
            {{ folder.enabled ? '停用' : '启用' }}
          </button>
          <button
            type="button"
            class="folder-chip-action danger"
            :disabled="mutating"
            @click="$emit('remove-folder', folder.id)"
          >
            移除
          </button>
        </div>
      </article>
    </div>
  </section>
</template>
