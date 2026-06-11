<script setup>
// 游戏通用外壳：标题栏、分数、静音、开始/结束遮罩
import { ref } from 'vue'
import { NCard, NButton, NSpace } from 'naive-ui'
import { useRouter } from 'vue-router'
import { getMuted, setMuted } from '../../lib/sound'

defineProps({
  title: String,
  score: { type: Number, default: 0 },
  state: { type: String, default: 'ready' }, // ready | playing | over
  extra: { type: String, default: '' },
})
defineEmits(['restart'])
const router = useRouter()
const muted = ref(getMuted())
function toggleMute() {
  muted.value = !muted.value
  setMuted(muted.value)
}
</script>

<template>
  <div class="shell">
    <n-space justify="space-between" align="center" style="margin-bottom: 12px">
      <h2 style="margin:0">{{ title }}</h2>
      <n-space align="center">
        <span v-if="extra" class="extra">{{ extra }}</span>
        <span class="score">得分 {{ score }}</span>
        <n-button size="small" circle :title="muted ? '开启音效' : '静音'" @click="toggleMute">{{ muted ? '🔇' : '🔊' }}</n-button>
        <n-button size="small" @click="router.push('/games')">退出</n-button>
      </n-space>
    </n-space>

    <n-card v-if="state === 'ready'" style="text-align:center; padding: 30px 0">
      <slot name="setup" />
    </n-card>

    <template v-else>
      <div style="position: relative">
        <slot />
        <div v-if="state === 'over'" class="overlay">
          <div class="over-card">
            <div class="over-title">游戏结束</div>
            <div class="over-score">{{ score }} 分</div>
            <slot name="over" />
            <n-space justify="center" style="margin-top: 14px">
              <n-button type="primary" @click="$emit('restart')">再来一局</n-button>
              <n-button @click="router.push('/games')">返回游戏中心</n-button>
            </n-space>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.score { font-size: 18px; font-weight: 800; color: var(--kp-primary); }
.extra { opacity: .75; font-weight: 600; }
.overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.55); border-radius: 12px; z-index: 5; }
.over-card { background: var(--kp-card-bg, #fff); color: #1f2937; border-radius: 16px; padding: 28px 44px; text-align: center; }
.over-title { font-size: 20px; font-weight: 700; }
.over-score { font-size: 42px; font-weight: 800; color: var(--kp-primary); margin: 8px 0; }
</style>
