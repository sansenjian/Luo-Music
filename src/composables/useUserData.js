import { ref, computed } from 'vue'
import { getUserDetail, getUserSubcount, getUserLevel } from '../api/user'

export function useUserData(userId) {
  const userDetail = ref(null)
  const userSubcount = ref(null)
  const userLevel = ref(null)
  const loading = ref(false)
  const error = ref(null)

  const profile = computed(() => userDetail.value?.profile || null)
  
  const stats = computed(() => ({
    playlists: userSubcount.value?.createdPlaylistCount || 0,
    follows: profile.value?.follows || 0,
    followeds: profile.value?.followeds || 0,
    level: userLevel.value?.data?.level || 0,
    isVip: profile.value?.vipType > 0,
  }))

  const loadUserData = async () => {
    if (!userId) return
    
    loading.value = true
    error.value = null
    
    try {
      const [detailRes, subcountRes, levelRes] = await Promise.all([
        getUserDetail(userId).catch(e => {
          console.error('获取用户详情失败:', e)
          return null
        }),
        getUserSubcount().catch(e => {
          console.error('获取用户订阅数失败:', e)
          return null
        }),
        getUserLevel().catch(e => {
          console.error('获取用户等级失败:', e)
          return null
        }),
      ])
      
      if (detailRes) userDetail.value = detailRes
      if (subcountRes) userSubcount.value = subcountRes
      if (levelRes) userLevel.value = levelRes
    } catch (e) {
      error.value = e
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
    loadUserData,
  }
}
