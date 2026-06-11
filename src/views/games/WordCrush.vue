<script setup>
// 🌊 文字消消乐：文字块下落，打对消除，连击奖励，速度随关卡提升
import { ref, onBeforeUnmount } from 'vue'
import { NButton, NRadioGroup, NRadioButton, NSpace, useMessage } from 'naive-ui'
import { GAME_WORDS } from '../../data/texts'
import { getGameWords } from '../../lib/gameWords'
import { playFx } from '../../lib/sound'
import { saveLog } from '../../lib/records'
import GameShell from './GameShell.vue'

const message = useMessage()
const state = ref('ready')
const mode = ref('en')
const score = ref(0)
const combo = ref(0)
const maxCombo = ref(0)
const level = ref(1)
const blocks = ref([])  // {id, word, typed, x, y, speed, hue}
const lives = ref(5)
const hits = ref(0)
const misses = ref(0)
const startedAt = ref(0)

let raf, spawnTimer, idSeq = 0
const W = 900, H = 540
const WORDS = ref(GAME_WORDS)
const composing = ref(false)

function spawn() {
  const words = mode.value === 'letters' ? WORDS.value.letters : WORDS.value[mode.value]
  blocks.value.push({
    id: idSeq++, word: words[Math.floor(Math.random() * words.length)], typed: 0,
    x: 30 + Math.random() * (W - 130), y: -28,
    speed: 0.3 + level.value * 0.1 + Math.random() * 0.15,
    hue: Math.floor(Math.random() * 360),
  })
}

async function start() {
  WORDS.value = await getGameWords()
  state.value = 'playing'
  score.value = 0; combo.value = 0; maxCombo.value = 0; level.value = 1; lives.value = 5
  blocks.value = []; hits.value = 0; misses.value = 0
  startedAt.value = Date.now()
  spawnTimer = setInterval(() => { spawn(); if (score.value > level.value * 150) level.value++ }, Math.max(800, 1800 - level.value * 90))
  loop()
  setTimeout(() => document.getElementById('crush-input')?.focus(), 50)
}

function loop() {
  raf = requestAnimationFrame(loop)
  for (const b of blocks.value) {
    b.y += b.speed
    if (b.y > H - 36) {
      blocks.value = blocks.value.filter(x => x.id !== b.id)
      lives.value--; combo.value = 0
      playFx('boom')
      if (lives.value <= 0) gameOver()
    }
  }
}

// 中文输入法：拼音组词阶段不处理，上屏（compositionend）后才匹配
function onCompStart() { composing.value = true }
function onCompEnd(e) { composing.value = false; handleInput(e) }
function onInput(e) {
  if (composing.value) return
  handleInput(e)
}
function handleInput(e) {
  const v = e.target.value
  if (!v) return
  const sorted = [...blocks.value].sort((a, b) => b.y - a.y)
  const target = sorted.find(b => b.word.startsWith(v))
  if (target) {
    target.typed = v.length
    if (v === target.word) {
      blocks.value = blocks.value.filter(x => x.id !== target.id)
      combo.value++
      maxCombo.value = Math.max(maxCombo.value, combo.value)
      const bonus = combo.value >= 3 ? combo.value * 5 : 0
      score.value += target.word.length * 10 + bonus
      hits.value++
      playFx('pop')
      if (bonus) message.success(`🔥 连击 ×${combo.value}！+${bonus}`, { duration: 800 })
      e.target.value = ''
      blocks.value.forEach(b => b.typed = 0)
    }
  } else {
    misses.value++; combo.value = 0
    e.target.value = ''
    blocks.value.forEach(b => b.typed = 0)
  }
}

async function gameOver() {
  cancelAnimationFrame(raf); clearInterval(spawnTimer)
  state.value = 'over'
  playFx('lose')
  const dur = (Date.now() - startedAt.value) / 1000
  const acc = hits.value + misses.value ? Math.round(hits.value / (hits.value + misses.value) * 1000) / 10 : 100
  const { unlocked } = await saveLog({ kind: 'game', game: 'crush', result: { score: score.value, accuracy: acc, durationSec: dur, activeSec: dur } })
  unlocked.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`))
}
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearInterval(spawnTimer) })
</script>

<template>
  <GameShell title="🌊 文字消消乐 WordCrush" :score="score" :state="state"
    :extra="`关卡 ${level} ｜ ❤️ ${lives} ｜ 连击 ×${combo}`" @restart="start">
    <template #setup>
      <n-space vertical align="center">
        <n-radio-group v-model:value="mode">
          <n-radio-button value="letters">字母</n-radio-button>
          <n-radio-button value="en">英文单词</n-radio-button>
          <n-radio-button value="zh">中文词语</n-radio-button>
        </n-radio-group>
        <p style="opacity:.6">打出方块上的内容消除它！连续消除 3 次以上触发连击奖励。</p>
        <n-button type="primary" size="large" @click="start">开始游戏</n-button>
      </n-space>
    </template>
    <template #over>
      <p>最高连击 ×{{ maxCombo }}</p>
    </template>

    <div class="pool" :style="{ width: W + 'px', height: H + 'px' }">
      <div v-for="b in blocks" :key="b.id" class="block"
        :style="{ left: b.x + 'px', top: b.y + 'px', background: `hsl(${b.hue} 70% 55%)` }">
        <span class="done">{{ b.word.slice(0, b.typed) }}</span><span>{{ b.word.slice(b.typed) }}</span>
      </div>
      <input id="crush-input" class="game-input" autocomplete="off" @input="onInput"
        @compositionstart="onCompStart" @compositionend="onCompEnd" placeholder="在此输入…（中文模式可直接用拼音输入法）" />
    </div>
  </GameShell>
</template>

<style scoped>
.pool { position: relative; margin: 0 auto; border-radius: 12px; overflow: hidden; max-width: 100%;
  background: linear-gradient(180deg, #e0f2fe 0%, #bae6fd 100%); }
.block { position: absolute; padding: 6px 12px; border-radius: 10px; color: #fff; font-weight: 800;
  font-family: 'JetBrains Mono', monospace; box-shadow: 0 4px 10px rgba(0,0,0,.2); }
.block .done { color: #fde047; }
.game-input { position: absolute; bottom: 0; left: 0; width: 100%; border: none; padding: 8px 14px;
  font-size: 16px; background: rgba(255,255,255,.92); outline: none; font-family: 'JetBrains Mono', monospace; }
</style>
