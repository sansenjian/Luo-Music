import type {
  LocalLibraryMetadataCandidateField,
  LocalLibraryNetworkMetadataCandidateInput,
  LocalLibraryNetworkMetadataCandidateScore,
  LocalLibraryNetworkMetadataProvider,
  LocalLibraryNetworkMetadataSuggestion,
  LocalLibraryTrack
} from '@shared/types/localLibrary'

import { scoreDuplicateTextSimilarity } from './duplicates'

const DEFAULT_PROVIDER: LocalLibraryNetworkMetadataProvider = 'unknown'
const KNOWN_PROVIDERS = new Set<LocalLibraryNetworkMetadataProvider>([
  'netease',
  'qq',
  'plugin',
  'unknown'
])
const MAX_DURATION_DELTA_MS = 10_000

export function scoreNetworkMetadataCandidate(
  track: LocalLibraryTrack,
  input: LocalLibraryNetworkMetadataCandidateInput
): LocalLibraryNetworkMetadataCandidateScore {
  const provider = normalizeNetworkMetadataProvider(input.provider)
  const titleScore = scoreOptionalTextMatch(track.title, input.title)
  const artistScore = scoreOptionalTextMatch(track.artist, input.artist)
  const albumScore = scoreOptionalTextMatch(track.album, input.album)
  const durationScore = scoreOptionalDurationMatch(track.duration, input.duration)
  const matchScore = roundConfidence(
    titleScore.score * 0.45 +
      artistScore.score * 0.3 +
      albumScore.score * 0.15 +
      durationScore.score * 0.1
  )
  const confidence = roundConfidence(matchScore * (hasMinimumIdentity(input) ? 1 : 0.72))

  return {
    provider,
    confidence,
    matchScore,
    reasons: [
      ...titleScore.reasons,
      ...artistScore.reasons,
      ...albumScore.reasons,
      ...durationScore.reasons
    ],
    suggestions: createNetworkMetadataSuggestions(track, input, confidence)
  }
}

function normalizeNetworkMetadataProvider(
  provider: LocalLibraryNetworkMetadataCandidateInput['provider']
): LocalLibraryNetworkMetadataProvider {
  return provider && KNOWN_PROVIDERS.has(provider) ? provider : DEFAULT_PROVIDER
}

function hasMinimumIdentity(input: LocalLibraryNetworkMetadataCandidateInput): boolean {
  return Boolean(normalizeCandidateText(input.title) && normalizeCandidateText(input.artist))
}

function scoreOptionalTextMatch(
  currentValue: string,
  candidateValue: string | null | undefined
): { score: number; reasons: string[] } {
  const normalizedCandidateValue = normalizeCandidateText(candidateValue)
  if (!normalizedCandidateValue) {
    return { score: 0.4, reasons: ['metadata-field-missing'] }
  }

  const normalizedCurrentValue = normalizeCandidateText(currentValue)
  if (!normalizedCurrentValue) {
    return { score: 0.65, reasons: ['metadata-field-fillable'] }
  }

  const score = scoreDuplicateTextSimilarity(normalizedCurrentValue, normalizedCandidateValue)
  return {
    score,
    reasons: [score >= 0.9 ? 'metadata-text-strong-match' : 'metadata-text-weak-match']
  }
}

function scoreOptionalDurationMatch(
  currentDuration: number,
  candidateDuration: number | null | undefined
): { score: number; reasons: string[] } {
  if (!Number.isFinite(candidateDuration) || Number(candidateDuration) <= 0) {
    return { score: 0.5, reasons: ['duration-missing'] }
  }

  if (!Number.isFinite(currentDuration) || currentDuration <= 0) {
    return { score: 0.65, reasons: ['duration-fillable'] }
  }

  const deltaMs = Math.abs(currentDuration - Number(candidateDuration))
  const score = Math.max(0, 1 - Math.min(deltaMs, MAX_DURATION_DELTA_MS) / MAX_DURATION_DELTA_MS)
  return {
    score,
    reasons: [score >= 0.8 ? 'duration-close' : 'duration-drift']
  }
}

function createNetworkMetadataSuggestions(
  track: LocalLibraryTrack,
  input: LocalLibraryNetworkMetadataCandidateInput,
  confidence: number
): LocalLibraryNetworkMetadataSuggestion[] {
  const sources = track.metadataSources
  const suggestions: LocalLibraryNetworkMetadataSuggestion[] = []

  addTextSuggestion(suggestions, track, 'title', track.title, input.title, confidence)
  addTextSuggestion(suggestions, track, 'artist', track.artist, input.artist, confidence)
  addTextSuggestion(suggestions, track, 'album', track.album, input.album, confidence)

  if (isWeakLocalMetadataSource(sources?.duration) && Number(input.duration) > 0) {
    suggestions.push({
      field: 'duration',
      currentValue: track.duration > 0 ? String(track.duration) : null,
      suggestedValue: String(Math.round(Number(input.duration))),
      confidence
    })
  }

  if (isWeakLocalMetadataSource(sources?.cover) && normalizeCandidateText(input.coverUrl)) {
    suggestions.push({
      field: 'cover',
      currentValue: track.coverHash,
      suggestedValue: normalizeCandidateText(input.coverUrl),
      confidence
    })
  }

  return suggestions
}

function addTextSuggestion(
  suggestions: LocalLibraryNetworkMetadataSuggestion[],
  track: LocalLibraryTrack,
  field: Extract<LocalLibraryMetadataCandidateField, 'title' | 'artist' | 'album'>,
  currentValue: string,
  candidateValue: string | null | undefined,
  confidence: number
): void {
  const suggestedValue = normalizeCandidateText(candidateValue)
  if (!suggestedValue || !isWeakLocalMetadataSource(track.metadataSources?.[field])) {
    return
  }

  const normalizedCurrentValue = normalizeCandidateText(currentValue)
  if (
    normalizedCurrentValue &&
    normalizedCurrentValue.toLocaleLowerCase() === suggestedValue.toLocaleLowerCase()
  ) {
    return
  }

  suggestions.push({
    field,
    currentValue: currentValue || null,
    suggestedValue,
    confidence
  })
}

function isWeakLocalMetadataSource(source: string | undefined): boolean {
  return (
    source === undefined || source === 'filename' || source === 'folder' || source === 'unknown'
  )
}

function normalizeCandidateText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function roundConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}
