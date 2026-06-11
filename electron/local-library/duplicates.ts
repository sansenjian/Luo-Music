import { createHash } from 'node:crypto'
import path from 'node:path'

import type { LocalLibraryDuplicateMode, LocalLibraryTrack } from '@shared/types/localLibrary'

export type LocalLibraryDuplicateIndexMember = {
  groupId: string
  trackId: string
  qualityScore: number
  rank: number
  hidden: boolean
  reasons: string[]
}

export type LocalLibraryDuplicateIndexGroup = {
  id: string
  mode: LocalLibraryDuplicateMode
  duplicateKey: string
  representativeTrackId: string
  trackCount: number
  hiddenCount: number
  confidence: number
  reasons: string[]
  members: LocalLibraryDuplicateIndexMember[]
}

type DuplicateCandidate = {
  durationMs: number
  key: string
  markers: Set<string>
  normalizedArtist: string
  normalizedTitle: string
  track: LocalLibraryTrack
}

const STRICT_DURATION_TOLERANCE_MS = 2000

const SOURCE_PREFIX_PATTERN = /^(?:【\s*转载\s*】|\[\s*转载\s*\]|\(\s*转载\s*\)|转载|搬运)\s*/iu

const EDGE_QUOTES_PATTERN = /^[`"'“”‘’「」『』《》〈〉\s]+|[`"'“”‘’「」『』《》〈〉\s]+$/gu

const LOSSLESS_CODEC_MARKERS = [
  'flac',
  'alac',
  'ape',
  'wav',
  'wave',
  'pcm',
  'aiff',
  'aif',
  'dsd',
  'dff',
  'dsf'
]

const LOSSY_CODEC_MARKERS = ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'vorbis', 'wma']

const VERSION_MARKERS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'live', pattern: /\blive\b|现场/iu },
  { id: 'remix', pattern: /\bremix(?:ed)?\b/iu },
  { id: 'remaster', pattern: /\bremaster(?:ed)?\b|重制/iu },
  { id: 'cover', pattern: /\bcover\b|翻唱/iu },
  { id: 'instrumental', pattern: /\binstrumental\b|纯音乐/iu },
  { id: 'karaoke', pattern: /\bkaraoke\b|伴奏/iu },
  { id: 'off-vocal', pattern: /\boff\s*vocal\b/iu },
  { id: 'tv-size', pattern: /\btv\s*size\b/iu },
  { id: 'short-version', pattern: /\bshort\s*ver(?:sion)?\.?\b|剪辑版/iu },
  { id: 'long-version', pattern: /\blong\s*ver(?:sion)?\.?\b|完整版/iu },
  { id: 'radio-edit', pattern: /\bradio\s*edit\b/iu },
  { id: 'extended', pattern: /\bextended\b|加长版/iu },
  { id: 'acoustic', pattern: /\bacoustic\b/iu },
  { id: 'demo', pattern: /\bdemo\b/iu },
  { id: 'mono', pattern: /\bmono\b/iu },
  { id: 'stereo-mix', pattern: /\bstereo\s*mix\b/iu }
]

export function buildStrictDuplicateIndex(
  tracks: LocalLibraryTrack[]
): LocalLibraryDuplicateIndexGroup[] {
  const candidatesByKey = new Map<string, DuplicateCandidate[]>()

  for (const track of tracks) {
    const candidate = createDuplicateCandidate(track)
    if (!candidate) {
      continue
    }

    const candidates = candidatesByKey.get(candidate.key) ?? []
    candidates.push(candidate)
    candidatesByKey.set(candidate.key, candidates)
  }

  const groups: LocalLibraryDuplicateIndexGroup[] = []

  for (const candidates of candidatesByKey.values()) {
    if (candidates.length < 2) {
      continue
    }

    for (const cluster of clusterStrictCandidates(candidates)) {
      if (cluster.length < 2) {
        continue
      }

      groups.push(createDuplicateGroup(cluster))
    }
  }

  return groups.sort((left, right) => left.duplicateKey.localeCompare(right.duplicateKey))
}

