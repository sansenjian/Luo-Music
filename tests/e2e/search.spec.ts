import { test, expect } from '@playwright/test'

test.describe('搜索功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/cloudsearch?**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 200,
          result: {
            songs: [
              {
                id: 123,
                name: '周杰伦 - Test Song',
                ar: [{ name: '周杰伦' }],
                al: { name: 'Test Album', picUrl: 'https://example.com/cover.jpg' },
                dt: 180000
              }
            ],
            songCount: 1
          }
        })
      })
    })

    await page.goto('/')
  })

  test('搜索框可以输入文字', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('周杰伦')
    await expect(searchInput).toHaveValue('周杰伦')
  })

  test('搜索后显示结果列表', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('周杰伦')
    await searchInput.press('Enter')

    const songList = page.locator('.playlist .list-item')
    await expect(songList).toHaveCount(1)
  })
})
