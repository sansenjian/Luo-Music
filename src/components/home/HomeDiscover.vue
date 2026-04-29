<script setup lang="ts">
import { uiMessages } from '@/messages/ui'

import HomeContentSkeleton from './HomeContentSkeleton.vue'
</script>

<template>
  <HomeContentSkeleton
    :title="uiMessages.home.discover.title"
    :description="uiMessages.home.discover.description"
    :card-count="6"
  />
</template>
