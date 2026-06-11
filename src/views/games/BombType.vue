<script setup>
// 💣 拆弹游戏：限时打出正确字符序列；打错引线缩短；多关卡递增
import { ref, onBeforeUnmount, computed } from 'vue'
import { NButton, NSpace, useMessage } from 'naive-ui'
import { GAME_WORDS } from '../../data/texts'
import { playFx } from '../../lib/sound'
import { saveLog } from '../../lib/records'
import GameShell from './GameShell.vue'

const message = useMessage()
const state = ref('ready')
const score = ref(0)
const level = ref(1)
const fuse = ref(100)      // 引线百分比
const code = ref('')       // 需要打出的序列
const pos = ref(0)
const hits = ref(0)
const misses = ref(0)
const startedAt = ref(0)

let timer
const fuseSpeed = computed(() => 0.35 + level.value * 0.1)

function genCode() {
  const words = GAME_WORDS.en
  const n = Math.min(2 + Math.ceil(level.value / 2), 6)
  code.value = Array.from({ length: n }, () => words[Math.floor(Math.random() * words.length)]).join(' ')
  pos.value = 0
}

function start() {
  state.value = 'playing'
  score.value = 0; level.value = 1; fuse.value = 100
  hits.value = 0; misses.value = 0
  startedAt.value = Date.now()
  genCode()
  timer = setInterval(() => {
    fuse.value -= fuseSpeed.value
    if (fuse.value <= 0) explode()
  }, 50)
  setTimeout(() => document.getElementById('bomb-input')?.focus(), 50)
}

function onKeydown(e) {
  if (state.value !== 'playing') return
  if (e.key.length !== 1) return
  e.preventDefault()
  const expect = code.value[pos.value]
  if (e.key === expect) {
    pos.value++; hits.value++
    playFx('tick')
    if (pos.value >= code.value.length) {
      // 拆弹成功，下一关
      score.value += level.value * 50 + Math.round(fuse.value)
      level.value++
      fuse.value = Math.min(100, fuse.value + 35)
      playFx('win')
      message.success(`💣 第 ${level.value - 1} 关拆除成功！`, { duration: 900 })
      genCode()
    }
  } else {
    misses.value++
    fuse.value -= 6  // 错误惩罚：引线缩短
    playFx('boom')
  }
}

async function explode() {
  clearInterval(timer)
  state.value = 'over'
  playFx('lose')
  const dur = (Date.now() - startedAt.value) / 1000
  const acc = hits.value + misses.value ? Math.round(hits.value / (hits.value + misses.value) * 1000) / 10 : 100
  const { unlocked } = await saveLog({ kind: 'game', game: 'bomb', result: { score: score.value, accuracy: acc, durationSec: dur, activeSec: dur } })
  unlocked.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`))
}
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <GameShell title="💣 拆弹游戏 BombType" :score="score" :state="state" :extra="`第 ${level} 关`" @restart="start">
    <template #setup>
      <n-space vertical align="center">
        <p style="opacity:.6">在引线烧完前打出拆弹密码！打错字符引线会加速缩短。</p>
        <n-button type="primary" size="large" @click="start">开始拆弹</n-button>
      </n-space>
    </template>
    <template #over><p>坚持到了第 {{ level }} 关 💥</p></template>

    <div class="bomb-area" tabindex="0" @keydown="onKeydown" id="bomb-input">
      <div class="bomb" :class="{ danger: fuse < 30 }">💣</div>
      <div class="fuse-bar">
        <div class="fuse-fill" :style="{ width: fuse + '%' }" :class="{ danger: fuse < 30 }"></div>
        <span class="spark" :style="{ left: `calc(${fuse}% - 10px)` }">✨</span>
      </div>
      <div class="code">
        <span class="done">{{ code.slice(0, pos) }}</span><span class="cur">{{ code[pos] === ' ' ? '␣' : code[pos] }}</span><span class="rest">{{ code.slice(pos + 1) }}</span>
      </div>
      <p class="hint">点击此区域后直接敲键盘输入</p>
    </div>
  </GameShell>
</template>

<style scoped>
.bomb-area { max-width: 640px; margin: 0 auto; background: linear-gradient(180deg,#1f2937,#111827);
  border-radius: 12px; padding: 30px; text-align: center; outline: none; color: #fff; cursor: text; }
.bomb-area:focus { box-shadow: 0 0 0 3px var(--kp-primary); }
.bomb { font-size: 72px; }
.bomb.danger { animation: shake2 .2s infinite; }
@keyframes shake2 { 25% { transform: rotate(-4deg); } 75% { transform: rotate(4deg); } }
.fuse-bar { position: relative; height: 14px; background: rgba(255,255,255,.15); border-radius: 7px; margin: 18px 30px; }
.fuse-fill { height: 100%; background: linear-gradient(90deg,#f59e0b,#fbbf24); border-radius: 7px; transition: width .05s linear; }
.fuse-fill.danger { background: linear-gradient(90deg,#dc2626,#f87171); }
.spark { position: absolute; top: -8px; font-size: 16px; }
.code { font-size: 28px; font-family: 'JetBrains Mono', monospace; font-weight: 700; margin: 20px 0 6px;
  word-break: break-all; }
.code .done { color: #34d399; }
.code .cur { background: var(--kp-primary); border-radius: 4px; padding: 0 2px; }
.code .rest { opacity: .55; }
.hint { font-size: 12px; opacity: .5; }
</style>
