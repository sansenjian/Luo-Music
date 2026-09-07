<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

import { cn } from '@/lib/utils'

interface Props {
  class?: HTMLAttributes['class']
  disabled?: boolean
  min?: number
  max?: number
  step?: number
}

const props = defineProps<Props>()

const modelValue = defineModel<number[]>({ required: true })

const delegatedProps = computed(() => {
  const { class: _, ...otherProps } = props
  return otherProps
})
</script>

<template>
  <SliderRoot
    v-bind="delegatedProps"
    v-model="modelValue"
    :class="
      cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
        props.class
      )
    "
  >
    <SliderTrack class="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <SliderThumb
      class="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
