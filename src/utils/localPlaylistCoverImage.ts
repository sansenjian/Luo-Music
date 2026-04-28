const PLAYLIST_COVER_SIZE = 512
const PLAYLIST_COVER_QUALITY = 0.86

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('无法读取封面文件'))
    })
    reader.addEventListener('error', () => reject(new Error('无法读取封面文件')))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('无法解析封面图片')))
    image.src = dataUrl
  })
}

async function resizeCoverDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined') {
    return dataUrl
  }

  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    return dataUrl
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  if (!sourceSize || !Number.isFinite(sourceSize)) {
    return dataUrl
  }

  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2)
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2)

  canvas.width = PLAYLIST_COVER_SIZE
  canvas.height = PLAYLIST_COVER_SIZE
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    PLAYLIST_COVER_SIZE,
    PLAYLIST_COVER_SIZE
  )

  return canvas.toDataURL('image/jpeg', PLAYLIST_COVER_QUALITY)
}

export async function readLocalPlaylistCoverFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件作为封面')
  }

  const dataUrl = await readFileAsDataUrl(file)

  try {
    return await resizeCoverDataUrl(dataUrl)
  } catch {
    return dataUrl
  }
}
