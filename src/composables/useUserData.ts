import { computed, ref, type ComputedRef, type Ref } from 'vue'

import { getUserDetail, getUserLevel, getUserSubcount } from '../api/user'

interface UserProfile {
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

export interface UserStats {
  playlists: number
  follows: number
  followeds: number
  level: number
  isVip: boolean
}

export interface UseUserDataReturn {
  userDetail: Ref<UserDetailResponse | null>
  userSubcount: Ref<UserSubcountResponse | null>
  userLevel: Ref<UserLevelResponse | null>
  profile: ComputedRef<UserProfile | null>
  stats: ComputedRef<UserStats>
  loading: Ref<boolean>
  error: Ref<unknown>
  loadUserData: () => Promise<void>
}

export function useUserData(userId: string | number | null): UseUserDataReturn {
  const userDetail = ref<UserDetailResponse | null>(null)
  const userSubcount = ref<UserSubcountResponse | null>(null)
  const userLevel = ref<UserLevelResponse | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)

  const profile = computed(() => userDetail.value?.profile || null)
  const stats = computed(() => ({
    playlists: userSubcount.value?.createdPlaylistCount || 0,
    follows: profile.value?.follows || 0,
    followeds: profile.value?.followeds || 0,
    level: userLevel.value?.data?.level || 0,
    isVip: (profile.value?.vipType || 0) > 0
  }))

  const loadUserData = async (): Promise<void> => {
    if (!userId) {
      return
    }

    loading.value = true
    error.value = null

    try {
      const numericUserId = Number(userId)
      const [detail, subcount, level] = await Promise.all([
        getUserDetail(numericUserId).catch(requestError => {
          console.error('获取用户详情失败:', requestError)
          return null
        }),
        getUserSubcount().catch(requestError => {
          console.error('获取用户订阅数失败:', requestError)
          return null
        }),
        getUserLevel().catch(requestError => {
          console.error('获取用户等级失败:', requestError)
          return null
        })
      ])

      if (detail) {
        userDetail.value = detail as UserDetailResponse
      }
      if (subcount) {
        userSubcount.value = subcount as UserSubcountResponse
      }
      if (level) {
        userLevel.value = level as UserLevelResponse
      }
    } catch (requestError) {
      error.value = requestError
    } finally {
      loading.value = false
    }
  }

  return {
    userDetail,
    userSubcount,
    userLevel,
    profile,
    stats,
    loading,
    error,
    loadUserData
  }
}
