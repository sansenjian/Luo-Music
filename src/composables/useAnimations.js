import { animate } from 'animejs'

/**
 * 播放器按钮点击动画
 * @param {HTMLElement} element - 按钮元素
 */
export function animateButtonClick(element) {
  if (!element) return

  animate(element, {
    scale: [1, 0.9, 1.1, 1],
    duration: 300,
    ease: 'inOutQuad'
  })
}

/**
 * 播放/暂停按钮状态切换动画
 * @param {HTMLElement} element - 按钮元素
 * @param {boolean} isPlaying - 是否正在播放
 */
export function animatePlayPause(element, isPlaying) {
  if (!element) return

  const icon = element.querySelector('svg')
  if (!icon) return

  animate(icon, {
    rotate: isPlaying ? [0, 360] : [360, 0],
    scale: [1, 1.2, 1],
    duration: 400,
    ease: 'inOutQuad'
  })
}

/**
 * 歌曲封面切换动画
 * @param {HTMLElement} element - 封面元素
 */
export function animateAlbumCover(element) {
  if (!element) return

  animate(element, {
    opacity: [0, 1],
    scale: [0.8, 1],
    duration: 500,
    ease: 'outCubic'
  })
}

/**
 * 进度条平滑过渡动画
 * @param {HTMLElement} element - 进度条元素
 * @param {number} progress - 进度值 (0-100)
 */
export function animateProgressBar(element, progress) {
  if (!element) return

  animate(element, {
    width: `${progress}%`,
    duration: 300,
    ease: 'outQuad'
  })
}

/**
 * 页面进入动画
 * @param {HTMLElement} element - 页面元素
 */
export function animatePageEnter(element) {
  if (!element) return

  animate(element, {
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 400,
    ease: 'outCubic'
  })
}

/**
 * 页面退出动画
 * @param {HTMLElement} element - 页面元素
 * @returns {Promise} 动画完成后的 Promise
 */
export function animatePageLeave(element) {
  if (!element) return Promise.resolve()

  return new Promise((resolve) => {
    animate(element, {
      opacity: [1, 0],
      translateY: [0, -20],
      duration: 300,
      ease: 'inCubic',
      complete: resolve
    })
  })
}

/**
 * 列表项进入动画（ stagger 效果）
 * @param {HTMLElement[]} elements - 列表项元素数组
 */
export function animateListItems(elements) {
  if (!elements || elements.length === 0) return

  animate(elements, {
    opacity: [0, 1],
    translateX: [-20, 0],
    delay: (_, i) => i * 50,
    duration: 400,
    ease: 'outCubic'
  })
}

/**
 * 音量图标动画
 * @param {HTMLElement} element - 音量图标元素
 * @param {number} volume - 音量值 (0-1)
 */
export function animateVolumeIcon(element, volume) {
  if (!element) return

  animate(element, {
    scale: [1, 1.3, 1],
    duration: 200,
    ease: 'inOutQuad'
  })
}

/**
 * 循环模式切换动画
 * @param {HTMLElement} element - 循环按钮元素
 */
export function animateLoopMode(element) {
  if (!element) return

  animate(element, {
    rotate: '+=360',
    scale: [1, 1.2, 1],
    duration: 500,
    ease: 'inOutQuad'
  })
}

/**
 * 使用组合式函数的方式
 * @returns {Object} 动画函数集合
 */
export function useAnimations() {
  return {
    animateButtonClick,
    animatePlayPause,
    animateAlbumCover,
    animateProgressBar,
    animatePageEnter,
    animatePageLeave,
    animateListItems,
    animateVolumeIcon,
    animateLoopMode
  }
}

export default useAnimations
