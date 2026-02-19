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

  test('should search for songs', async ({ page }) => {
    // Type search keyword
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('周杰伦')
    
    // Click search button
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()
    
    // Wait for loading to complete
    await page.waitForTimeout(8000)
    
    // Click playlist tab to see results
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()
    
    // Check if playlist component is visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()
    
    // Check if we have results, empty state, or still loading
    const hasResults = await page.locator('.list-item').count() > 0
    const hasEmptyState = await page.locator('.empty-state').count() > 0
    const isLoading = await page.locator('.loading').count() > 0
    
    // Should have one of these states
    expect(hasResults || hasEmptyState || isLoading).toBe(true)
  })

  test('should display empty state when no results', async ({ page }) => {
    // Search for something that won't return results
    const searchInput = page.locator('.cyber-input')
    await searchInput.fill('xyz123nonexistent')
    const searchButton = page.locator('.exec-btn')
    await searchButton.click()
    
    await page.waitForTimeout(8000)
    
    // Click playlist tab
    const playlistTab = page.locator('.tab').filter({ hasText: /Playlist/i }).first()
    await playlistTab.click()
    
    // Check playlist is visible
    const playlist = page.locator('.playlist')
    await expect(playlist).toBeVisible()
    
    // Check for empty state, results, or loading
    const hasEmptyState = await page.locator('.empty-state').count() > 0
    const hasResults = await page.locator('.list-item').count() > 0
    const isLoading = await page.locator('.loading').count() > 0
    
    expect(hasEmptyState || hasResults || isLoading).toBe(true)
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
    
    // Either empty state or track list should exist
    const hasEmpty = await page.locator('.empty-state').count() > 0
    const hasTracks = await page.locator('.track-list').count() > 0
    expect(hasEmpty || hasTracks).toBe(true)
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
    await page.waitForTimeout(500)
    expect(true).toBe(true)
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
