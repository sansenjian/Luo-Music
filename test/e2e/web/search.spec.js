import { test, expect } from '@playwright/test'

// Helper to clear storage and reload
async function resetPageState(page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  // Don't reload to avoid timeout issues
}

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await resetPageState(page)
  })

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
    await expect(searchInput).toHaveAttribute('placeholder', /Search/)
  })

  test('should search for songs and display results', async ({ page }) => {
    // Mock the cloudsearch API response
    const mockResponse = {
      code: 200,
      result: {
        songs: [
          { id: 123, name: 'Test Song 1', artists: [{ name: 'Test Artist 1' }] },
          { id: 456, name: 'Test Song 2', artists: [{ name: 'Test Artist 2' }] }
        ],
        songCount: 2
      }
    }

    // Stub the API call
    await page.route('**/cloudsearch**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      })
    })

    // Type search keyword
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('test query')

    // Click search button
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

    // Click playlist tab to see results
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()

    // Wait for playlist to be visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()

    // Assert that results are rendered
    const listItems = page.locator('.list-item')
    await expect(listItems).toHaveCount(mockResponse.result.songs.length)

    // Verify first result contains song name
    await expect(listItems.first()).toContainText(mockResponse.result.songs[0].name)
  })

  test('should display empty state for non-existent search', async ({ page }) => {
    // Mock empty response
    const mockEmptyResponse = {
      code: 200,
      result: {
        songs: [],
        songCount: 0
      }
    }

    // Stub the API call
    await page.route('**/cloudsearch**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEmptyResponse)
      })
    })

    // Search for something
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('xyz123nonexistent')
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()

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
    await resetPageState(page)
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
    await resetPageState(page)
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