export function normalizeDuplicateTitle(title: string): string {
  let normalized = normalizeDuplicateText(title)
  let next = normalized.replace(SOURCE_PREFIX_PATTERN, '')
  while (next !== normalized) {
    normalized = next.trim()
    next = normalized.replace(SOURCE_PREFIX_PATTERN, '')
  }

  return normalized
}

export function normalizeDuplicateArtist(artist: string): string {
  return normalizeDuplicateText(artist)
}

export function canStrictMergeTracks(left: LocalLibraryTrack, right: LocalLibraryTrack): boolean {
  const leftCandidate = createDuplicateCandidate(left)
  const rightCandidate = createDuplicateCandidate(right)
  if (!leftCandidate || !rightCandidate) {
    return false
  }

  return canStrictMergeCandidates(leftCandidate, rightCandidate)
}

export function scoreTrackQuality(track: LocalLibraryTrack): number {
  const codecScore = resolveCodecScore(track)
  const bitDepthScore = clampScore(track.bitDepth, 0, 32) * 80
  const sampleRateScore = clampScore(track.sampleRate, 0, 384000) / 100
  const bitrateScore = clampScore(track.bitrate, 0, 2000000) / 400
  const coverScore = track.coverHash ? 75 : 0
  const metadataScore = track.duration > 0 && track.title && track.artist ? 35 : 0

  return Math.round(
    codecScore + bitDepthScore + sampleRateScore + bitrateScore + coverScore + metadataScore
  )
}

function createDuplicateCandidate(track: LocalLibraryTrack): DuplicateCandidate | null {
  const normalizedTitle = normalizeDuplicateTitle(track.title)
  const normalizedArtist = normalizeDuplicateArtist(track.artist)
  const durationMs = normalizeDuration(track.duration)

  if (!normalizedTitle || !normalizedArtist || durationMs <= 0) {
    return null
  }

  return {
    durationMs,
    key: `${normalizedArtist}\u0000${normalizedTitle}`,
    markers: extractVersionMarkers(track.title),
    normalizedArtist,
    normalizedTitle,
    track
  }
}

function clusterStrictCandidates(candidates: DuplicateCandidate[]): DuplicateCandidate[][] {
  const clusters: DuplicateCandidate[][] = []
  const sortedCandidates = [...candidates].sort((left, right) => {
    const durationDelta = left.durationMs - right.durationMs
    if (durationDelta !== 0) {
      return durationDelta
    }

    return left.track.filePath.localeCompare(right.track.filePath)
  })

  for (const candidate of sortedCandidates) {
    const matchingCluster = clusters.find(cluster =>
      cluster.every(member => canStrictMergeCandidates(member, candidate))
    )

    if (matchingCluster) {
      matchingCluster.push(candidate)
      continue
    }

    clusters.push([candidate])
  }

  return clusters
}

function canStrictMergeCandidates(left: DuplicateCandidate, right: DuplicateCandidate): boolean {
  return (
    left.normalizedTitle === right.normalizedTitle &&
    left.normalizedArtist === right.normalizedArtist &&
    Math.abs(left.durationMs - right.durationMs) <= STRICT_DURATION_TOLERANCE_MS &&
    !hasVersionMarkerConflict(left.markers, right.markers)
  )
}

