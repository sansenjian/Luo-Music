import { describe, expect, it } from 'vitest'

import { computeResizedWindowBounds } from '@/utils/window/framelessResize'

describe('computeResizedWindowBounds', () => {
  const initialBounds = {
    x: 100,
    y: 120,
    width: 1200,
    height: 800
  }

  it('expands from the east edge without moving the origin', () => {
    expect(
      computeResizedWindowBounds({
        direction: 'e',
        initialBounds,
        deltaX: 80,
        deltaY: 0,
        minWidth: 400,
        minHeight: 80
      })
    ).toEqual({
      x: 100,
      y: 120,
      width: 1280,
      height: 800
    })
  })

  it('resizes from the west edge while keeping the right edge anchored', () => {
    expect(
      computeResizedWindowBounds({
        direction: 'w',
        initialBounds,
        deltaX: 90,
        deltaY: 0,
        minWidth: 400,
        minHeight: 80
      })
    ).toEqual({
      x: 190,
      y: 120,
      width: 1110,
      height: 800
    })
  })

  it('resizes from the north-west corner and clamps to the minimum size', () => {
    expect(
      computeResizedWindowBounds({
        direction: 'nw',
        initialBounds,
        deltaX: 1000,
        deltaY: 900,
        minWidth: 400,
        minHeight: 80
      })
    ).toEqual({
      x: 900,
      y: 840,
      width: 400,
      height: 80
    })
  })

  it('resizes from the south-west corner with independent width and height changes', () => {
    expect(
      computeResizedWindowBounds({
        direction: 'sw',
        initialBounds,
        deltaX: -75,
        deltaY: 60,
        minWidth: 400,
        minHeight: 80
      })
    ).toEqual({
      x: 25,
      y: 120,
      width: 1275,
      height: 860
    })
  })
})
