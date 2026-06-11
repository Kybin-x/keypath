<script setup>
// 任务执行页：文稿预览 → 计时练习 → 提交成绩 + 对比
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NButton, NSpin, NSpace, NTag, useMessage } from 'naive-ui'
import { supabase } from '../lib/supabase'
import { useUserStore } from '../stores/user'
import { saveTaskRecord } from '../lib/records'
import TypingEngine from '../components/TypingEngine.vue'
import ResultCard from '../components/ResultCard.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const user = useUserStore()

const loading = ref(true)
const task = ref(null)
const text = ref(null)
const phase = ref('preview')   // preview | typing | result
const result = ref(null)
const unlocked = ref([])
const lastRec = ref(null)

onMounted(async () => {
  try {
    const { data: t } = await supabase.from('tasks').select('*').eq('id', route.params.id).single()
    task.value = t
    if (t?.text_id) {
      const { data: tx } = await supabase.from('texts').select('*').eq('id', t.text_id).single()
      text.value = tx
    }
    const { data: recs } = await supabase.from('task_records').select('*').eq('task_id', route.params.id)
      .eq('student_id', user.user.id).order('submitted_at', { ascending: false }).limit(1)
    lastRec.value = recs?.[0] || null
  } finally { loading.value = false }
})

function canStart() {
  if (!task.value) return false
  const now = new Date()
  if (task.value.status !== 'open') return false
  if (new Date(task.value.start_at) > now) { message.warning('任务还未开始'); return false }
  if (new Date(task.value.deadline) < now) { message.warning('任务已截止'); return false }
  if (lastRec.value && !task.value.allow_retry) { message.warning('该任务不允许重复提交'); return false }
  return true
}

async function onFinish(r) {
  result.value = r
  phase.value = 'result'
  try {
    const { unlocked: list } = await saveTaskRecord(task.value.id, r, text.value?.lang || '')
    unlocked.value = list
    message.success('成绩已提交')
  } catch (e) { message.error('提交失败：' + e.message) }
}
</script>

<template>
  <n-spin :show="loading">
    <template v-if="task">
      <!-- 预览 -->
      <div v-if="phase === 'preview'" style="max-width: 720px; margin: 0 auto">
        <n-card>
          <h2 style="margin-top:0">📋 {{ task.title }}</h2>
          <n-space style="margin-bottom: 12px">
            <n-tag round type="info">时长 {{ Math.round(task.duration_sec / 60) }} 分钟</n-tag>
            <n-tag round type="warning">截止 {{ new Date(task.deadline).toLocaleString('zh-CN') }}</n-tag>
            <n-tag round>{{ task.allow_retry ? (task.score_rule === 'best' ? '可重复 · 取最高分' : '可重复 · 取最后一次') : '仅一次机会' }}</n-tag>
          </n-space>
          <p v-if="task.note" style="opacity:.75">{{ task.note }}</p>
          <n-card v-if="text" size="small" title="文稿预览" style="margin: 12px 0">
            <div style="max-height: 180px; overflow: auto; opacity: .8; line-height: 1.8">{{ text.content }}</div>
          </n-card>
          <div v-if="lastRec" style="font-size: 14px; margin-bottom: 12px">
            上次成绩：<b>{{ Math.round(lastRec.cpm) }} CPM</b> · 准确率 {{ lastRec.accuracy }}%
          </div>
          <n-space justify="center">
            <n-button type="primary" size="large" :disabled="!text" @click="canStart() && (phase = 'typing')">开始练习 ⏱</n-button>
            <n-button size="large" @click="router.push('/tasks')">返回</n-button>
          </n-space>
        </n-card>
      </div>

      <!-- 打字 -->
      <div v-else-if="phase === 'typing'">
        <n-space justify="space-between" align="center" style="margin-bottom: 12px">
          <h2 style="margin:0">{{ task.title }}</h2>
          <n-button size="small" @click="phase = 'preview'">放弃本次</n-button>
        </n-space>
        <TypingEngine :text="text.content" :duration-sec="task.duration_sec" :loop="true" @finish="onFinish" />
      </div>

      <!-- 结果 -->
      <div v-else style="max-width: 560px; margin: 30px auto">
        <ResultCard :result="result" :unlocked="unlocked" :saved="true"
          :compare="lastRec ? { cpm: Math.round(lastRec.cpm), accuracy: Number(lastRec.accuracy) } : null"
          @retry="task.allow_retry ? (phase = 'typing') : router.push('/tasks')" @close="router.push('/tasks')" />
      </div>
    </template>
  </n-spin>
</template>
