<script setup>
// 排行榜：全体 / 班级 / 游戏 / 进步之星
import { ref, computed, onMounted } from 'vue'
import { NCard, NTabs, NTabPane, NRadioGroup, NRadioButton, NSpace, NAvatar, NTag, NEmpty, NSpin, NSelect } from 'naive-ui'
import { supabase, dbAvailable } from '../lib/supabase'
import { useUserStore } from '../stores/user'
import { avatarUrl } from '../lib/avatar'

const user = useUserStore()
const loading = ref(true)
const dbOk = ref(true)
const users = ref([])      // 公开用户信息
const classes = ref([])
const logs = ref([])       // practice_logs（练习+游戏）
const taskRecs = ref([])
const achCount = ref({})

const period = ref('week') // week | month | all
const metric = ref('cpm')  // cpm | accuracy | composite
const langFilter2 = ref('all') // all | zh | en
const matchLang = r => langFilter2.value === 'all' || r.lang === langFilter2.value
const gameFilter = ref('space')
const classFilter = ref(null)

const GAMES = [
  { label: '🚀 太空射击', value: 'space' }, { label: '🌊 文字消消乐', value: 'crush' },
  { label: '🏃 赛跑竞速', value: 'race' }, { label: '💣 拆弹游戏', value: 'bomb' },
  { label: '🐍 文字冒险', value: 'quest' }, { label: '🎯 打地鼠', value: 'mole' },
]

onMounted(async () => {
  dbOk.value = await dbAvailable()
  if (!dbOk.value) { loading.value = false; return }
  try {
    const [u, c, l, t, a] = await Promise.all([
      supabase.from('users').select('id, name, student_no, class_id, avatar, role').eq('role', 'student'),
      supabase.from('classes').select('*'),
      supabase.from('practice_logs').select('user_id, kind, game, lang, cpm, wpm, accuracy, score, created_at').order('created_at', { ascending: false }).limit(5000),
      supabase.from('task_records').select('student_id, lang, cpm, wpm, accuracy, submitted_at').order('submitted_at', { ascending: false }).limit(5000),
      supabase.from('user_achievements').select('user_id'),
    ])
    users.value = u.data || []
    classes.value = c.data || []
    logs.value = l.data || []
    taskRecs.value = t.data || []
    for (const r of a.data || []) achCount.value[r.user_id] = (achCount.value[r.user_id] || 0) + 1
    if (user.user?.class_id) classFilter.value = user.user.class_id
    else classFilter.value = classes.value[0]?.id || null
  } finally { loading.value = false }
})

function inPeriod(dateStr, p = period.value) {
  if (p === 'all') return true
  const d = new Date(dateStr)
  const days = p === 'week' ? 7 : 30
  return Date.now() - d.getTime() < days * 86400000
}

const userMap = computed(() => Object.fromEntries(users.value.map(u => [u.id, u])))
const classMap = computed(() => Object.fromEntries(classes.value.map(c => [c.id, c.name])))

// 综合榜：每个学生取周期内最佳（练习 + 任务）
function buildBoard(classId = null) {
  const best = {}
  const add = (uid, cpm, acc) => {
    if (!userMap.value[uid]) return
    if (classId && userMap.value[uid].class_id !== classId) return
    const cur = best[uid] || { cpm: 0, accuracy: 0 }
    best[uid] = { cpm: Math.max(cur.cpm, Number(cpm)), accuracy: Math.max(cur.accuracy, Number(acc)) }
  }
  // 英文榜按 WPM 排序展示，中文/全部按 CPM
  const speedOf = r => langFilter2.value === 'en' ? Number(r.wpm || 0) : Number(r.cpm)
  for (const r of logs.value) if (r.kind === 'practice' && inPeriod(r.created_at) && matchLang(r)) add(r.user_id, speedOf(r), r.accuracy)
  for (const r of taskRecs.value) if (inPeriod(r.submitted_at) && matchLang(r)) add(r.student_id, speedOf(r), r.accuracy)
  const rows = Object.entries(best).map(([uid, b]) => ({
    user: userMap.value[uid], ...b,
    composite: b.cpm * (b.accuracy / 100),
    badges: achCount.value[uid] || 0,
  }))
  rows.sort((a, b) => b[metric.value] - a[metric.value])
  return rows.slice(0, 50)
}

