export type ResizeHandleDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ResizeBoundsOptions {
  direction: ResizeHandleDirection
  initialBounds: WindowBounds
  deltaX: number
  deltaY: number
  minWidth: number
  minHeight: number
}

function includesHorizontal(direction: ResizeHandleDirection, axis: 'e' | 'w'): boolean {
  return direction.includes(axis)
}

function includesVertical(direction: ResizeHandleDirection, axis: 'n' | 's'): boolean {
  return direction.includes(axis)
}

export function computeResizedWindowBounds(options: ResizeBoundsOptions): WindowBounds {
  const { direction, initialBounds, deltaX, deltaY, minWidth, minHeight } = options
  const right = initialBounds.x + initialBounds.width
  const bottom = initialBounds.y + initialBounds.height

  let nextX = initialBounds.x
  let nextY = initialBounds.y
  let nextWidth = initialBounds.width
  let nextHeight = initialBounds.height

  if (includesHorizontal(direction, 'e')) {
    nextWidth = initialBounds.width + deltaX
  }

  if (includesHorizontal(direction, 'w')) {
    nextX = initialBounds.x + deltaX
    nextWidth = initialBounds.width - deltaX
  }

  if (includesVertical(direction, 's')) {
    nextHeight = initialBounds.height + deltaY
  }

  if (includesVertical(direction, 'n')) {
    nextY = initialBounds.y + deltaY
    nextHeight = initialBounds.height - deltaY
  }

  if (nextWidth < minWidth) {
    nextWidth = minWidth
    if (includesHorizontal(direction, 'w')) {
      nextX = right - minWidth
    }
  }

  if (nextHeight < minHeight) {
    nextHeight = minHeight
    if (includesVertical(direction, 'n')) {
      nextY = bottom - minHeight
    }
  }

  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    width: Math.round(nextWidth),
    height: Math.round(nextHeight)
  }
}
