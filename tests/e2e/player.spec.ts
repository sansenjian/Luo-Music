import { test, expect } from '@playwright/test'

test.describe('播放器功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('播放/暂停按钮应该存在', async ({ page }) => {
    const playButton = page.getByRole('button', { name: /播放|暂停/i })
    await expect(playButton).toBeVisible()
  })

  test('音量控制应该存在', async ({ page }) => {
    // 查找音量控件（根据实际 DOM 调整选择器）
    const volumeControl = page.getByTestId('volume-control')
    await expect(volumeControl).toBeVisible()
  })

  test('进度条应该存在', async ({ page }) => {
    // 查找进度条（根据实际 DOM 调整选择器）
    const progressBar = page.getByTestId('progress-bar')
    await expect(progressBar).toBeVisible()
  })
})
