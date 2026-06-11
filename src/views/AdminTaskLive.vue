<script setup>
// 任务实时大屏：全班学生卡片实时显示打字数据，名次随速度自动重排（FLIP 动画）
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NSpin, NEmpty } from 'naive-ui'
import { supabase } from '../lib/supabase'
import { avatarUrl } from '../lib/avatar'

const route = useRoute()
const router = useRouter()
const taskId = route.params.id

const loading = ref(true)
const task = ref(null)
const textLen = ref(0)
const board = ref(null)
const now = ref(Date.now())
// sid -> { name, avatar, cpm, wpm, accuracy, errors, chars, done, lastTs, started }
const students = ref({})

let channel = null
let clock = null

onMounted(async () => {
  try {
    const { data: t } = await supabase.from('tasks').select('*, texts(title, content)').eq('id', taskId).single()
    task.value = t
    textLen.value = t?.texts?.content?.length || 0

    // 名单：被指派的学生
    const { data: ts } = await supabase.from('task_students').select('student_id').eq('task_id', taskId)
    const ids = (ts || []).map(x => x.student_id)
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name, avatar').in('id', ids)
      for (const u of us || []) {
        students.value[u.id] = { name: u.name, avatar: u.avatar, cpm: 0, wpm: 0, accuracy: 0, errors: 0, chars: 0, done: false, lastTs: 0, started: false }
      }
    }
    // 已有提交（中途打开大屏也能看到完成者成绩）
    const { data: recs } = await supabase.from('task_records').select('student_id, cpm, wpm, accuracy, errors').eq('task_id', taskId).order('submitted_at')
    for (const r of recs || []) {
      const s = students.value[r.student_id]
      if (!s) continue
      if (Number(r.cpm) >= s.cpm) Object.assign(s, { cpm: Math.round(r.cpm), wpm: Math.round(r.wpm), accuracy: Number(r.accuracy), errors: r.errors })
      s.done = true; s.started = true
    }

    channel = supabase.channel(`task-live-${taskId}`)
    channel.on('broadcast', { event: 'progress' }, ({ payload: p }) => {
      const s = students.value[p.sid] || (students.value[p.sid] = { name: p.name, avatar: p.avatar, done: false })
      // 完成后保留最终成绩，不被后续重练的实时数据立即覆盖名次（重练仍显示进行中状态）
      Object.assign(s, {
        name: p.name, avatar: p.avatar, cpm: Math.round(p.cpm), wpm: Math.round(p.wpm),
        accuracy: p.accuracy, errors: p.errors, chars: p.chars,
        done: p.done || s.done, lastTs: Date.now(), started: true,
        typing: !p.done,
      })
    })
    channel.subscribe()
    clock = setInterval(() => { now.value = Date.now() }, 1500)
  } finally { loading.value = false }
})

onBeforeUnmount(() => {
  if (channel) supabase.removeChannel(channel)
  clearInterval(clock)
})

const sorted = computed(() => {
  void now.value
  const arr = Object.entries(students.value).map(([sid, s]) => ({
    sid, ...s,
    idle: s.typing && s.lastTs && Date.now() - s.lastTs > 8000,
    pct: textLen.value ? Math.min(100, Math.round((s.chars || 0) / textLen.value * 100)) : 0,
  }))
  // 已开始的按速度降序；未开始的排最后
  arr.sort((a, b) => (b.started - a.started) || (b.cpm - a.cpm) || (b.accuracy - a.accuracy))
  return arr
})
const startedCount = computed(() => sorted.value.filter(s => s.started).length)
const doneCount = computed(() => sorted.value.filter(s => s.done).length)

const boardEl = ref(null)
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else boardEl.value?.requestFullscreen()
}
const medal = i => ['🥇', '🥈', '🥉'][i] || (i + 1)
</script>

