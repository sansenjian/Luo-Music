<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

import { usePlayerStore } from '@/store/playerStore'
import { playerCore } from '@/utils/player/core/playerCore'

const props = defineProps<{
  active?: boolean
}>()

const playerStore = usePlayerStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const MAX_FPS = 30
const MIN_BAR_WIDTH = 3
const MAX_BAR_COUNT = 180
const MIN_BAR_COUNT = 32
const BASELINE_HEIGHT = 1.5

let rafId: number | null = null
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let dataArray: Uint8Array | null = null
let barAmplitudes = new Float32Array(0)
let smoothedAmplitudes = new Float32Array(0)
let lastPaintTime = 0
let isVisible = false

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveContext(): CanvasRenderingContext2D | null {
  return canvasRef.value?.getContext('2d') ?? null
}

function syncCanvasSize(): { width: number; height: number } | null {
  const canvas = canvasRef.value
  const context = resolveContext()
  if (!canvas || !context) {
    return null
  }

  const rect = canvas.getBoundingClientRect()
  const nextWidth = Math.max(1, Math.round(rect.width))
  const nextHeight = Math.max(1, Math.round(rect.height))
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  const backingWidth = Math.max(1, Math.round(nextWidth * dpr))
  const backingHeight = Math.max(1, Math.round(nextHeight * dpr))

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth
    canvas.height = backingHeight
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.imageSmoothingEnabled = true

  return { width: nextWidth, height: nextHeight }
}

function ensureDataArray(): Uint8Array | null {
  const binCount = playerCore.frequencyBinCount
  if (binCount <= 0) {
    return null
  }

  if (!dataArray || dataArray.length !== binCount) {
    dataArray = new Uint8Array(binCount)
  }

  return dataArray
}

function ensureAmplitudeBuffers(barCount: number): void {
  if (barAmplitudes.length === barCount) {
    return
  }

  barAmplitudes = new Float32Array(barCount)
  smoothedAmplitudes = new Float32Array(barCount)
}

function drawRoundedBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (typeof context.roundRect === 'function') {
    context.beginPath()
    context.roundRect(x, y, width, height, Math.min(width / 2, height / 2, 3))
    context.fill()
    return
  }

  context.fillRect(x, y, width, height)
}

function sampleWaveform(rawData: Uint8Array, barCount: number): void {
  ensureAmplitudeBuffers(barCount)

  const step = Math.max(1, Math.floor(rawData.length / barCount))

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    let amplitudeSum = 0
    const start = barIndex * step
    const end = Math.min(rawData.length, start + step)

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      amplitudeSum += Math.abs(rawData[sampleIndex] - 128) / 128
    }

    const sampleCount = Math.max(1, end - start)
    const targetAmplitude = clamp((amplitudeSum / sampleCount) * 1.8, 0.035, 0.98)
    const previousAmplitude = barAmplitudes[barIndex] ?? 0

    barAmplitudes[barIndex] =
      targetAmplitude > previousAmplitude
        ? previousAmplitude * 0.4 + targetAmplitude * 0.6
        : previousAmplitude * 0.84 + targetAmplitude * 0.16
  }

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const left = barAmplitudes[Math.max(0, barIndex - 1)] ?? barAmplitudes[barIndex]
    const current = barAmplitudes[barIndex]
    const right = barAmplitudes[Math.min(barCount - 1, barIndex + 1)] ?? barAmplitudes[barIndex]

    smoothedAmplitudes[barIndex] = (left + current * 2 + right) / 4
  }
}

function decayWaveform(): void {
  for (let barIndex = 0; barIndex < barAmplitudes.length; barIndex += 1) {
    barAmplitudes[barIndex] *= 0.92
    smoothedAmplitudes[barIndex] = Math.max(0.02, barAmplitudes[barIndex] * 0.72)
  }
}

function drawBaseline(
  context: CanvasRenderingContext2D,
  width: number,
  centerY: number,
  progressRatio: number
): void {
  const progressWidth = width * progressRatio

  context.fillStyle = 'rgba(15, 23, 42, 0.08)'
  context.fillRect(0, centerY - BASELINE_HEIGHT / 2, width, BASELINE_HEIGHT)

  if (progressWidth <= 0) {
    return
  }

  context.fillStyle = 'rgba(249, 115, 22, 0.34)'
  context.fillRect(0, centerY - BASELINE_HEIGHT / 2, progressWidth, BASELINE_HEIGHT)
}

