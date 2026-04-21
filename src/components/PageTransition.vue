<template>
  <Transition @before-enter="onBeforeEnter" @enter="onEnter" @leave="onLeave" mode="out-in">
    <slot />
  </Transition>
</template>

<script setup lang="ts">
import { animate } from 'animejs'

function onBeforeEnter(el: Element): void {
  ;(el as HTMLElement).style.opacity = '0'
}

function onEnter(el: Element, done: () => void): void {
  animate(el, {
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 400,
    ease: 'out(3)',
    onComplete: done
  })
}

function onLeave(el: Element, done: () => void): void {
  animate(el, {
    opacity: [1, 0],
    translateY: [0, -20],
    duration: 300,
    ease: 'in(3)',
    onComplete: done
  })
}
</script>

<style scoped>
/* Transition classes are handled by Anime.js */
</style>
