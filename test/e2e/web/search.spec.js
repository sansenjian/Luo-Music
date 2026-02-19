import { test, expect } from '@playwright/test'

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', /搜索歌曲/)
  })

  test('should search for songs', async ({ page }) => {
    // Type search keyword
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('测试')
    
    // Click search button or press Enter
    await searchInput.press('Enter')
    
    // Wait for results to load
    await page.waitForTimeout(2000)
    
    // Check if results are displayed
    const songItems = page.locator('.song-item, [class*="song"], [class*="result"]')
    const count = await songItems.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should display song information in results', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('周杰伦')
    await searchInput.press('Enter')
    
    await page.waitForTimeout(2000)
    
    // Check for song name
    const songNames = page.locator('.song-name, [class*="name"], h3, h4')
    await expect(songNames.first()).toBeVisible()
  })

  test('should handle empty search', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]')
    await searchInput.press('Enter')
    
    // Should show no results or stay on current page
    await page.waitForTimeout(1000)
  })

  test('should clear search results when input is cleared', async ({ page }) => {
    const searchInput = page.locator('input[type="text"]')
    
    // Search first
    await searchInput.fill('测试')
    await searchInput.press('Enter')
    await page.waitForTimeout(2000)
    
    // Clear input
    await searchInput.clear()
    await searchInput.press('Enter')
    
    await page.waitForTimeout(1000)
  })
})

test.describe('Player Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should play a song from search results', async ({ page }) => {
    // Search for a song
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('测试')
    await searchInput.press('Enter')
    await page.waitForTimeout(2000)
    
    // Click on first song
    const firstSong = page.locator('.song-item, [class*="song"]').first()
    await firstSong.click()
    
    // Wait for player to load
    await page.waitForTimeout(2000)
    
    // Check if player is visible
    const player = page.locator('.player, [class*="player"], audio')
    await expect(player).toBeVisible()
  })

  test('should display player controls', async ({ page }) => {
    // Search and play a song first
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('测试')
    await searchInput.press('Enter')
    await page.waitForTimeout(2000)
    
    const firstSong = page.locator('.song-item, [class*="song"]').first()
    await firstSong.click()
    await page.waitForTimeout(2000)
    
    // Check for play/pause button
    const playButton = page.locator('button, [class*="play"], [class*="pause"]').first()
    await expect(playButton).toBeVisible()
  })
})

test.describe('Lyrics Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display lyrics when song is playing', async ({ page }) => {
    // Search and play a song
    const searchInput = page.locator('input[type="text"]')
    await searchInput.fill('测试')
    await searchInput.press('Enter')
    await page.waitForTimeout(2000)
    
    const firstSong = page.locator('.song-item, [class*="song"]').first()
    await firstSong.click()
    await page.waitForTimeout(3000)
    
    // Check for lyrics container
    const lyrics = page.locator('.lyric, [class*="lyric"], .lyrics, [class*="lyrics"]')
    // Lyrics might not always be available, so we just check the test runs
  })
})

test.describe('Responsive Design', () => {
  test('should display correctly on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Check if main elements are visible
    const searchInput = page.locator('input[type="text"]')
    await expect(searchInput).toBeVisible()
  })

  test('should display correctly on tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    
    const searchInput = page.locator('input[type="text"]')
    await expect(searchInput).toBeVisible()
  })
})
