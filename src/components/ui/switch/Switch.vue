<script setup lang="ts">
import { type HTMLAttributes, computed } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'

import { cn } from '@/lib/utils'

interface Props {
  id?: string
  class?: HTMLAttributes['class']
  disabled?: boolean
}

const props = defineProps<Props>()

const modelValue = defineModel<boolean>({ required: true })

const delegatedProps = computed(() => {
  const { class: _, ...otherProps } = props
  return otherProps
})
</script>

<template>
  <SwitchRoot
    v-bind="delegatedProps"
    v-model="modelValue"
    :class="
      cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class
      )
    "
  >
    <SwitchThumb
      :class="
        cn(
          'pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
        )
      "
    />
  </SwitchRoot>
</template>
