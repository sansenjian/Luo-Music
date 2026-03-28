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

    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
  })

  test('播放器应该存在', async ({ page }) => {
    await page.goto('/')

    const player = page.locator('.player-section').first()
    await expect(player).toBeVisible()
  })
})
