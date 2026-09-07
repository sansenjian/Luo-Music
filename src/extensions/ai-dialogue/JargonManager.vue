<template>
  <div class="jargon-manager">
    <!-- 统计 -->
    <div class="jargon-manager__stats">
      <span>共 {{ stats.total }}</span>
      <span class="jargon-manager__stat--confirmed">已确认 {{ stats.confirmed }}</span>
      <span class="jargon-manager__stat--pending">待判定 {{ stats.pending }}</span>
    </div>

    <!-- 说明 -->
    <div class="jargon-manager__hint">
      和 AI 聊天时会自动学习你的用语习惯。多次出现的词会自动推断含义。
    </div>

    <!-- 手动添加 -->
    <div class="jargon-manager__add">
      <input
        v-model="addForm.content"
        type="text"
        placeholder="黑话词条（如：周董）"
        class="jargon-manager__input"
        @keydown.enter="handleAdd"
      />
      <input
        v-model="addForm.meaning"
        type="text"
        placeholder="含义（如：指周杰伦）"
        class="jargon-manager__input"
        @keydown.enter="handleAdd"
      />
      <button class="jargon-manager__add-btn" @click="handleAdd">添加</button>
    </div>

    <!-- 列表 -->
    <div class="jargon-manager__list">
      <div v-if="sortedJargons.length === 0" class="jargon-manager__empty">
        还没有黑话记录。开始和 AI 聊天吧！
      </div>
      <div v-for="item in sortedJargons" :key="item.id" class="jargon-manager__item">
        <div class="jargon-manager__item-header">
          <span class="jargon-manager__item-content">{{ item.content }}</span>
          <span class="jargon-manager__item-badge" :class="badgeClass(item)">
            {{ badgeText(item) }}
          </span>
          <span class="jargon-manager__item-count">×{{ item.count }}</span>
          <button class="jargon-manager__delete-btn" @click="removeJargon(item.id)" title="删除">
            ×
          </button>
        </div>

        <!-- 含义 -->
        <div v-if="item.meaning" class="jargon-manager__item-meaning">
          {{ item.meaning }}
        </div>
        <div v-else class="jargon-manager__item-meaning jargon-manager__item-meaning--empty">
          含义待推断...
        </div>

        <!-- 上下文 -->
        <details v-if="item.context.length > 0" class="jargon-manager__item-context">
          <summary>上下文 ({{ item.context.length }})</summary>
          <div v-for="(ctx, i) in item.context" :key="i" class="jargon-manager__context-line">
            "{{ ctx }}"
          </div>
        </details>

        <!-- 编辑含义 -->
        <div v-if="editingId === item.id" class="jargon-manager__item-edit">
          <input
            v-model="editText"
            class="jargon-manager__input"
            @keydown.enter="saveEdit(item.id)"
            @keydown.escape="cancelEdit"
          />
          <button class="jargon-manager__edit-save" @click="saveEdit(item.id)">保存</button>
          <button class="jargon-manager__edit-cancel" @click="cancelEdit">取消</button>
        </div>
        <button v-else class="jargon-manager__edit-btn" @click="startEdit(item.id, item.meaning)">
          编辑含义
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useJargonStore, type JargonEntry } from './jargonStore'

const { jargons, upsertJargon, setMeaning, removeJargon, getStats } = useJargonStore()

const addForm = reactive({ content: '', meaning: '' })
const editingId = ref<string | null>(null)
const editText = ref('')

const stats = computed(() => getStats())

const sortedJargons = computed(() => [...jargons.value].sort((a, b) => b.count - a.count))

function badgeClass(item: JargonEntry): string {
  if (item.isJargon === true) return 'jargon-manager__badge--confirmed'
  if (item.isJargon === false) return 'jargon-manager__badge--rejected'
  return 'jargon-manager__badge--pending'
}

function badgeText(item: JargonEntry): string {
  if (item.isJargon === true) return '已确认'
  if (item.isJargon === false) return '非黑话'
  return '待判定'
}

function handleAdd() {
  const content = addForm.content.trim()
  if (!content) return
  const meaning = addForm.meaning.trim()
  // 手动添加时如果有含义就直接确认
  const entry = upsertJargon(content, '手动添加')
  if (meaning) {
    setMeaning(entry.id, meaning)
  }
  addForm.content = ''
  addForm.meaning = ''
}

function startEdit(id: string, currentMeaning: string) {
  editingId.value = id
  editText.value = currentMeaning
}

function cancelEdit() {
  editingId.value = null
  editText.value = ''
}

function saveEdit(id: string) {
  const meaning = editText.value.trim()
  if (meaning) {
    setMeaning(id, meaning)
  }
  editingId.value = null
  editText.value = ''
}
</script>

<style scoped>
.jargon-manager {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.jargon-manager__stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.jargon-manager__stat--confirmed {
  color: #16a34a;
}

.jargon-manager__stat--pending {
  color: #d97706;
}

.jargon-manager__hint {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  line-height: 1.4;
}

.jargon-manager__add {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.jargon-manager__input {
  flex: 1;
  min-width: 0;
  padding: 5px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

.jargon-manager__input:focus {
  border-color: var(--primary-color, #3b82f6);
}

.jargon-manager__add-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: var(--primary-color, #3b82f6);
  color: white;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.jargon-manager__add-btn:hover {
  opacity: 0.9;
}

.jargon-manager__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}

.jargon-manager__empty {
  text-align: center;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
  padding: 24px 0;
}

.jargon-manager__item {
  padding: 8px 10px;
  background: var(--message-bg, #f9fafb);
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.jargon-manager__item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jargon-manager__item-content {
  font-weight: 600;
  color: var(--primary-color, #3b82f6);
  flex-shrink: 0;
}

.jargon-manager__item-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.jargon-manager__badge--confirmed {
  background: #dcfce7;
  color: #16a34a;
}

.jargon-manager__badge--rejected {
  background: #fee2e2;
  color: #dc2626;
}

.jargon-manager__badge--pending {
  background: #fef3c7;
  color: #d97706;
}

.jargon-manager__item-count {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  flex-shrink: 0;
}

.jargon-manager__delete-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-secondary, #9ca3af);
  font-size: 16px;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
}

.jargon-manager__delete-btn:hover {
  color: #dc2626;
}

.jargon-manager__item-meaning {
  font-size: 12px;
  color: var(--text-primary, #374151);
  line-height: 1.4;
}

.jargon-manager__item-meaning--empty {
  color: var(--text-secondary, #9ca3af);
  font-style: italic;
}

.jargon-manager__item-context {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
}

.jargon-manager__item-context summary {
  cursor: pointer;
  user-select: none;
}

.jargon-manager__context-line {
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--border-color, #e5e7eb);
  margin-top: 2px;
}

.jargon-manager__item-edit {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 2px;
}

.jargon-manager__edit-btn {
  align-self: flex-start;
  background: none;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}

.jargon-manager__edit-btn:hover {
  border-color: var(--primary-color, #3b82f6);
  color: var(--primary-color, #3b82f6);
}

.jargon-manager__edit-save {
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
  white-space: nowrap;
}

.jargon-manager__edit-cancel {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  background: none;
  cursor: pointer;
  white-space: nowrap;
}
</style>
