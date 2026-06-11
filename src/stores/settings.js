import { defineStore } from 'pinia'
import { supabase, dbAvailable } from '../lib/supabase'

export const THEMES = [
  { key: 'default', label: '活力蓝紫', icon: '💜', primary: '#4F46E5', secondary: '#7C3AED', dark: false, bg: 'linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%)' },
  { key: 'sakura', label: '樱花粉', icon: '🌸', primary: '#EC4899', secondary: '#F472B6', dark: false, bg: 'linear-gradient(135deg,#fdf2f8 0%,#fce7f3 100%)' },
  { key: 'ocean', label: '深海蓝', icon: '🌊', primary: '#0369A1', secondary: '#0EA5E9', dark: false, bg: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)' },
  { key: 'green', label: '清新绿', icon: '🌿', primary: '#059669', secondary: '#34D399', dark: false, bg: 'linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%)' },
  { key: 'purple-night', label: '暗夜紫', icon: '🌙', primary: '#A78BFA', secondary: '#C4B5FD', dark: true, bg: 'linear-gradient(135deg,#1e1b2e 0%,#2d2640 100%)' },
  { key: 'orange', label: '活力橙', icon: '☀️', primary: '#EA580C', secondary: '#FB923C', dark: false, bg: 'linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)' },
  { key: 'white', label: '极地白', icon: '❄️', primary: '#475569', secondary: '#94A3B8', dark: false, bg: '#f8fafc' },
  { key: 'cyber', label: '赛博朋克', icon: '🎮', primary: '#06B6D4', secondary: '#F0ABFC', dark: true, bg: 'linear-gradient(135deg,#0f172a 0%,#1a0b2e 100%)' },
  { key: 'autumn', label: '秋日暖', icon: '🍂', primary: '#B45309', secondary: '#D97706', dark: false, bg: 'linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)' },
  { key: 'rainbow', label: '彩虹糖', icon: '🌈', primary: '#D946EF', secondary: '#38BDF8', dark: false, bg: 'linear-gradient(135deg,#fdf4ff 0%,#ecfeff 50%,#fef9c3 100%)' },
  { key: 'dark', label: '暗黑', icon: '🖤', primary: '#6366F1', secondary: '#818CF8', dark: true, bg: '#111114' },
]

export const FONT_SIZES = [
  { key: 'small', label: '小', px: 18 },
  { key: 'medium', label: '中', px: 24 },
  { key: 'large', label: '大', px: 30 },
  { key: 'xlarge', label: '特大', px: 38 },
]

const DEFAULTS = {
  theme: 'default',
  customTheme: null,       // {primary, secondary, bg}
  bgMode: 'theme',         // theme | color | gradient | image
  bgColor: '#eef2ff',
  bgGradient: 'linear-gradient(135deg,#a5b4fc,#f0abfc)',
  bgImage: '',
  bgBlur: 0,
  sound: 'mech',
  fontSize: 'medium',
  fontFamily: "'JetBrains Mono', 'Noto Sans SC', monospace",
  lineHeight: 1.8,
  layout: 'center',        // center | wide | zen
}

const KEY = 'keypath_settings'

export const useSettingsStore = defineStore('settings', {
  state: () => ({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }),
  getters: {
    themeDef(s) {
      const t = THEMES.find(t => t.key === s.theme) || THEMES[0]
      if (s.theme === 'custom' && s.customTheme) return { ...THEMES[0], ...s.customTheme, key: 'custom', label: '自定义' }
      return t
    },
    isDark() { return this.themeDef.dark },
    fontPx: s => (FONT_SIZES.find(f => f.key === s.fontSize) || FONT_SIZES[1]).px,
    background() {
      const s = this
      if (s.bgMode === 'color') return s.bgColor
      if (s.bgMode === 'gradient') return s.bgGradient
      if (s.bgMode === 'image' && s.bgImage) return `url(${s.bgImage}) center/cover fixed`
      return this.themeDef.bg
    },
    naiveOverrides() {
      const t = this.themeDef
      return {
        common: {
          primaryColor: t.primary, primaryColorHover: t.secondary,
          primaryColorPressed: t.primary, primaryColorSuppl: t.secondary,
          borderRadius: '8px', cardBorderRadius: '12px',
          fontFamily: "'Inter','Noto Sans SC',sans-serif",
        },
      }
    },
  },
  actions: {
    set(patch) {
      Object.assign(this, patch)
      this.persist()
    },
    persist() {
      const data = {}
      for (const k of Object.keys(DEFAULTS)) data[k] = this[k]
      localStorage.setItem(KEY, JSON.stringify(data))
      this.syncRemote(data)
    },
    async syncRemote(data) {
      try {
        const { useUserStore } = await import('./user')
        const u = useUserStore()
        if (!u.isLogin || !(await dbAvailable())) return
        await supabase.from('user_settings').upsert({ user_id: u.user.id, data, updated_at: new Date().toISOString() })
      } catch { /* 离线忽略 */ }
    },
    async loadRemote(userId) {
      try {
        if (!(await dbAvailable())) return
        const { data } = await supabase.from('user_settings').select('data').eq('user_id', userId).maybeSingle()
        if (data?.data) { Object.assign(this, { ...DEFAULTS, ...data.data }); localStorage.setItem(KEY, JSON.stringify(data.data)) }
      } catch { /* ignore */ }
    },
  },
})
