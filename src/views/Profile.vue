<script setup>
// 个人中心：数据中心 + 键位分析 + 成就 + 打卡 + 个性化设置
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import {
  NCard, NTabs, NTabPane, NAvatar, NButton, NSpace, NTag, NEmpty, NSpin, NInput, NSlider,
  NRadioGroup, NRadioButton, NColorPicker, NSelect, NForm, NFormItem, useMessage, NGrid, NGi, NStatistic,
} from 'naive-ui'
import * as echarts from 'echarts'
import { supabase, dbAvailable } from '../lib/supabase'
import { useUserStore } from '../stores/user'
import { useSettingsStore, THEMES, FONT_SIZES } from '../stores/settings'
import { AVATAR_STYLES, avatarUrl } from '../lib/avatar'
import { SOUND_SCHEMES, playKey } from '../lib/sound'
import KeyboardView from '../components/KeyboardView.vue'

const message = useMessage()
const user = useUserStore()
const settings = useSettingsStore()

const loading = ref(true)
const taskRecs = ref([])
const logs = ref([])
const achievements = ref([])
const myAch = ref([])
const checkins = ref([])
const trendEl = ref(null)
let trendChart = null

onMounted(async () => {
  if (!(await dbAvailable())) { loading.value = false; return }
  try {
    const uid = user.user.id
    const [t, l, a, m, c] = await Promise.all([
      supabase.from('task_records').select('*, tasks(title)').eq('student_id', uid).order('submitted_at'),
      supabase.from('practice_logs').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('achievements').select('*').order('sort'),
      supabase.from('user_achievements').select('*').eq('user_id', uid),
      supabase.from('checkins').select('*').eq('user_id', uid),
    ])
    taskRecs.value = t.data || []
    logs.value = l.data || []
    achievements.value = a.data || []
    myAch.value = m.data || []
    checkins.value = c.data || []
  } finally {
    loading.value = false
    nextTick(renderTrend)
  }
})

// ---- 成绩趋势（CPM / 准确率 双轴） ----
const trendData = computed(() => {
  const rows = [
    ...taskRecs.value.map(r => ({ d: r.submitted_at, cpm: Number(r.cpm), acc: Number(r.accuracy), tag: '任务' })),
    ...logs.value.filter(r => r.kind === 'practice').map(r => ({ d: r.created_at, cpm: Number(r.cpm), acc: Number(r.accuracy), tag: '练习' })),
  ].sort((a, b) => new Date(a.d) - new Date(b.d))
  return rows.slice(-60)
})

function renderTrend() {
  if (!trendEl.value || !trendData.value.length) return
  trendChart = trendChart || echarts.init(trendEl.value)
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['CPM', '准确率'] },
    grid: { left: 50, right: 50, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: trendData.value.map(r => new Date(r.d).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })) },
    yAxis: [
      { type: 'value', name: 'CPM' },
      { type: 'value', name: '准确率%', min: 0, max: 100 },
    ],
    series: [
      { name: 'CPM', type: 'line', smooth: true, data: trendData.value.map(r => Math.round(r.cpm)), itemStyle: { color: settings.themeDef.primary } },
      { name: '准确率', type: 'line', smooth: true, yAxisIndex: 1, data: trendData.value.map(r => r.acc), itemStyle: { color: '#10b981' } },
    ],
  })
}
watch(trendData, () => nextTick(renderTrend))

const bestStats = computed(() => {
  const practice = logs.value.filter(l => l.kind === 'practice')
  const all = [...practice, ...taskRecs.value]
  return {
    bestCpm: Math.round(Math.max(0, ...all.map(r => Number(r.cpm)))),
    bestAcc: Math.max(0, ...all.map(r => Number(r.accuracy))).toFixed(1),
    total: practice.length + taskRecs.value.length,
    games: logs.value.filter(l => l.kind === 'game').length,
  }
})

