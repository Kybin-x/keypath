<script setup>
// 成绩展示卡片 + 成就解锁提示
import { computed } from 'vue'
import { NCard, NButton, NTag, NSpace } from 'naive-ui'

const props = defineProps({
  result: { type: Object, required: true },
  unlocked: { type: Array, default: () => [] },
  compare: { type: Object, default: null },  // 上次成绩对比
  saved: { type: Boolean, default: false },
})
defineEmits(['retry', 'close'])

const items = computed(() => [
  { label: '速度 CPM', val: props.result.cpm, diff: props.compare ? props.result.cpm - props.compare.cpm : null },
  { label: '速度 WPM', val: props.result.wpm },
  { label: '准确率', val: props.result.accuracy + '%', diff: props.compare ? Math.round((props.result.accuracy - props.compare.accuracy) * 10) / 10 : null },
  { label: '错误次数', val: props.result.errors },
  { label: '实际用时', val: props.result.activeSec + 's' },
  { label: '总时长', val: props.result.durationSec + 's' },
])
</script>

<template>
  <n-card class="result-card" :bordered="false">
    <div class="title">🎉 本次成绩</div>
    <div class="grid">
      <div v-for="it in items" :key="it.label" class="cell">
        <div class="v">{{ it.val }}
          <span v-if="it.diff !== null && it.diff !== undefined && it.diff !== 0" class="diff" :class="it.diff > 0 ? 'up' : 'down'">
            {{ it.diff > 0 ? '▲' : '▼' }}{{ Math.abs(it.diff) }}
          </span>
        </div>
        <div class="l">{{ it.label }}</div>
      </div>
    </div>
    <div v-if="unlocked.length" class="achievements">
      <n-tag v-for="a in unlocked" :key="a.id" type="warning" round size="large">{{ a.icon }} 解锁成就：{{ a.title }}</n-tag>
    </div>
    <div v-if="!saved" class="guest-tip">💡 访客模式成绩不会保存，使用学号登录即可记录成绩、解锁成就！</div>
    <n-space justify="center" style="margin-top: 16px">
      <n-button type="primary" size="large" @click="$emit('retry')">再来一次</n-button>
      <n-button size="large" @click="$emit('close')">返回</n-button>
    </n-space>
  </n-card>
</template>

<style scoped>
.result-card { text-align: center; }
.title { font-size: 22px; font-weight: 700; margin-bottom: 18px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.cell { padding: 14px 8px; border-radius: 12px; background: rgba(127,127,127,.08); }
.cell .v { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.cell .l { font-size: 12px; opacity: .6; margin-top: 4px; }
.diff { font-size: 13px; margin-left: 4px; }
.diff.up { color: #10b981; }
.diff.down { color: #ef4444; }
.achievements { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.guest-tip { margin-top: 14px; font-size: 13px; opacity: .75; }
</style>
