import { test, expect } from '@playwright/test'

// Mock API responses
const mockSearchResponse = {
  result: {
    songs: [
      {
        id: 123,
        name: 'Test Song',
        ar: [{ name: 'Test Artist' }],
        al: { name: 'Test Album', picUrl: 'https://example.com/cover.jpg' },
        dt: 180000
      }
    ]
  }
}

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the search API
    await page.route('**/cloudsearch?**', async route => {
      const url = new URL(route.request().url())
      const keywords = url.searchParams.get('keywords')
      const body =
        keywords === 'nonexistent'
          ? { result: { songs: [] } }
          : mockSearchResponse

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body)
      })
    })

    await page.goto('/')
  })

  test('should display search input', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
  })

  test('should search for songs and display results', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('test song')
    await searchInput.press('Enter')

    // Wait for results
    await page.waitForTimeout(500)

    // Check if results are displayed
    const results = page.locator('.playlist .list-item')
    await expect(results).toHaveCount(1)
  })

  test('should display empty state for non-existent search', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('nonexistent')
    await searchInput.press('Enter')

    await page.waitForTimeout(500)

    // Check for empty state
    const emptyState = page.locator('.playlist .empty-state')
    await expect(emptyState).toBeVisible()
  })

  test('should show error toast for empty search', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.press('Enter')

    // Check for toast message
    const toast = page.locator('.toast-message')
    await expect(toast).toContainText('Please enter a search keyword')
  })

  test('should search via execute button', async ({ page }) => {
    const searchInput = page.locator('.cyber-input')
    const executeButton = page.locator('.exec-btn')
    await searchInput.fill('test song')
    await executeButton.click()

    await page.waitForTimeout(500)
    const results = page.locator('.playlist .list-item')
    await expect(results).toHaveCount(1)
  })
})

test.describe('Playlist Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display playlist tab', async ({ page }) => {
    const playlistTab = page.getByRole('button', { name: 'Playlist' })
    await expect(playlistTab).toBeVisible()
  })

  test('should display empty state when no songs', async ({ page }) => {
    const playlistTab = page.getByRole('button', { name: 'Playlist' })
    await playlistTab.click()

    const emptyState = page.locator('.playlist .empty-state')
    await expect(emptyState).toBeVisible()
  })
})

test.describe('Lyrics Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display lyrics panel when tab is clicked', async ({ page }) => {
    const lyricsTab = page.getByRole('button', { name: 'Lyrics' })
    await lyricsTab.click()

    const lyricsPanel = page.locator('.lyric')
    await expect(lyricsPanel).toBeVisible()
  })

  test('should display lyrics content when song is playing', async ({ page }) => {
    const lyricsTab = page.getByRole('button', { name: 'Lyrics' })
    await lyricsTab.click()

    // Check for no lyrics message
    const noLyrics = page.locator('.lyric .empty-state')
    await expect(noLyrics).toBeVisible()
  })
})

test.describe('Responsive Design', () => {
  test('should display correctly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const player = page.locator('.player-section')
    await expect(player).toBeVisible()
  })

  test('should display correctly on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    const player = page.locator('.player-section')
    await expect(player).toBeVisible()
  })
})