// ---- 键位热力 ----
const errorKeyAgg = computed(() => {
  const agg = {}
  for (const l of logs.value) {
    for (const [k, n] of Object.entries(l.error_keys || {})) agg[k] = (agg[k] || 0) + n
  }
  return agg
})
const weakKeys = computed(() => Object.entries(errorKeyAgg.value)
  .filter(([k]) => /^[a-z0-9;,./'[\]\\=-]$/.test(k))
  .sort((a, b) => b[1] - a[1]).slice(0, 5))

// ---- 打卡日历（按月罗列，点亮打卡日） ----
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const monthCalendars = computed(() => {
  const map = Object.fromEntries(checkins.value.map(c => [c.day, Number(c.practice_sec)]))
  const today = new Date()
  const months = []
  for (let m = 5; m >= 0; m--) {  // 最近 6 个月，最新在前
    const first = new Date(today.getFullYear(), today.getMonth() - m, 1)
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    const cells = Array.from({ length: first.getDay() }, () => null)  // 周日起始留白
    let lit = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(first.getFullYear(), first.getMonth(), d)
      const key = ymd(dt)
      const sec = map[key] || 0
      if (sec) lit++
      cells.push({ d, key, sec, future: dt > today, today: key === ymd(today) })
    }
    months.unshift({ label: `${first.getFullYear()}年${first.getMonth() + 1}月`, cells, lit, total: daysInMonth })
  }
  return months
})
const streak = computed(() => {
  const set = new Set(checkins.value.map(c => c.day))
  let n = 0
  const d = new Date()
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1)
  while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
})

// ---- 成就 ----
const achByCat = computed(() => {
  const owned = new Set(myAch.value.map(a => a.achievement_id))
  const cats = {}
  for (const a of achievements.value) {
    if (a.hidden && !owned.has(a.id)) continue  // 隐藏成就未解锁不显示详情
    ;(cats[a.category] ||= []).push({ ...a, owned: owned.has(a.id) })
  }
  return cats
})
const hiddenLocked = computed(() => {
  const owned = new Set(myAch.value.map(a => a.achievement_id))
  return achievements.value.filter(a => a.hidden && !owned.has(a.id)).length
})

