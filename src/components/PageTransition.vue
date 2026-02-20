<template>
  <Transition
    @before-enter="onBeforeEnter"
    @enter="onEnter"
    @leave="onLeave"
    mode="out-in"
  >
    <slot />
  </Transition>
</template>

<script setup>
import { animatePageEnter, animatePageLeave } from '../composables/useAnimations.js'

function onBeforeEnter(el) {
  el.style.opacity = 0
}

function onEnter(el, done) {
  animatePageEnter(el)
  setTimeout(done, 400)
}

function onLeave(el, done) {
  animatePageLeave(el).then(done)
}
</script>

<style scoped>
/* Transition classes are handled by Anime.js */
</style>