<template>
  <n-spin :show="loading">
    <div ref="boardEl" class="live-board">
      <div class="lb-header">
        <div>
          <h1>📺 {{ task?.title || '任务实时大屏' }}</h1>
          <p class="sub">{{ task?.texts?.title }} ｜ {{ Math.round((task?.duration_sec || 0) / 60) }} 分钟 ｜
            已参与 {{ startedCount }}/{{ sorted.length }} 人 · 已完成 {{ doneCount }} 人</p>
        </div>
        <div class="lb-actions">
          <n-button size="small" @click="fullscreen">⛶ 全屏</n-button>
          <n-button size="small" @click="router.push('/admin')">返回</n-button>
        </div>
      </div>

      <n-empty v-if="!loading && !sorted.length" description="该任务还没有指派学生" style="margin-top: 80px" />

      <TransitionGroup name="rank" tag="div" class="card-grid">
        <div v-for="(s, i) in sorted" :key="s.sid" class="stu-card"
          :class="{ top3: i < 3 && s.started, waiting: !s.started, done: s.done && !s.typing, idle: s.idle }">
          <div class="rank">{{ s.started ? medal(i) : '—' }}</div>
          <img class="avatar" :src="avatarUrl(s.avatar, s.name)" :alt="s.name" />
          <div class="info">
            <div class="name">{{ s.name }}</div>
            <div class="status">
              <span v-if="!s.started" class="st gray">未开始</span>
              <span v-else-if="s.done && !s.typing" class="st green">✅ 已完成</span>
              <span v-else-if="s.idle" class="st orange">⏸ 暂停中</span>
              <span v-else class="st blue typing-dot">⌨️ 输入中</span>
            </div>
          </div>
          <div class="metrics">
            <div class="cpm"><b>{{ s.cpm || 0 }}</b><small>CPM</small></div>
            <div class="acc">{{ s.accuracy || 0 }}<small>%</small></div>
          </div>
          <div class="bar"><div class="fill" :style="{ width: (s.done ? 100 : s.pct) + '%' }"></div></div>
        </div>
      </TransitionGroup>
    </div>
  </n-spin>
</template>

<style scoped>
.live-board { min-height: calc(100vh - 100px); border-radius: 14px; padding: 22px 26px;
  background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%); color: #f1f5f9; }
.live-board:fullscreen { border-radius: 0; padding: 36px 48px; overflow-y: auto; }
.lb-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
.lb-header h1 { margin: 0; font-size: 26px; }
.live-board:fullscreen .lb-header h1 { font-size: 36px; }
.sub { margin: 6px 0 0; opacity: .65; font-size: 14px; }
.lb-actions { display: flex; gap: 8px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.live-board:fullscreen .card-grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
.stu-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 14px 16px 20px;
  border-radius: 14px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.1);
  overflow: hidden; transition: background .3s; }
.stu-card.top3 { background: linear-gradient(135deg, rgba(250,204,21,.16), rgba(255,255,255,.06));
  border-color: rgba(250,204,21,.45); }
.stu-card.waiting { opacity: .45; }
.stu-card.done { border-color: rgba(52,211,153,.5); }
.stu-card.idle { border-color: rgba(251,146,60,.5); }
.rank { font-size: 24px; font-weight: 900; width: 36px; text-align: center; flex-shrink: 0; }
.avatar { width: 44px; height: 44px; border-radius: 50%; background: #fff2; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 700; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status { font-size: 12px; margin-top: 2px; }
.st.gray { color: #94a3b8; } .st.green { color: #34d399; } .st.orange { color: #fb923c; } .st.blue { color: #38bdf8; }
.typing-dot { animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { opacity: .45; } }
.metrics { display: flex; align-items: baseline; gap: 12px; flex-shrink: 0; }
.cpm b { font-size: 30px; font-variant-numeric: tabular-nums; color: #fde047; }
.live-board:fullscreen .cpm b { font-size: 38px; }
.cpm small, .acc small { opacity: .55; margin-left: 2px; font-size: 11px; }
.acc { font-size: 16px; font-variant-numeric: tabular-nums; color: #6ee7b7; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: rgba(255,255,255,.08); }
.fill { height: 100%; background: linear-gradient(90deg, #38bdf8, #a78bfa); transition: width .8s; }
/* 名次变化的 FLIP 重排动画 */
.rank-move { transition: transform .6s cubic-bezier(.22,1,.36,1); }
.rank-enter-active { transition: all .4s; }
.rank-enter-from { opacity: 0; transform: scale(.85); }
</style>
