<script setup>
import { useUserData } from '../../composables/useUserData'
import { watch } from 'vue'

const props = defineProps({
  userId: {
    type: [String, Number],
    required: true,
  },
  avatarUrl: {
    type: String,
    default: '',
  },
  nickname: {
    type: String,
    default: '',
  },
})

const { profile, stats, userDetail, loadUserData } = useUserData(props.userId)

// Load data when userId changes
watch(() => props.userId, (newId) => {
  if (newId) loadUserData()
}, { immediate: true })
</script>

<template>
  <section class="user-profile-section">
    <div 
      class="user-profile-bg" 
      :class="{ 'has-custom-bg': profile?.backgroundUrl }"
      :style="profile?.backgroundUrl ? { 
        backgroundImage: `linear-gradient(135deg, rgba(255, 126, 95, 0.3), rgba(254, 180, 123, 0.3)), url(${profile.backgroundUrl})` 
      } : {}"
    ></div>
    <div class="user-profile-info">
      <div class="user-avatar-container">
        <img 
          v-if="avatarUrl" 
          :src="avatarUrl" 
          :alt="nickname" 
          class="user-avatar"
        />
      </div>
      <div class="user-details">
        <div class="user-name-row">
          <h1 class="user-nickname">{{ profile?.nickname || nickname || '未知用户' }}</h1>
          <span v-if="stats.level" class="user-level">Lv.{{ stats.level }}</span>
          <svg v-if="stats.isVip" class="vip-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
        </div>
        <div class="user-stats">
          <div class="stat-item">
            <span class="stat-value">{{ stats.playlists }}</span>
            <span class="stat-label">歌单</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ stats.follows }}</span>
            <span class="stat-label">关注</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ stats.followeds }}</span>
            <span class="stat-label">粉丝</span>
          </div>
        </div>
        <p v-if="profile?.signature" class="user-signature">{{ profile.signature }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.user-profile-section {
  position: relative;
  margin-bottom: 32px;
}

.user-profile-bg {
  height: 280px;
  background-image: linear-gradient(135deg, #ff7e5f, #feb47b);
  background-size: cover;
  background-position: center;
  position: relative;
}

.user-profile-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%);
}

.user-profile-bg.has-custom-bg {
  animation: none;
}

.user-profile-info {
  max-width: 1200px;
  margin: -80px auto 0;
  padding: 0 20px 24px;
  display: flex;
  align-items: flex-end;
  gap: 24px;
  position: relative;
  z-index: 10;
}

.user-avatar-container {
  flex-shrink: 0;
}

.user-avatar {
  width: 160px;
  height: 160px;
  border-radius: 12px;
  border: 4px solid var(--white);
  object-fit: cover;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  background: var(--white);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.user-avatar:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.user-details {
  flex: 1;
  padding-bottom: 12px;
  color: var(--black);
  min-width: 0;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.user-nickname {
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 800;
  color: var(--black);
  letter-spacing: -0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-level {
  padding: 4px 10px;
  background: linear-gradient(135deg, #ffd700, #ff8c00);
  color: var(--white);
  font-size: 12px;
  font-weight: 700;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(255, 140, 0, 0.3);
}

.vip-icon {
  color: #ff4757;
  filter: drop-shadow(0 2px 4px rgba(255, 71, 87, 0.3));
}

.user-stats {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  border-radius: 8px;
  transition: background 0.2s ease;
  cursor: pointer;
}

.stat-item:hover {
  background: var(--bg-dark);
}

.stat-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--black);
  line-height: 1.2;
}

.stat-label {
  font-size: 12px;
  color: var(--gray);
  margin-top: 2px;
}

.stat-divider {
  width: 1px;
  height: 32px;
  background: linear-gradient(to bottom, transparent, var(--gray-light), transparent);
}

.user-signature {
  margin: 0;
  font-size: 14px;
  color: var(--gray);
  max-width: 600px;
}

@media (max-width: 768px) {
  .user-profile-bg {
    height: 200px;
  }

  .user-profile-info {
    flex-direction: column;
    align-items: center;
    text-align: center;
    margin-top: -50px;
  }

  .user-avatar {
    width: 100px;
    height: 100px;
    border-radius: 8px;
  }

  .user-nickname {
    font-size: 22px;
  }

  .user-name-row {
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .user-stats {
    gap: 8px;
  }

  .stat-item {
    padding: 6px 12px;
  }

  .stat-value {
    font-size: 18px;
  }
}
</style>
