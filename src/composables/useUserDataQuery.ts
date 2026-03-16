import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

import { getUserDetail, getUserLevel, getUserSubcount } from '../api/user'

interface UserProfile {
  nickname?: string
  backgroundUrl?: string
  signature?: string
  follows?: number
  followeds?: number
  vipType?: number
}

interface UserDetailResponse {
  profile?: UserProfile
}

interface UserSubcountResponse {
  createdPlaylistCount?: number
}

interface UserLevelResponse {
  data?: {
    level?: number
  }
}

export interface UseUserDataQueryReturn {
  userDetail: ComputedRef<UserDetailResponse | null>
  userSubcount: ComputedRef<UserSubcountResponse | null>
  userLevel: ComputedRef<UserLevelResponse | null>
  profile: ComputedRef<UserProfile | null>
  stats: ComputedRef<{
    playlists: number
    follows: number
    followeds: number
    level: number
    isVip: boolean
  }>
  loading: ComputedRef<boolean>
  error: ComputedRef<unknown>
}

export function useUserDataQuery(
  userIdSource: MaybeRefOrGetter<string | number | null>
): UseUserDataQueryReturn {
  const userId = computed(() => toValue(userIdSource))
  const enabled = computed(() => !!userId.value)

  const {
    data: userDetail,
    isLoading: isLoadingDetail,
    error: errorDetail
  } = useQuery({
    queryKey: ['user', 'detail', userId],
    queryFn: async () => getUserDetail(Number(userId.value)) as Promise<UserDetailResponse>,
    enabled,
    staleTime: 1000 * 60 * 5
  })

  const { data: userSubcount, isLoading: isLoadingSubcount } = useQuery({
    queryKey: ['user', 'subcount', userId],
    queryFn: async () => getUserSubcount() as Promise<UserSubcountResponse>,
    enabled,
    staleTime: 1000 * 60 * 5
  })

  const { data: userLevel, isLoading: isLoadingLevel } = useQuery({
    queryKey: ['user', 'level', userId],
    queryFn: async () => getUserLevel() as Promise<UserLevelResponse>,
    enabled,
    staleTime: 1000 * 60 * 5
  })

  const loading = computed(
    () => isLoadingDetail.value || isLoadingSubcount.value || isLoadingLevel.value
  )
  const error = computed(() => errorDetail.value)
  const profile = computed(() => userDetail.value?.profile || null)
  const stats = computed(() => ({
    playlists: userSubcount.value?.createdPlaylistCount || 0,
    follows: profile.value?.follows || 0,
    followeds: profile.value?.followeds || 0,
    level: userLevel.value?.data?.level || 0,
    isVip: (profile.value?.vipType || 0) > 0
  }))

  return {
    userDetail: computed(() => userDetail.value ?? null),
    userSubcount: computed(() => userSubcount.value ?? null),
    userLevel: computed(() => userLevel.value ?? null),
    profile,
    stats,
    loading,
    error
  }
}
