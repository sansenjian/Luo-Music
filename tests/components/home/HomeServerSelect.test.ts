import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import HomeServerSelect from '../../../src/components/home/HomeServerSelect.vue'
import type { MusicServerOption } from '../../../src/composables/useHomePage'

const servers: MusicServerOption[] = [
  { value: 'netease', label: 'Netease' },
  { value: 'qq', label: 'QQ Music' }
]

describe('HomeServerSelect', () => {
  it('emits toggle-select when select trigger is clicked', async () => {
    const wrapper = mount(HomeServerSelect, {
      props: {
        selectedServer: 'netease',
        selectedServerLabel: 'Netease',
        servers,
        showSelect: true
      }
    })

    await wrapper.find('.server-select-custom').trigger('click')
    expect(wrapper.emitted('toggle-select')).toHaveLength(1)
  })

  it('emits selected server value when option is clicked', async () => {
    const wrapper = mount(HomeServerSelect, {
      props: {
        selectedServer: 'netease',
        selectedServerLabel: 'Netease',
        servers,
        showSelect: true
      }
    })

    await wrapper.findAll('.dropdown-option')[1].trigger('click')
    expect(wrapper.emitted('select-server')?.[0]).toEqual(['qq'])
  })
})
