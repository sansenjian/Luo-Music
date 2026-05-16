<script setup lang="ts">
import { uiMessages } from '@/messages/ui'

import HomeContentSkeleton from './HomeContentSkeleton.vue'
</script>

<template>
  <HomeContentSkeleton
    :title="uiMessages.home.overview.title"
    :description="uiMessages.home.overview.description"
    :card-count="8"
  />
</template>
