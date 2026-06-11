<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NGrid, NGi, NButton, NTag, NEmpty, NSpin } from 'naive-ui'
import { useUserStore } from '../stores/user'
import { supabase, dbAvailable } from '../lib/supabase'

const router = useRouter()
const user = useUserStore()

const loading = ref(false)
const pendingTasks = ref([])
const stats = ref({ best: 0, count: 0, streak: 0 })
const dbOk = ref(true)

onMounted(async () => {
  dbOk.value = await dbAvailable()
  if (!user.isLogin || !dbOk.value) return
  loading.value = true
  try {
    const uid = user.user.id
    if (user.isStudent) {
      const now = new Date().toISOString()
      const { data: ts } = await supabase.from('task_students').select('task_id').eq('student_id', uid)
      const ids = (ts || []).map(t => t.task_id)
      if (ids.length) {
        const { data: tasks } = await supabase.from('tasks').select('*').in('id', ids).eq('status', 'open').lte('start_at', now).gte('deadline', now)
        const { data: recs } = await supabase.from('task_records').select('task_id').eq('student_id', uid)
        const done = new Set((recs || []).map(r => r.task_id))
        pendingTasks.value = (tasks || []).filter(t => !done.has(t.id))
      }
    }
    const { data: logs } = await supabase.from('practice_logs').select('cpm').eq('user_id', uid).eq('kind', 'practice').order('cpm', { ascending: false }).limit(1)
    const { count } = await supabase.from('practice_logs').select('id', { count: 'exact', head: true }).eq('user_id', uid)
    const { data: ck } = await supabase.from('checkins').select('day').eq('user_id', uid).order('day', { ascending: false }).limit(60)
    let streak = 0
    if (ck?.length) {
      const d = new Date()
      if (ck[0].day !== d.toISOString().slice(0, 10)) d.setDate(d.getDate() - 1)
      for (const row of ck) {
        if (row.day === d.toISOString().slice(0, 10)) { streak++; d.setDate(d.getDate() - 1) } else break
      }
    }
    stats.value = { best: logs?.[0]?.cpm || 0, count: count || 0, streak }
  } finally { loading.value = false }
})

const entries = [
  { icon: '⌨️', title: '打字练习', desc: '键位练习 · 文稿练习 · 自定义文稿', path: '/practice', color: '#4F46E5' },
  { icon: '🎮', title: '打字游戏', desc: '6 款趣味游戏，边玩边练', path: '/games', color: '#EC4899' },
  { icon: '📋', title: '我的任务', desc: '完成老师布置的练习任务', path: '/tasks', color: '#059669' },
  { icon: '🏆', title: '排行榜', desc: '全班排名 · 进步之星', path: '/leaderboard', color: '#EA580C' },
]
</script>

<template>
  <div class="home">
    <n-card v-if="!dbOk" style="margin-bottom: 16px; border: 1px dashed #f59e0b">
      ⚠️ 数据库尚未初始化：请在 Supabase 控制台的 SQL Editor 中运行项目里的 <b>supabase/schema.sql</b>。当前以离线访客模式运行（可练习，不保存成绩）。
    </n-card>

    <div class="hero">
      <h1 v-if="user.isLogin">你好，{{ user.user.name }} 👋</h1>
      <h1 v-else>欢迎来到 键途 KeyPath ⌨️</h1>
      <p v-if="user.isLogin && user.isStudent">
        <n-tag round type="success" v-if="stats.streak">🔥 连续打卡 {{ stats.streak }} 天</n-tag>
        <n-tag round type="info" style="margin-left:8px" v-if="stats.best">⚡ 最佳 {{ Math.round(stats.best) }} CPM</n-tag>
        <n-tag round style="margin-left:8px">累计练习 {{ stats.count }} 次</n-tag>
      </p>
      <p v-else-if="!user.isLogin">打字的成长之路，从这里开始。<a class="lk" @click="router.push('/login')">用学号登录</a>解锁成绩保存、任务系统和排行榜！</p>
    </div>

    <n-spin :show="loading">
      <n-card v-if="user.isStudent && pendingTasks.length" title="📌 待完成任务" style="margin-bottom: 16px">
        <div v-for="t in pendingTasks" :key="t.id" class="task-row">
          <div>
            <b>{{ t.title }}</b>
            <span class="ddl">截止：{{ new Date(t.deadline).toLocaleString('zh-CN') }}</span>
          </div>
          <n-button type="primary" size="small" @click="router.push(`/tasks/${t.id}/run`)">去完成</n-button>
        </div>
      </n-card>
    </n-spin>

    <n-grid :cols="4" :x-gap="16" :y-gap="16" item-responsive responsive="screen" :collapsed="false">
      <n-gi v-for="e in entries" :key="e.path" span="4 m:2 l:1">
        <n-card hoverable class="entry" @click="router.push(e.path)">
          <div class="entry-icon" :style="{ background: e.color + '22' }">{{ e.icon }}</div>
          <div class="entry-title">{{ e.title }}</div>
          <div class="entry-desc">{{ e.desc }}</div>
        </n-card>
      </n-gi>
    </n-grid>
  </div>
</template>

<style scoped>
.hero { padding: 28px 8px 20px; }
.hero h1 { font-size: 30px; margin: 0 0 10px; }
.hero p { opacity: .85; }
.lk { color: var(--kp-primary); cursor: pointer; font-weight: 600; }
.entry { cursor: pointer; text-align: center; transition: transform .15s; }
.entry:hover { transform: translateY(-4px); }
.entry-icon { width: 64px; height: 64px; border-radius: 16px; font-size: 32px; display: flex;
  align-items: center; justify-content: center; margin: 0 auto 12px; }
.entry-title { font-size: 17px; font-weight: 700; }
.entry-desc { font-size: 13px; opacity: .6; margin-top: 4px; }
.task-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0;
  border-bottom: 1px solid rgba(127,127,127,.1); }
.task-row:last-child { border-bottom: none; }
.ddl { font-size: 12px; opacity: .6; margin-left: 12px; }
</style>
