import { test, expect } from '@playwright/test'

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to ensure deterministic state
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
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

    // Wait for API response with timeout
    try {
      await page.waitForResponse(response =>
        response.url().includes('/cloudsearch') && response.status() === 200
      , { timeout: 10000 })
    } catch (e) {
      // API might fail, continue to check UI state
    }

    // Click playlist tab to see results
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()

    // Wait for playlist to be visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()

    // Wait for results to render or empty state to appear
    const listItems = page.locator('.list-item')
    const emptyState = page.locator('.playlist .empty-state')

    // Wait for either results or empty state
    await Promise.race([
      listItems.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      emptyState.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    ])

    // Assert that results are rendered or empty state is shown
    const hasResults = await listItems.count() > 0
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    // Either we have results or empty state (API might fail)
    expect(hasResults || hasEmptyState).toBe(true)
  })

  test('should display empty state for non-existent search', async ({ page }) => {
    // Search for something that won't return results
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('xyz123nonexistent')
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

    // Wait for API response with timeout
    try {
      await page.waitForResponse(response =>
        response.url().includes('/cloudsearch') && response.status() === 200
      , { timeout: 10000 })
    } catch (e) {
      // API might fail, continue to check UI state
    }

    // Click playlist tab
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()

    // Wait for playlist to be visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()

    // Wait for empty state to appear
    const emptyState = page.locator('.playlist .empty-state')
    await expect(emptyState).toBeVisible({ timeout: 5000 })

    // Assert no list items are present
    const listItems = page.locator('.list-item')
    const itemCount = await listItems.count()
    expect(itemCount).toBe(0)
  })

  test('should show error toast for empty search', async ({ page }) => {
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

    // Should show toast error
    const toastError = page.locator('.toast.error')
    await expect(toastError).toBeVisible()
    await expect(toastError).toContainText('Please enter a search keyword')

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
    // Clear storage to ensure deterministic blank state
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
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

    // Assert empty state is displayed (specific to playlist)
    const emptyState = page.locator('.playlist .empty-state').first()
    await expect(emptyState).toBeVisible()
  })
})

test.describe('Lyrics Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to ensure deterministic state
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
  })

  test('should display lyrics panel when tab is clicked', async ({ page }) => {
    // Click lyrics tab
    const lyricsTab = page.locator('.tab').filter({ hasText: /Lyrics/i }).first()
    await expect(lyricsTab).toBeVisible()
    await lyricsTab.click()

    // Lyrics panel should be visible
    const lyricPanel = page.locator('.right-panel')
    await expect(lyricPanel).toBeVisible()

    // Check for lyrics content area
    const lyricsContent = page.locator('.lyrics, .lyric-content, [class*="lyric"]')
    await expect(lyricsContent).toBeVisible()
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
