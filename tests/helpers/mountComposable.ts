import { defineComponent } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

export function mountComposable<T>(
  useComposable: () => T,
  options: Record<string, unknown> = {}
): {
  result: T
  wrapper: VueWrapper
} {
  let result!: T

  const Harness = defineComponent({
    setup() {
      result = useComposable()
      return result as object
    },
    template: '<div />'
  })

  const { slots, ...rest } = options
  const wrapper = mount(Harness, rest as any)

  return {
    result,
    wrapper
  }
}
