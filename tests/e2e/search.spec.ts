import { test, expect } from '@playwright/test'

test.describe('搜索功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('搜索框可以输入文字', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/搜索/)
    await searchInput.fill('周杰伦')
    await expect(searchInput).toHaveValue('周杰伦')
  })

  test('搜索后显示结果列表', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/搜索/)
    await searchInput.fill('周杰伦')
    await searchInput.press('Enter')

    // 等待搜索结果加载
    await page.waitForTimeout(1000)

    // 验证结果列表存在（根据实际 DOM 调整选择器）
    const songList = page.getByTestId('song-list')
    await expect(songList).toBeVisible()
  })
})