function createDuplicateGroup(candidates: DuplicateCandidate[]): LocalLibraryDuplicateIndexGroup {
  const medianDurationMs = getMedian(candidates.map(candidate => candidate.durationMs))
  const duplicateKey = candidates[0]?.key ?? ''
  const sortedCandidates = [...candidates].sort((left, right) => {
    const scoreDelta = scoreTrackQuality(right.track) - scoreTrackQuality(left.track)
    if (scoreDelta !== 0) {
      return scoreDelta
    }

    const durationDelta =
      Math.abs(left.durationMs - medianDurationMs) - Math.abs(right.durationMs - medianDurationMs)
    if (durationDelta !== 0) {
      return durationDelta
    }

    const sizeDelta = right.track.fileSize - left.track.fileSize
    if (sizeDelta !== 0) {
      return sizeDelta
    }

    return left.track.filePath.localeCompare(right.track.filePath)
  })
  const groupId = createDuplicateGroupId(
    duplicateKey,
    sortedCandidates.map(candidate => candidate.track.id)
  )
  const members = sortedCandidates.map((candidate, index) => ({
    groupId,
    trackId: candidate.track.id,
    qualityScore: scoreTrackQuality(candidate.track),
    rank: index + 1,
    hidden: index > 0,
    reasons: createMemberReasons(candidate.track)
  }))

  return {
    id: groupId,
    mode: 'strict',
    duplicateKey,
    representativeTrackId: sortedCandidates[0]?.track.id ?? '',
    trackCount: sortedCandidates.length,
    hiddenCount: Math.max(0, sortedCandidates.length - 1),
    confidence: 0.98,
    reasons: ['metadata-strict-match', 'duration-delta<=2s', 'version-markers-compatible'],
    members
  }
}

function normalizeDuplicateText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ')
    .replace(EDGE_QUOTES_PATTERN, '')
    .trim()
}

function normalizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return Math.round(duration)
}

function extractVersionMarkers(title: string): Set<string> {
  const normalizedTitle = normalizeDuplicateText(title)
  const markers = new Set<string>()

  for (const marker of VERSION_MARKERS) {
    if (marker.pattern.test(normalizedTitle)) {
      markers.add(marker.id)
    }
  }

  return markers
}

function hasVersionMarkerConflict(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return true
  }

  for (const marker of left) {
    if (!right.has(marker)) {
      return true
    }
  }

  return false
}

function createDuplicateGroupId(duplicateKey: string, trackIds: string[]): string {
  const hash = createHash('sha1')
    .update(`strict\u0000${duplicateKey}\u0000${[...trackIds].sort().join('\u0000')}`)
    .digest('hex')
  return `local-duplicate:${hash}`
}

function resolveCodecScore(track: LocalLibraryTrack): number {
  const codec = normalizeCodec(track.codec) || normalizeCodec(path.extname(track.filePath).slice(1))
  if (LOSSLESS_CODEC_MARKERS.some(marker => codec.includes(marker))) {
    return 5000
  }

  if (LOSSY_CODEC_MARKERS.some(marker => codec.includes(marker))) {
    return 2500
  }

  return 1000
}

function normalizeCodec(codec: string | null | undefined): string {
  return typeof codec === 'string' ? codec.trim().toLocaleLowerCase() : ''
}

function clampScore(value: number | null | undefined, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(min, Math.min(max, Number(value)))
}

function getMedian(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sortedValues = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sortedValues.length / 2)
  if (sortedValues.length % 2 === 1) {
    return sortedValues[middle] ?? 0
  }

  return ((sortedValues[middle - 1] ?? 0) + (sortedValues[middle] ?? 0)) / 2
}

function createMemberReasons(track: LocalLibraryTrack): string[] {
  const reasons = [resolveCodecReason(track)]

  if (track.bitDepth) {
    reasons.push(`bit-depth:${track.bitDepth}`)
  }
  if (track.sampleRate) {
    reasons.push(`sample-rate:${track.sampleRate}`)
  }
  if (track.bitrate) {
    reasons.push(`bitrate:${track.bitrate}`)
  }
  if (track.coverHash) {
    reasons.push('has-cover')
  }

  return reasons
}

function resolveCodecReason(track: LocalLibraryTrack): string {
  const codec = normalizeCodec(track.codec) || normalizeCodec(path.extname(track.filePath).slice(1))
  return codec ? `codec:${codec}` : 'codec:unknown'
}
