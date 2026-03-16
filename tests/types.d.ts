/// <reference types="vitest/globals" />

// Vue component type declarations for tests
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

// Mock global functions for tests
declare global {
  // Web Animations API mock for tests
  function animate(
    element: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions
  ): Animation
}
