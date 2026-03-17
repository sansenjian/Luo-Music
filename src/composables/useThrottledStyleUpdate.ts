import { watch, type Ref } from 'vue'

interface UseThrottledStyleUpdateOptions {
  /** 监听的数据源 */
  source: Ref<number>
  /** 目标 DOM 元素的 ref */
  targetRef: Ref<HTMLElement | null>
  /** 最小变化阈值 */
  minChange: number
  /** 额外的条件检查函数，返回 true 时跳过更新 */
  shouldSkip?: () => boolean
  /** CSS 属性名，默认为 'width' */
  property?: string
  /** 是否在值后面添加 '%'，默认为 true */
  usePercent?: boolean
  /** 初始值，用于确保首次更新 */
  initialValue?: number
}

/**
 * 使用阈值过滤的样式更新
 *
 * 当监听的数据源变化时，只有变化超过指定阈值才更新目标元素的样式。
 * 这可以避免频繁的 DOM 操作，提升性能。
 */
export function useThrottledStyleUpdate(options: UseThrottledStyleUpdateOptions) {
  const {
    source,
    targetRef,
    minChange,
    shouldSkip,
    property = 'width',
    usePercent = true,
    initialValue
  } = options

  let lastValue = initialValue ?? -1

  watch(
    () => source.value,
    newVal => {
      // 检查目标元素是否存在
      if (!targetRef.value) return

      // 检查是否应该跳过更新
      if (shouldSkip?.()) return

      // 阈值过滤：只有变化超过指定阈值才更新
      if (Math.abs(newVal - lastValue) < minChange) return
      lastValue = newVal

      // 直接更新样式
      const value = usePercent ? `${newVal}%` : `${newVal}`
      targetRef.value.style[property as any] = value
    },
    { flush: 'post' }
  )

  return {
    /** 手动重置最后记录的值，强制下次更新 */
    resetLastValue: () => {
      lastValue = -1
    }
  }
}
