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
import { animate } from 'animejs'

function onBeforeEnter(el) {
  el.style.opacity = 0
}

function onEnter(el, done) {
  animate(el, {
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 400,
    ease: 'out(3)',
    complete: done
  })
}

function onLeave(el, done) {
  animate(el, {
    opacity: [1, 0],
    translateY: [0, -20],
    duration: 300,
    ease: 'in(3)',
    complete: done
  })
}
</script>

<style scoped>
/* Transition classes are handled by Anime.js */
</style>
