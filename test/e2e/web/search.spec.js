import { test, expect } from '@playwright/test'

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', /Search/)
  })

  test('should search for songs and display results', async ({ page }) => {
    // Type search keyword
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('周杰伦')

    // Click search button
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

    // Wait for API response
    await page.waitForResponse(response =>
      response.url().includes('/api/cloudsearch') && response.status() === 200
    )

    // Click playlist tab to see results
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()

    // Wait for playlist to be visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()

    // Assert that results are rendered
    const listItems = page.locator('.list-item')
    const itemCount = await listItems.count()
    expect(itemCount).toBeGreaterThan(0)
  })

  test('should display empty state for non-existent search', async ({ page }) => {
    // Search for something that won't return results
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('xyz123nonexistent')
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

    // Wait for API response
    await page.waitForResponse(response =>
      response.url().includes('/api/cloudsearch') && response.status() === 200
    )

    // Click playlist tab
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()

    // Wait for playlist to be visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()

    // Assert empty state is displayed
    const emptyState = page.locator('.empty-state')
    await expect(emptyState).toBeVisible()

    // Assert no list items are present
    const listItems = page.locator('.list-item')
    const itemCount = await listItems.count()
    expect(itemCount).toBe(0)
  })

  test('should handle empty search', async ({ page }) => {
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

    // Should show toast error or stay on current page
    await page.waitForTimeout(1000)

    // Check that page is still functional
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
  })

  test('should clear search input', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')

    // Type and clear
    await searchInput.fill('test')
    await searchInput.clear()

    // Input should be empty
    const value = await searchInput.inputValue()
    expect(value).toBe('')
  })
})

test.describe('Playlist Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display playlist tab', async ({ page }) => {
    // Click playlist tab
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await expect(playlistTab).toBeVisible()
    await playlistTab.click()

    // Check playlist component is visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()
  })

  test('should display empty state when no songs', async ({ page }) => {
    // Click playlist tab
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()

    // Check playlist is visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()

    // Assert empty state is displayed
    const emptyState = page.locator('.empty-state')
    await expect(emptyState).toBeVisible()
  })
})

test.describe('Lyrics Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display lyrics tab', async ({ page }) => {
    // Click lyrics tab
    const lyricsTab = page.locator('.tab').filter({ hasText: /Lyrics/i }).first()
    await expect(lyricsTab).toBeVisible()
    await lyricsTab.click()

    // Lyrics component should be visible
    const lyricPanel = page.locator('.right-panel')
    await expect(lyricPanel).toBeVisible()
  })
})

test.describe('Responsive Design', () => {
  test('should display correctly on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Check if main elements are visible
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()

    // Check that layout adapts
    const searchButton = page.locator('.exec-btn')
    await expect(searchButton).toBeVisible()
  })

  test('should display correctly on tablet', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()

    const searchButton = page.locator('.exec-btn')
    await expect(searchButton).toBeVisible()
  })
})
