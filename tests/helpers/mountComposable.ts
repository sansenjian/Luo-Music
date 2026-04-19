import { defineComponent } from 'vue'
import { mount, type MountingOptions, type VueWrapper } from '@vue/test-utils'

export function mountComposable<T>(
  useComposable: () => T,
  options: MountingOptions<unknown> = {}
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

  const wrapper = mount(Harness, options)

  return {
    result,
    wrapper
  }
}
