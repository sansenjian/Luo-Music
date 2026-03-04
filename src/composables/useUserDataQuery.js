import { useQuery } from '@tanstack/vue-query'
import { computed, toValue } from 'vue'
import { getUserDetail, getUserSubcount, getUserLevel } from '../api/user'

export function useUserDataQuery(userIdSource) {
  const userId = computed(() => toValue(userIdSource))
  const enabled = computed(() => !!userId.value)

  // 1. 获取用户详情
  const { 
    data: userDetail, 
    isLoading: isLoadingDetail, 
    error: errorDetail 
  } = useQuery({
    queryKey: ['user', 'detail', userId],
    queryFn: () => getUserDetail(userId.value),
    enabled,
    staleTime: 1000 * 60 * 5, // 5分钟缓存
  })

  // 2. 获取用户订阅数量
  const { 
    data: userSubcount, 
    isLoading: isLoadingSubcount 
  } = useQuery({
    queryKey: ['user', 'subcount', userId],
    queryFn: () => getUserSubcount(),
    enabled,
    staleTime: 1000 * 60 * 5,
  })

  // 3. 获取用户等级
  const { 
    data: userLevel, 
    isLoading: isLoadingLevel 
  } = useQuery({
    queryKey: ['user', 'level', userId],
    queryFn: () => getUserLevel(),
    enabled,
    staleTime: 1000 * 60 * 5,
  })

  // 聚合状态
  const loading = computed(() => 
    isLoadingDetail.value || isLoadingSubcount.value || isLoadingLevel.value
  )
  
  const error = computed(() => errorDetail.value)

  // 计算属性
  const profile = computed(() => userDetail.value?.profile || null)

  const stats = computed(() => ({
    playlists: userSubcount.value?.createdPlaylistCount || 0,
    follows: profile.value?.follows || 0,
    followeds: profile.value?.followeds || 0,
    level: userLevel.value?.data?.level || 0,
    isVip: profile.value?.vipType > 0,
  }))

  return {
    userDetail,
    userSubcount,
    userLevel,
    profile,
    stats,
    loading,
    error
  }
}
