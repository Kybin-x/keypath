<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NConfigProvider, NMessageProvider, NDialogProvider, NLayout, NLayoutSider, NLayoutHeader,
  NLayoutContent, NMenu, NButton, NDropdown, NAvatar, darkTheme, zhCN, dateZhCN,
} from 'naive-ui'
import { useUserStore } from './stores/user'
import { useSettingsStore } from './stores/settings'
import { avatarUrl } from './lib/avatar'

const user = useUserStore()
const settings = useSettingsStore()
const route = useRoute()
const router = useRouter()
const collapsed = ref(window.innerWidth < 900)

const menuOptions = computed(() => {
  const m = [
    { label: '🏠 首页', key: '/' },
    { label: '⌨️ 打字练习', key: '/practice' },
    { label: '🎮 打字游戏', key: '/games' },
  ]
  if (user.isLogin && !user.isTeacher) m.push({ label: '📋 我的任务', key: '/tasks' })
  m.push({ label: '🏆 排行榜', key: '/leaderboard' })
  if (user.isLogin) m.push({ label: '👤 个人中心', key: '/profile' })
  if (user.isTeacher) m.push({ label: '🛠️ 教学管理', key: '/admin' })
  return m
})

const userOptions = computed(() => user.isLogin
  ? [{ label: '个人中心', key: 'profile' }, { label: '退出登录', key: 'logout' }]
  : [{ label: '登录', key: 'login' }])

function onUserSelect(key) {
  if (key === 'logout') { user.logout(); router.push('/') }
  else if (key === 'login') router.push('/login')
  else router.push('/profile')
}

const theme = computed(() => settings.isDark ? darkTheme : null)
const bgStyle = computed(() => {
  const s = { background: settings.background }
  return s
})
const blurStyle = computed(() => settings.bgMode === 'image' && settings.bgBlur > 0
  ? { backdropFilter: `blur(${settings.bgBlur}px)` } : {})

watch(() => settings.themeDef, t => {
  document.documentElement.style.setProperty('--kp-primary', t.primary)
  document.documentElement.style.setProperty('--kp-secondary', t.secondary)
}, { immediate: true })

// 登录后同步个人设置
watch(() => user.user?.id, id => { if (id) settings.loadRemote(id) }, { immediate: true })
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="settings.naiveOverrides" :locale="zhCN" :date-locale="dateZhCN" style="height: 100%">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-bg" :style="bgStyle">
          <div class="app-blur" :style="blurStyle">
            <n-layout style="height: 100vh; background: transparent">
              <n-layout-header class="header" bordered>
                <div class="logo" @click="router.push('/')">
                  <span class="logo-icon">⌨️</span>
                  <span class="logo-text">键途 <small>KeyPath</small></span>
                </div>
                <div class="header-right">
                  <template v-if="user.isLogin">
                    <n-dropdown :options="userOptions" @select="onUserSelect">
                      <div class="user-chip">
                        <n-avatar round size="small" :src="avatarUrl(user.user.avatar, user.user.name)" />
                        <span class="uname">{{ user.user.name }}</span>
                        <span v-if="user.user.class_name" class="uclass">{{ user.user.class_name }}</span>
                        <span v-if="user.isTeacher" class="uclass">{{ user.isSuper ? '超级管理员' : '教师' }}</span>
                      </div>
                    </n-dropdown>
                  </template>
                  <n-button v-else type="primary" size="small" round @click="router.push('/login')">登录</n-button>
                </div>
              </n-layout-header>
              <n-layout has-sider style="height: calc(100vh - 56px); background: transparent">
                <n-layout-sider bordered collapse-mode="width" :collapsed-width="56" :width="190"
                  :collapsed="collapsed" show-trigger @collapse="collapsed = true" @expand="collapsed = false"
                  :native-scrollbar="false" style="background: transparent">
                  <n-menu :value="route.path" :options="menuOptions" :collapsed="collapsed"
                    :collapsed-width="56" @update:value="k => router.push(k)" />
                </n-layout-sider>
                <n-layout-content :native-scrollbar="false" content-style="padding: 20px; min-height: 100%" style="background: transparent">
                  <router-view />
                </n-layout-content>
              </n-layout>
            </n-layout>
          </div>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.app-bg { height: 100vh; background-attachment: fixed !important; }
.app-blur { height: 100%; }
.header { height: 56px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; background: transparent; }
.logo { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.logo-icon { font-size: 24px; }
.logo-text { font-size: 20px; font-weight: 700;
  background: linear-gradient(90deg, var(--kp-primary), var(--kp-secondary));
  -webkit-background-clip: text; background-clip: text; color: transparent; }
.logo-text small { font-size: 12px; font-weight: 500; }
.header-right { display: flex; align-items: center; gap: 12px; }
.user-chip { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 10px;
  border-radius: 20px; background: rgba(127,127,127,.1); }
.uname { font-weight: 600; font-size: 14px; }
.uclass { font-size: 12px; opacity: .6; }
</style>
