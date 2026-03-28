import { test, expect } from '@playwright/test'

test.describe('播放器功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('播放/暂停按钮应该存在', async ({ page }) => {
    const playButton = page.locator('.ctrl-main').first()
    await expect(playButton).toBeVisible()
  })

  test('音量控制应该存在', async ({ page }) => {
    const volumeControl = page.locator('.volume-row').first()
    await expect(volumeControl).toBeVisible()
  })

  test('进度条应该存在', async ({ page }) => {
    const progressBar = page.locator('.progress-bar').first()
    await expect(progressBar).toBeVisible()
  })
})