const globalBoard = computed(() => buildBoard(null))
const classBoard = computed(() => classFilter.value ? buildBoard(classFilter.value) : [])

const gameBoard = computed(() => {
  const best = {}
  for (const r of logs.value) {
    if (r.kind !== 'game' || r.game !== gameFilter.value || !inPeriod(r.created_at)) continue
    if (!userMap.value[r.user_id]) continue
    best[r.user_id] = Math.max(best[r.user_id] || 0, Number(r.score))
  }
  return Object.entries(best).map(([uid, score]) => ({ user: userMap.value[uid], score }))
    .sort((a, b) => b.score - a.score).slice(0, 50)
})

// 进步之星：本周期 vs 上一周期平均 CPM 提升
const progressBoard = computed(() => {
  const days = period.value === 'month' ? 30 : 7
  const now = Date.now()
  const agg = {}  // uid -> {cur: [], prev: []}
  const add = (uid, cpm, dateStr) => {
    if (!userMap.value[uid] || !cpm) return
    const age = (now - new Date(dateStr).getTime()) / 86400000
    const a = agg[uid] ||= { cur: [], prev: [] }
    if (age < days) a.cur.push(Number(cpm))
    else if (age < days * 2) a.prev.push(Number(cpm))
  }
  for (const r of logs.value) if (r.kind === 'practice' && matchLang(r)) add(r.user_id, r.cpm, r.created_at)
  for (const r of taskRecs.value) if (matchLang(r)) add(r.student_id, r.cpm, r.submitted_at)
  const avg = arr => arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0
  return Object.entries(agg)
    .filter(([, a]) => a.cur.length && a.prev.length)
    .map(([uid, a]) => ({ user: userMap.value[uid], gain: Math.round(avg(a.cur) - avg(a.prev)), cur: Math.round(avg(a.cur)) }))
    .filter(r => r.gain > 0)
    .sort((a, b) => b.gain - a.gain).slice(0, 20)
})

