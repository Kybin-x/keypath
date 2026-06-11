<script setup>
// 🚀 太空射击：敌机带字母/单词，打出内容击落；难度递增；中英文切换
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { NButton, NRadioGroup, NRadioButton, NSpace, useMessage } from 'naive-ui'
import { GAME_WORDS } from '../../data/texts'
import { getGameWords } from '../../lib/gameWords'
import { playFx } from '../../lib/sound'
import { saveLog } from '../../lib/records'
import GameShell from './GameShell.vue'

const message = useMessage()
const state = ref('ready') // ready | playing | over
const mode = ref('en')     // en | zh | letters
const score = ref(0)
const lives = ref(3)
const level = ref(1)
const enemies = ref([])    // {id, word, typed, x, y, speed}
const input = ref('')
const hits = ref(0)
const misses = ref(0)
const startedAt = ref(0)

let raf, spawnTimer, idSeq = 0
const W = 900, H = 560
const WORDS = ref(GAME_WORDS)
const composing = ref(false)

function pool() {
  if (mode.value === 'letters') return WORDS.value.letters
  return WORDS.value[mode.value]
}

function spawn() {
  const words = pool()
  const word = words[Math.floor(Math.random() * words.length)]
  enemies.value.push({
    id: idSeq++, word, typed: 0,
    x: 40 + Math.random() * (W - 120),
    y: -20,
    speed: 0.35 + level.value * 0.12 + Math.random() * 0.2,
  })
}

async function start() {
  WORDS.value = await getGameWords()
  state.value = 'playing'
  score.value = 0; lives.value = 3; level.value = 1
  enemies.value = []; input.value = ''; hits.value = 0; misses.value = 0
  startedAt.value = Date.now()
  spawnTimer = setInterval(() => {
    spawn()
    if (score.value > level.value * 100) level.value++
  }, Math.max(900, 2000 - level.value * 100))
  loop()
  setTimeout(() => document.getElementById('space-input')?.focus(), 50)
}

function loop() {
  raf = requestAnimationFrame(loop)
  for (const e of enemies.value) {
    e.y += e.speed * (1 + level.value * 0.08)
    if (e.y > H - 30) {
      enemies.value = enemies.value.filter(x => x.id !== e.id)
      lives.value--
      playFx('boom')
      if (lives.value <= 0) gameOver()
    }
  }
}

// 中文输入法：拼音组词阶段不处理，上屏后才匹配
function onCompStart() { composing.value = true }
function onCompEnd(e) { composing.value = false; handleInput(e) }
function onInput(e) {
  if (composing.value) return
  handleInput(e)
}
function handleInput(e) {
  const v = e.target.value
  input.value = v
  if (!v) return
  // 匹配：优先已部分匹配的敌机，否则任意前缀匹配
  const sorted = [...enemies.value].sort((a, b) => b.y - a.y)
  const target = sorted.find(en => en.word.startsWith(v))
  if (target) {
    target.typed = v.length
    if (v === target.word) {
      enemies.value = enemies.value.filter(x => x.id !== target.id)
      score.value += target.word.length * 10 + level.value * 5
      hits.value++
      playFx('pop')
      e.target.value = ''; input.value = ''
      enemies.value.forEach(en => en.typed = 0)
    }
  } else {
    misses.value++
    playFx('tick')
    e.target.value = ''; input.value = ''
    enemies.value.forEach(en => en.typed = 0)
  }
}

async function gameOver() {
  cancelAnimationFrame(raf); clearInterval(spawnTimer)
  state.value = 'over'
  playFx('lose')
  const dur = (Date.now() - startedAt.value) / 1000
  const acc = hits.value + misses.value ? Math.round(hits.value / (hits.value + misses.value) * 1000) / 10 : 100
  const { unlocked } = await saveLog({ kind: 'game', game: 'space', result: { score: score.value, accuracy: acc, durationSec: dur, activeSec: dur } })
  unlocked.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`))
}

onBeforeUnmount(() => { cancelAnimationFrame(raf); clearInterval(spawnTimer) })
</script>

<template>
  <GameShell title="🚀 太空射击 SpaceType" :score="score" :state="state" :extra="`关卡 ${level} ｜ ❤️ ${lives}`" @restart="start">
    <template #setup>
      <n-space vertical align="center">
        <n-radio-group v-model:value="mode">
          <n-radio-button value="letters">字母模式</n-radio-button>
          <n-radio-button value="en">英文单词</n-radio-button>
          <n-radio-button value="zh">中文词语</n-radio-button>
        </n-radio-group>
        <p style="opacity:.6">打出敌机上的内容并击落它们！敌机落地扣一条命。</p>
        <n-button type="primary" size="large" @click="start">开始游戏</n-button>
      </n-space>
    </template>

    <div class="space" :style="{ width: W + 'px', height: H + 'px' }" @click="$el?.querySelector('#space-input')?.focus()">
      <div v-for="e in enemies" :key="e.id" class="enemy" :style="{ left: e.x + 'px', top: e.y + 'px' }">
        <div class="ship">👾</div>
        <div class="word">
          <span class="done">{{ e.word.slice(0, e.typed) }}</span><span>{{ e.word.slice(e.typed) }}</span>
        </div>
      </div>
      <div class="cannon">🛸</div>
      <input id="space-input" class="game-input" autocomplete="off" @input="onInput"
        @compositionstart="onCompStart" @compositionend="onCompEnd"
        placeholder="在此输入…（中文模式可直接用拼音输入法）" />
    </div>
  </GameShell>
</template>

<style scoped>
.space { position: relative; margin: 0 auto; border-radius: 12px; overflow: hidden;
  background: linear-gradient(180deg, #0b1026 0%, #1a1f3d 100%); max-width: 100%; }
.enemy { position: absolute; text-align: center; transform: translateX(-50%); }
.ship { font-size: 28px; }
.word { background: rgba(0,0,0,.5); color: #fff; padding: 1px 8px; border-radius: 8px; font-weight: 700;
  font-family: 'JetBrains Mono', monospace; }
.word .done { color: #34d399; }
.cannon { position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%); font-size: 34px; }
.game-input { position: absolute; bottom: 0; left: 0; width: 100%; border: none; padding: 8px 14px;
  font-size: 16px; background: rgba(255,255,255,.92); outline: none; font-family: 'JetBrains Mono', monospace; }
</style>
