<script setup>
// 学生端任务列表
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NTag, NButton, NEmpty, NSpin, NTabs, NTabPane } from 'naive-ui'
import { supabase } from '../lib/supabase'
import { useUserStore } from '../stores/user'

const router = useRouter()
const user = useUserStore()
const loading = ref(true)
const tasks = ref([])
const myRecords = ref([])

onMounted(async () => {
  try {
    const uid = user.user.id
    const { data: ts } = await supabase.from('task_students').select('task_id').eq('student_id', uid)
    const ids = (ts || []).map(t => t.task_id)
    if (ids.length) {
      const { data } = await supabase.from('tasks').select('*, texts(title)').in('id', ids).neq('status', 'draft').order('deadline', { ascending: false })
      tasks.value = data || []
      const { data: recs } = await supabase.from('task_records').select('*').eq('student_id', uid).in('task_id', ids).order('submitted_at')
      myRecords.value = recs || []
    }
  } finally { loading.value = false }
})

function recsFor(id) { return myRecords.value.filter(r => r.task_id === id) }
function bestFor(id) {
  const rs = recsFor(id)
  if (!rs.length) return null
  return rs.reduce((a, b) => Number(b.cpm) > Number(a.cpm) ? b : a)
}
function isActive(t) {
  const now = new Date()
  return t.status === 'open' && new Date(t.start_at) <= now && new Date(t.deadline) >= now
}
function remain(t) {
  const ms = new Date(t.deadline) - new Date()
  if (ms <= 0) return '已截止'
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24)
  return d > 0 ? `剩 ${d} 天 ${h % 24} 小时` : `剩 ${h} 小时 ${Math.floor(ms % 3600000 / 60000)} 分`
}

const pending = computed(() => tasks.value.filter(t => isActive(t) && !recsFor(t.id).length))
const doing = computed(() => tasks.value.filter(t => isActive(t) && recsFor(t.id).length))
const closed = computed(() => tasks.value.filter(t => !isActive(t)))
</script>

<template>
  <div>
    <h2 style="margin-top:0">📋 我的任务</h2>
    <n-spin :show="loading">
      <n-empty v-if="!loading && !tasks.length" description="暂时没有任务，去自由练习吧！" style="margin-top: 60px" />
      <n-tabs v-else type="line" size="large">
        <n-tab-pane name="pending" :tab="`🔴 待完成 (${pending.length})`">
          <TaskList :list="pending" :best-for="bestFor" :recs-for="recsFor" :remain="remain" active />
        </n-tab-pane>
        <n-tab-pane name="doing" :tab="`🟡 可再练 (${doing.length})`">
          <TaskList :list="doing" :best-for="bestFor" :recs-for="recsFor" :remain="remain" active />
        </n-tab-pane>
        <n-tab-pane name="closed" :tab="`⚪ 已结束 (${closed.length})`">
          <TaskList :list="closed" :best-for="bestFor" :recs-for="recsFor" :remain="remain" />
        </n-tab-pane>
      </n-tabs>
    </n-spin>
  </div>
</template>

<script>
// 内联子组件：任务卡片列表
import { defineComponent, h } from 'vue'
import { NCard as Card, NTag as Tag, NButton as Btn, NEmpty as Empty } from 'naive-ui'
import { RouterLink } from 'vue-router'

const TaskList = defineComponent({
  props: ['list', 'bestFor', 'recsFor', 'remain', 'active'],
  setup(props) {
    return () => !props.list.length
      ? h(Empty, { description: '这里空空如也' })
      : props.list.map(t => {
        const best = props.bestFor(t.id)
        const n = props.recsFor(t.id).length
        return h(Card, { key: t.id, size: 'small', style: 'margin-bottom: 12px' }, () =>
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px' }, [
            h('div', [
              h('div', { style: 'font-weight:700;font-size:16px' }, [
                t.title + ' ',
                h(Tag, { size: 'tiny', round: true }, () => `${Math.round(t.duration_sec / 60)} 分钟`),
              ]),
              h('div', { style: 'font-size:12px;opacity:.6;margin-top:4px' },
                `文稿：${t.texts?.title || '—'} ｜ ${props.remain(t)} ｜ 已提交 ${n} 次` + (t.note ? ` ｜ ${t.note}` : '')),
              best ? h('div', { style: 'font-size:13px;margin-top:4px' },
                `最佳成绩：${Math.round(best.cpm)} CPM · ${best.accuracy}%`) : null,
            ]),
            props.active && (t.allow_retry || n === 0)
              ? h(RouterLink, { to: `/tasks/${t.id}/run` }, () => h(Btn, { type: 'primary', size: 'small' }, () => n ? '再练一次' : '开始任务'))
              : null,
          ]))
      })
  },
})
export default { components: { TaskList } }
</script>