// ---- 个性化 ----
const avatarStyle = ref('adventurer')
const avatarSeed = ref(user.user?.name || 'me')
async function saveAvatar() {
  try {
    await user.saveProfile({ avatar: `${avatarStyle.value}:${avatarSeed.value}` })
    message.success('头像已更新')
  } catch (e) { message.error(e.message) }
}
const custom = ref({ primary: '#4F46E5', secondary: '#7C3AED', bg: '#eef2ff' })
function applyCustomTheme() {
  settings.set({ theme: 'custom', customTheme: { ...custom.value, dark: false, bg: custom.value.bg } })
}
const GRADIENTS = [
  'linear-gradient(135deg,#a5b4fc,#f0abfc)', 'linear-gradient(135deg,#67e8f9,#a5f3fc)',
  'linear-gradient(135deg,#fda4af,#fcd34d)', 'linear-gradient(135deg,#86efac,#67e8f9)',
  'linear-gradient(135deg,#1e293b,#3b0764)', 'linear-gradient(135deg,#fbcfe8,#e9d5ff)',
]
const BG_IMAGES = [
  { label: '山间晨雾', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1600&q=60' },
  { label: '海边日落', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=60' },
  { label: '城市夜景', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1600&q=60' },
  { label: '森林小径', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1600&q=60' },
  { label: '简约几何', url: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1600&q=60' },
  { label: '雪山星空', url: 'https://images.unsplash.com/photo-1483728642387-6c3bdd6c93e5?w=1600&q=60' },
]

// ---- 修改密码 ----
const pwd = ref({ old: '', n1: '', n2: '' })
async function changePwd() {
  if (!pwd.value.n1 || pwd.value.n1 !== pwd.value.n2) return message.warning('两次输入的新密码不一致')
  try {
    await user.changePassword(pwd.value.old, pwd.value.n1)
    message.success('密码修改成功')
    pwd.value = { old: '', n1: '', n2: '' }
  } catch (e) { message.error(e.message) }
}

function fmtSec(s) { return s >= 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}min` }
</script>

<template>
  <div>
    <n-space align="center" style="margin-bottom: 18px">
      <n-avatar round :size="64" :src="avatarUrl(user.user.avatar, user.user.name)" />
      <div>
        <h2 style="margin:0">{{ user.user.name }}</h2>
        <span style="opacity:.6;font-size:13px">
          {{ user.user.student_no }}{{ user.user.class_name ? ' · ' + user.user.class_name : '' }}
          <n-tag v-if="streak" size="tiny" round type="success" style="margin-left:6px">🔥 连续打卡 {{ streak }} 天</n-tag>
        </span>
      </div>
    </n-space>

    <n-spin :show="loading">
      <!-- display-directive=show: 切换标签保留 DOM，避免 ECharts 实例随节点销毁导致图表消失 -->
      <n-tabs type="line" size="large" :pane-style="{ paddingTop: '14px' }">
        <!-- 数据中心 -->
        <n-tab-pane name="data" tab="📊 数据中心" display-directive="show">
          <n-grid :cols="4" :x-gap="12" :y-gap="12" item-responsive responsive="screen" style="margin-bottom: 16px">
            <n-gi span="2 m:1"><n-card size="small"><n-statistic label="最佳速度" :value="bestStats.bestCpm"><template #suffix>CPM</template></n-statistic></n-card></n-gi>
            <n-gi span="2 m:1"><n-card size="small"><n-statistic label="最佳准确率" :value="bestStats.bestAcc"><template #suffix>%</template></n-statistic></n-card></n-gi>
            <n-gi span="2 m:1"><n-card size="small"><n-statistic label="练习次数" :value="bestStats.total" /></n-card></n-gi>
            <n-gi span="2 m:1"><n-card size="small"><n-statistic label="游戏局数" :value="bestStats.games" /></n-card></n-gi>
          </n-grid>

          <n-card title="成绩变化趋势（CPM / 准确率）" size="small" style="margin-bottom: 16px">
            <div v-if="trendData.length" ref="trendEl" style="height: 320px"></div>
            <n-empty v-else description="还没有练习记录" />
          </n-card>

          <n-card title="任务成绩" size="small">
            <n-empty v-if="!taskRecs.length" description="还没有任务成绩" />
            <div v-for="r in [...taskRecs].reverse().slice(0, 20)" :key="r.id" class="rec-row">
              <span class="rec-title">{{ r.tasks?.title || '任务' }}</span>
              <span>{{ Math.round(r.cpm) }} CPM</span>
              <span>{{ r.accuracy }}%</span>
              <span class="rec-date">{{ new Date(r.submitted_at).toLocaleString('zh-CN') }}</span>
            </div>
          </n-card>
        </n-tab-pane>

        <!-- 键位分析 -->
        <n-tab-pane name="keys" tab="⌨️ 键位分析">
          <n-card size="small" title="错误键位热力图（颜色越红错误越多）">
            <n-empty v-if="!Object.keys(errorKeyAgg).length" description="还没有错误数据，继续练习吧" />
            <template v-else>
              <KeyboardView :error-keys="errorKeyAgg" heatmap />
              <div style="margin-top: 16px" v-if="weakKeys.length">
                <b>薄弱键位专项推荐：</b>
                <n-tag v-for="[k, n] in weakKeys" :key="k" round type="error" style="margin: 0 4px">{{ k.toUpperCase() }} ×{{ n }}</n-tag>
                <p style="opacity:.65;font-size:13px">建议到「打字练习 → 键位练习」加强以上键位的专项训练。</p>
              </div>
            </template>
          </n-card>
        </n-tab-pane>

        <!-- 成就 -->
        <n-tab-pane name="ach" tab="🏅 成就徽章">
          <div v-for="(list, cat) in achByCat" :key="cat" style="margin-bottom: 16px">
            <h3 style="margin: 8px 0">{{ cat }}</h3>
            <div class="ach-grid">
              <n-card v-for="a in list" :key="a.id" size="small" class="ach-card" :class="{ locked: !a.owned }">
                <div class="ach-row">
                  <div class="ach-icon">{{ a.owned ? a.icon : '🔒' }}</div>
                  <div>
                    <div class="ach-title">{{ a.title }}</div>
                    <div class="ach-desc">{{ a.description }}</div>
                  </div>
                </div>
              </n-card>
            </div>
          </div>
          <p v-if="hiddenLocked" style="opacity:.5;font-size:13px">还有 {{ hiddenLocked }} 个隐藏成就等你发现…</p>
        </n-tab-pane>

        <!-- 打卡 -->
        <n-tab-pane name="checkin" tab="📅 打卡记录">
          <n-card size="small" style="margin-bottom: 14px">
            <n-space align="center" :size="40">
              <n-statistic label="🔥 连续打卡" :value="streak"><template #suffix>天</template></n-statistic>
              <n-statistic label="📆 累计打卡" :value="checkins.length"><template #suffix>天</template></n-statistic>
            </n-space>
            <p style="opacity:.55;font-size:12px;margin:10px 0 0">完成任意一次 ≥1 分钟的练习即自动打卡</p>
          </n-card>
          <div class="month-grid">
            <n-card v-for="m in monthCalendars" :key="m.label" size="small" class="month-card">
              <div class="month-head">
                <b>{{ m.label }}</b>
                <n-tag size="tiny" round :type="m.lit ? 'success' : 'default'">{{ m.lit }}/{{ m.total }} 天</n-tag>
              </div>
              <div class="weekday-row"><span v-for="w in ['日','一','二','三','四','五','六']" :key="w">{{ w }}</span></div>
              <div class="day-grid">
                <template v-for="(c, i) in m.cells" :key="i">
                  <div v-if="!c" class="day-cell empty"></div>
                  <div v-else class="day-cell" :class="{ lit: c.sec > 0, future: c.future, today: c.today }"
                    :style="c.sec ? { background: settings.themeDef.primary } : {}"
                    :title="`${c.key}${c.sec ? ' · 练习 ' + fmtSec(c.sec) : ''}`">{{ c.d }}</div>
                </template>
              </div>
            </n-card>
          </div>
        </n-tab-pane>

        <!-- 个性化设置 -->
        <n-tab-pane name="settings" tab="🎨 个性化">
          <n-card size="small" title="头像" style="margin-bottom: 14px">
            <n-space align="center">
              <n-avatar round :size="64" :src="avatarUrl(`${avatarStyle}:${avatarSeed}`)" />
              <n-button size="small" @click="avatarSeed = user.user.name + Math.floor(Math.random() * 1000)">🎲 随机</n-button>
              <n-button size="small" type="primary" @click="saveAvatar">保存头像</n-button>
            </n-space>
            <n-space style="margin-top: 10px" :size="6">
              <n-button v-for="s in AVATAR_STYLES" :key="s.key" size="tiny" round
                :type="avatarStyle === s.key ? 'primary' : 'default'" @click="avatarStyle = s.key">{{ s.label }}</n-button>
            </n-space>
          </n-card>

          <n-card size="small" title="主题" style="margin-bottom: 14px">
            <div class="theme-grid">
              <div v-for="t in THEMES" :key="t.key" class="theme-chip" :class="{ active: settings.theme === t.key }"
                :style="{ background: t.bg, color: t.dark ? '#fff' : '#333' }" @click="settings.set({ theme: t.key })">
                <span class="dot" :style="{ background: t.primary }"></span>{{ t.icon }} {{ t.label }}
              </div>
            </div>
            <div style="margin-top: 14px">
              <b>自定义主题：</b>
              <div class="custom-theme">
                <div class="ct-item"><span class="ct-label">主色</span><n-color-picker v-model:value="custom.primary" :show-alpha="false" /></div>
                <div class="ct-item"><span class="ct-label">辅色</span><n-color-picker v-model:value="custom.secondary" :show-alpha="false" /></div>
                <div class="ct-item"><span class="ct-label">背景</span><n-color-picker v-model:value="custom.bg" :show-alpha="false" /></div>
                <n-button size="small" type="primary" @click="applyCustomTheme">应用</n-button>
              </div>
            </div>
          </n-card>

          <n-card size="small" title="背景" style="margin-bottom: 14px">
            <n-radio-group v-model:value="settings.bgMode" @update:value="v => settings.set({ bgMode: v })" size="small">
              <n-radio-button value="theme">跟随主题</n-radio-button>
              <n-radio-button value="color">纯色</n-radio-button>
              <n-radio-button value="gradient">渐变</n-radio-button>
              <n-radio-button value="image">图片</n-radio-button>
            </n-radio-group>
            <div style="margin-top: 12px">
              <n-color-picker v-if="settings.bgMode === 'color'" :value="settings.bgColor" :show-alpha="false"
                @update:value="v => settings.set({ bgColor: v })" style="width: 140px" />
              <n-space v-else-if="settings.bgMode === 'gradient'">
                <div v-for="g in GRADIENTS" :key="g" class="grad-chip" :style="{ background: g }"
                  :class="{ active: settings.bgGradient === g }" @click="settings.set({ bgGradient: g })"></div>
              </n-space>
              <template v-else-if="settings.bgMode === 'image'">
                <n-space>
                  <div v-for="img in BG_IMAGES" :key="img.url" class="img-chip"
                    :style="{ backgroundImage: `url(${img.url})` }" :class="{ active: settings.bgImage === img.url }"
                    @click="settings.set({ bgImage: img.url })" :title="img.label"></div>
                </n-space>
                <n-input :value="settings.bgImage" placeholder="或粘贴在线图片 URL"
                  @update:value="v => settings.set({ bgImage: v })" style="margin-top: 10px; max-width: 420px" />
                <div style="margin-top: 10px; max-width: 300px">
                  背景模糊度：<n-slider :value="settings.bgBlur" :max="20" @update:value="v => settings.set({ bgBlur: v })" />
                </div>
              </template>
            </div>
          </n-card>

          <n-card size="small" title="键盘音效 / 字体" style="margin-bottom: 14px">
            <n-space vertical>
              <n-space align="center">
                <span style="width: 80px">键盘音效</span>
                <n-radio-group :value="settings.sound" size="small" @update:value="v => { settings.set({ sound: v }); playKey(v, true) }">
                  <n-radio-button v-for="s in SOUND_SCHEMES" :key="s.key" :value="s.key">{{ s.label }}</n-radio-button>
                </n-radio-group>
              </n-space>
              <n-space align="center">
                <span style="width: 80px">字体大小</span>
                <n-radio-group :value="settings.fontSize" size="small" @update:value="v => settings.set({ fontSize: v })">
                  <n-radio-button v-for="f in FONT_SIZES" :key="f.key" :value="f.key">{{ f.label }}</n-radio-button>
                </n-radio-group>
              </n-space>
              <n-space align="center">
                <span style="width: 80px">行间距</span>
                <div style="width: 200px"><n-slider :value="settings.lineHeight" :min="1.2" :max="2.6" :step="0.1" @update:value="v => settings.set({ lineHeight: v })" /></div>
              </n-space>
              <n-space align="center">
                <span style="width: 80px">打字字体</span>
                <n-select :value="settings.fontFamily" style="width: 260px" @update:value="v => settings.set({ fontFamily: v })"
                  :options="[
                    { label: 'JetBrains Mono（等宽推荐）', value: `'JetBrains Mono', 'Noto Sans SC', monospace` },
                    { label: '系统等宽', value: `Menlo, Consolas, 'Noto Sans SC', monospace` },
                    { label: 'Inter / 思源黑体', value: `'Inter', 'Noto Sans SC', sans-serif` },
                  ]" />
              </n-space>
            </n-space>
          </n-card>

          <n-card size="small" title="修改密码">
            <n-form inline>
              <n-form-item label="原密码"><n-input v-model:value="pwd.old" type="password" show-password-on="click" /></n-form-item>
              <n-form-item label="新密码"><n-input v-model:value="pwd.n1" type="password" show-password-on="click" /></n-form-item>
              <n-form-item label="确认新密码"><n-input v-model:value="pwd.n2" type="password" show-password-on="click" /></n-form-item>
              <n-form-item><n-button type="primary" @click="changePwd">修改</n-button></n-form-item>
            </n-form>
          </n-card>
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<style scoped>
.rec-row { display: flex; gap: 18px; padding: 8px 4px; border-bottom: 1px solid rgba(127,127,127,.1); font-size: 14px; }
.rec-title { font-weight: 600; flex: 1; }
.rec-date { opacity: .5; font-size: 12px; }
.ach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.ach-card.locked { opacity: .45; filter: grayscale(1); }
.ach-row { display: flex; align-items: center; gap: 12px; }
.ach-icon { font-size: 30px; }
.ach-title { font-weight: 700; }
.ach-desc { font-size: 12px; opacity: .6; margin-top: 2px; }
.custom-theme { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 10px; }
.ct-item { display: flex; align-items: center; gap: 8px; }
.ct-item :deep(.n-color-picker) { width: 110px; }
.ct-label { white-space: nowrap; font-size: 13px; }
.month-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.month-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.weekday-row { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center;
  font-size: 11px; opacity: .5; margin-bottom: 4px; }
.day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.day-cell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 6px; font-size: 12px; background: rgba(127,127,127,.1); }
.day-cell.empty { background: transparent; }
.day-cell.lit { color: #fff; font-weight: 700; }
.day-cell.future { opacity: .25; background: transparent; }
.day-cell.today { outline: 2px solid var(--kp-primary); }
.theme-grid { display: flex; flex-wrap: wrap; gap: 10px; }
.theme-chip { padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600;
  border: 2px solid transparent; display: flex; align-items: center; gap: 6px; }
.theme-chip.active { border-color: var(--kp-primary); }
.theme-chip .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.grad-chip, .img-chip { width: 72px; height: 44px; border-radius: 8px; cursor: pointer; border: 2px solid transparent;
  background-size: cover; background-position: center; }
.grad-chip.active, .img-chip.active { border-color: var(--kp-primary); }
</style>