const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}`
</script>

<template>
  <div>
    <h2 style="margin-top:0">🏆 排行榜</h2>
    <n-card v-if="!dbOk">⚠️ 数据库未初始化，暂无排行数据。</n-card>
    <n-spin v-else :show="loading">
      <n-space style="margin-bottom: 14px" align="center">
        <n-radio-group v-model:value="period" size="small">
          <n-radio-button value="week">周榜</n-radio-button>
          <n-radio-button value="month">月榜</n-radio-button>
          <n-radio-button value="all">总榜</n-radio-button>
        </n-radio-group>
        <n-radio-group v-model:value="metric" size="small">
          <n-radio-button value="cpm">按速度</n-radio-button>
          <n-radio-button value="accuracy">按准确率</n-radio-button>
          <n-radio-button value="composite">综合评分</n-radio-button>
        </n-radio-group>
        <n-radio-group v-model:value="langFilter2" size="small">
          <n-radio-button value="all">全部语言</n-radio-button>
          <n-radio-button value="zh">中文（CPM）</n-radio-button>
          <n-radio-button value="en">英文（WPM）</n-radio-button>
        </n-radio-group>
      </n-space>

      <n-tabs type="line" size="large">
        <n-tab-pane name="global" tab="🌍 全体排行">
          <BoardTable :rows="globalBoard" :metric="metric" :unit="langFilter2 === 'en' ? 'WPM' : 'CPM'" :class-map="classMap" :me="user.user?.id" :medal="medal" />
        </n-tab-pane>
        <n-tab-pane name="class" tab="🏫 班级排行">
          <n-select v-model:value="classFilter" :options="classes.map(c => ({ label: c.name, value: c.id }))"
            style="width: 200px; margin-bottom: 12px" placeholder="选择班级" />
          <BoardTable :rows="classBoard" :metric="metric" :unit="langFilter2 === 'en' ? 'WPM' : 'CPM'" :class-map="classMap" :me="user.user?.id" :medal="medal" />
        </n-tab-pane>
        <n-tab-pane name="game" tab="🎮 游戏排行">
          <n-select v-model:value="gameFilter" :options="GAMES" style="width: 200px; margin-bottom: 12px" />
          <n-empty v-if="!gameBoard.length" description="该游戏暂无记录" />
          <div v-else>
            <div v-for="(r, i) in gameBoard" :key="r.user.id" class="row" :class="{ me: r.user.id === me }">
              <span class="rank">{{ medal(i) }}</span>
              <n-avatar round size="small" :src="avatarUrl(r.user.avatar, r.user.name)" />
              <span class="name">{{ r.user.name }}</span>
              <span class="cls">{{ classMap[r.user.class_id] || '' }}</span>
              <span class="val">{{ r.score }} 分</span>
            </div>
          </div>
        </n-tab-pane>
        <n-tab-pane name="progress" tab="🌟 进步之星">
          <n-empty v-if="!progressBoard.length" :description="`需要本${period === 'month' ? '月' : '周'}与上${period === 'month' ? '月' : '周'}都有练习记录才能上榜`" />
          <div v-else>
            <div v-for="(r, i) in progressBoard" :key="r.user.id" class="row">
              <span class="rank">{{ medal(i) }}</span>
              <n-avatar round size="small" :src="avatarUrl(r.user.avatar, r.user.name)" />
              <span class="name">{{ r.user.name }}</span>
              <span class="cls">{{ classMap[r.user.class_id] || '' }}</span>
              <span class="val up">▲ +{{ r.gain }} CPM</span>
              <span class="cls">当前均速 {{ r.cur }}</span>
            </div>
          </div>
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<script>
import { defineComponent, h } from 'vue'
import { NEmpty as Empty2, NAvatar as Av, NTag as Tg } from 'naive-ui'
import { avatarUrl as au } from '../lib/avatar'

const BoardTable = defineComponent({
  props: ['rows', 'metric', 'unit', 'classMap', 'me', 'medal'],
  setup(p) {
    return () => !p.rows.length
      ? h(Empty2, { description: '暂无数据，先去练习吧！' })
      : p.rows.map((r, i) => h('div', { key: r.user.id, class: 'row' + (r.user.id === p.me ? ' me' : '') }, [
        h('span', { class: 'rank' }, p.medal(i)),
        h(Av, { round: true, size: 'small', src: au(r.user.avatar, r.user.name) }),
        h('span', { class: 'name' }, r.user.name),
        h('span', { class: 'cls' }, p.classMap[r.user.class_id] || ''),
        h('span', { class: 'val' }, p.metric === 'accuracy' ? r.accuracy.toFixed(1) + '%'
          : p.metric === 'composite' ? Math.round(r.composite) + ' 分' : Math.round(r.cpm) + ' ' + (p.unit || 'CPM')),
        h('span', { class: 'sub' }, `准确率 ${r.accuracy.toFixed(1)}%`),
        r.badges ? h(Tg, { size: 'tiny', round: true }, () => `🏅 ×${r.badges}`) : null,
      ]))
  },
})
export default { components: { BoardTable } }
</script>

<style>
.row { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-radius: 10px; margin-bottom: 4px; }
.row:nth-child(odd) { background: rgba(127,127,127,.06); }
.row.me { outline: 2px solid var(--kp-primary); }
.row .rank { width: 34px; font-weight: 800; font-size: 16px; text-align: center; }
.row .name { font-weight: 600; min-width: 90px; }
.row .cls { font-size: 12px; opacity: .55; min-width: 70px; }
.row .val { font-weight: 800; color: var(--kp-primary); margin-left: auto; font-variant-numeric: tabular-nums; }
.row .val.up { color: #10b981; }
.row .sub { font-size: 12px; opacity: .55; }
</style>
