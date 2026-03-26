import { test, expect } from '@playwright/test'

test.describe('Luo-Music 基础测试', () => {
  test('首页应该能正常加载', async ({ page }) => {
    await page.goto('/')

    // 验证页面标题
    await expect(page).toHaveTitle(/Luo-Music/)

    // 验证页面主要内容区域存在
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('搜索框应该存在', async ({ page }) => {
    await page.goto('/')

    // 查找搜索输入框（根据实际 DOM 调整选择器）
    const searchInput = page.getByPlaceholder(/搜索/)
    await expect(searchInput).toBeVisible()
  })

  test('播放器应该存在', async ({ page }) => {
    await page.goto('/')

    // 查找播放器控件（根据实际 DOM 调整选择器）
    const player = page.getByTestId('player')
    await expect(player).toBeVisible()
  })
})
