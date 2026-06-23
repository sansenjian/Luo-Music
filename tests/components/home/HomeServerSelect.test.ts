import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import HomeServerSelect from '@/features/home/components/HomeServerSelect.vue'
import type { MusicServerOption } from '@/features/home/composables/useHomePage'

const servers: MusicServerOption[] = [
  { value: 'netease', label: 'Netease' },
  { value: 'qq', label: 'QQ Music' }
]

describe('HomeServerSelect', () => {
  it('emits toggle-select when select trigger is clicked', async () => {
    const wrapper = mount(HomeServerSelect, {
      attachTo: document.body,
      props: {
        selectedServer: 'netease',
        selectedServerLabel: 'Netease',
        servers,
        showSelect: false
      }
    })

    await wrapper.find('.server-select-custom').trigger('pointerdown')
    expect(wrapper.emitted('toggle-select')).toHaveLength(1)

    wrapper.unmount()
  })

  it('emits selected server value when option is clicked', async () => {
    const wrapper = mount(HomeServerSelect, {
      attachTo: document.body,
      props: {
        selectedServer: 'netease',
        selectedServerLabel: 'Netease',
        servers,
        showSelect: true
      }
    })

    await wrapper.findAll('.dropdown-option')[1].trigger('click')
    await nextTick()
    expect(wrapper.emitted('select-server')?.[0]).toEqual(['qq'])

    wrapper.unmount()
  })
})
