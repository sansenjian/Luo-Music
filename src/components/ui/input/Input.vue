<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'

import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
  disabled?: boolean
  id?: string
  placeholder?: string
  type?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text'
})

const modelValue = defineModel<string>()

const delegatedProps = computed(() => {
  const { class: _, ...otherProps } = props
  return otherProps
})
</script>

<template>
  <input
    v-bind="delegatedProps"
    v-model="modelValue"
    :class="
      cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  />
</template>