function drawBars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progressRatio: number,
  emphasize: boolean
): void {
  const barCount = smoothedAmplitudes.length
  if (barCount <= 0) {
    return
  }

  const gap = width < 480 ? 2 : 3
  const availableWidth = Math.max(width - gap * (barCount - 1), barCount * MIN_BAR_WIDTH)
  const barWidth = Math.max(MIN_BAR_WIDTH, availableWidth / barCount)
  const centerY = height / 2
  const maxBarHeight = height * 0.74
  const progressWidth = width * progressRatio

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const amplitude = smoothedAmplitudes[barIndex]
    const barHeight = Math.max(2, amplitude * maxBarHeight)
    const x = barIndex * (barWidth + gap)
    const y = centerY - barHeight / 2
    const isPlayed = x + barWidth <= progressWidth

    if (isPlayed) {
      context.fillStyle = emphasize ? 'rgba(249, 115, 22, 0.92)' : 'rgba(249, 115, 22, 0.4)'
    } else {
      context.fillStyle = emphasize ? 'rgba(15, 23, 42, 0.16)' : 'rgba(15, 23, 42, 0.1)'
    }

    drawRoundedBar(context, x, y, barWidth, barHeight)
  }
}

function paintWaveformFrame(forceIdle = false): void {
  const context = resolveContext()
  const size = syncCanvasSize()
  if (!context || !size) {
    return
  }

  const { width, height } = size
  const progressRatio =
    playerStore.duration > 0 ? clamp(playerStore.progress / playerStore.duration, 0, 1) : 0

  context.clearRect(0, 0, width, height)
  drawBaseline(context, width, height / 2, progressRatio)

  const buffer = ensureDataArray()
  const rawData = !forceIdle && buffer ? playerCore.getWaveformData(buffer) : null

  if (!rawData) {
    decayWaveform()
    drawBars(context, width, height, progressRatio, false)
    return
  }

  const barCount = clamp(Math.floor(width / 6), MIN_BAR_COUNT, MAX_BAR_COUNT)
  sampleWaveform(rawData, barCount)
  drawBars(context, width, height, progressRatio, true)
}

function stopLoop(drawIdle = true): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }

  if (drawIdle) {
    paintWaveformFrame(true)
  }
}

function startLoop(): void {
  if (rafId !== null) {
    return
  }

  const tick = (timestamp: number) => {
    if (!isVisible || props.active === false || !playerStore.playing) {
      rafId = null
      paintWaveformFrame(true)
      return
    }

    if (timestamp - lastPaintTime >= 1000 / MAX_FPS) {
      lastPaintTime = timestamp
      paintWaveformFrame()
    }

    rafId = requestAnimationFrame(tick)
  }

  rafId = requestAnimationFrame(tick)
}

function bindObservers(): void {
  const canvas = canvasRef.value
  if (!canvas) {
    return
  }

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      paintWaveformFrame(!playerStore.playing)
    })
    resizeObserver.observe(canvas)
  }

  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(entries => {
      isVisible = entries[0]?.isIntersecting ?? false
      if (isVisible && playerStore.playing && props.active !== false) {
        startLoop()
        return
      }

      stopLoop(false)
    })

    intersectionObserver.observe(canvas)
    return
  }

  isVisible = true
}

watch(
  () => [playerStore.playing, props.active],
  ([playing, active]) => {
    if (playing && active !== false && isVisible) {
      startLoop()
      return
    }

    stopLoop(true)
  }
)

watch(
  () => [playerStore.progress, playerStore.duration],
  () => {
    if (!playerStore.playing) {
      paintWaveformFrame(true)
    }
  }
)

onMounted(() => {
  bindObservers()
  paintWaveformFrame(true)

  if (playerStore.playing && props.active !== false) {
    startLoop()
  }
})

onUnmounted(() => {
  stopLoop(false)
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  resizeObserver = null
  intersectionObserver = null
})
</script>

<template>
  <canvas ref="canvasRef" class="progress-waveform" width="960" height="30" />
</template>

<style scoped>
.progress-waveform {
  width: 100%;
  height: 30px;
  display: block;
  pointer-events: none;
}
</style>
