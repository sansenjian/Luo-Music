import { test, expect, type Page, type Route } from '@playwright/test'

// Mock API responses
interface MockSearchResult {
  code: number
  result: {
    songs: Array<{
      id: number
      name: string
      ar: Array<{ name: string }>
      al: { name: string; picUrl: string }
      dt: number
    }>
    songCount: number
  }
}

const mockSearchResponse: MockSearchResult = {
  code: 200,
  result: {
    songs: [
      {
        id: 123,
        name: 'Test Song',
        ar: [{ name: 'Test Artist' }],
        al: { name: 'Test Album', picUrl: 'https://example.com/cover.jpg' },
        dt: 180000
      }
    ],
    songCount: 1
  }
}

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    // Mock the search API
    await page.route('**/cloudsearch?**', async (route: Route) => {
      const url = new URL(route.request().url())
      const keywords = url.searchParams.get('keywords')
      const body: MockSearchResult =
        keywords === 'nonexistent'
          ? { code: 200, result: { songs: [], songCount: 0 } }
          : mockSearchResponse

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body)
      })
    })

    await page.goto('/')
  })

  test('should display search input', async ({ page }: { page: Page }) => {
    const searchInput = page.locator('.cyber-input')
    await expect(searchInput).toBeVisible()
  })

  test('should search for songs and display results', async ({ page }: { page: Page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('test song')
    await searchInput.press('Enter')

    const results = page.locator('.playlist .list-item')
    await expect(results).toHaveCount(1)
  })

  test('should display empty state for non-existent search', async ({ page }: { page: Page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('nonexistent')
    await searchInput.press('Enter')

    const toast = page.locator('.toast-message')
    await expect(toast).toContainText('No songs found for the current keyword')
  })

  test('should show error toast for empty search', async ({ page }: { page: Page }) => {
    const searchInput = page.locator('.cyber-input')
    await searchInput.press('Enter')

    // Check for toast message
    const toast = page.locator('.toast-message')
    await expect(toast).toContainText('Please enter a search keyword')
  })

  test('should search via execute button', async ({ page }: { page: Page }) => {
    const searchInput = page.locator('.cyber-input')
    const executeButton = page.locator('.exec-btn')
    await searchInput.fill('test song')
    await executeButton.click()

    const results = page.locator('.playlist .list-item')
    await expect(results).toHaveCount(1)
  })
})

test.describe('Playlist Functionality', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/')
  })

  test('should display playlist tab', async ({ page }: { page: Page }) => {
    const playlistTab = page.getByRole('button', { name: 'Playlist' })
    await expect(playlistTab).toBeVisible()
  })

  test('should display empty state when no songs', async ({ page }: { page: Page }) => {
    const playlistTab = page.getByRole('button', { name: 'Playlist' })
    await playlistTab.click()

    const emptyState = page.locator('.playlist .empty-state')
    await expect(emptyState).toBeVisible()
  })
})

test.describe('Lyrics Functionality', () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.goto('/')
  })

  test('should display lyrics panel when tab is clicked', async ({ page }: { page: Page }) => {
    const lyricsTab = page.getByRole('button', { name: 'Lyrics' })
    await lyricsTab.click()

    const lyricsPanel = page.locator('.lyric')
    await expect(lyricsPanel).toBeVisible()
  })

  test('should display lyrics content when song is playing', async ({ page }: { page: Page }) => {
    const lyricsTab = page.getByRole('button', { name: 'Lyrics' })
    await lyricsTab.click()

    // Check for no lyrics message
    const noLyrics = page.locator('.lyric .empty-state')
    await expect(noLyrics).toBeVisible()
  })
})

test.describe('Responsive Design', () => {
  test('should display correctly on mobile', async ({ page }: { page: Page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const player = page.locator('.player-section.is-docked')
    await expect(player).toBeVisible()
  })

  test('should display correctly on tablet', async ({ page }: { page: Page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    const player = page.locator('.player-section.is-docked')
    await expect(player).toBeVisible()
  })
})
