<script setup lang="ts">
import { uiMessages } from '@/messages/ui'

import HomeContentSkeleton from './HomeContentSkeleton.vue'
</script>

<template>
  <HomeContentSkeleton
    :title="uiMessages.home.roaming.title"
    :description="uiMessages.home.roaming.description"
    :card-count="4"
  />
</template>
