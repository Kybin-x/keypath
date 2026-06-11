<script setup>
// 🎯 打地鼠：地鼠头上显示字母/单词，打出对应内容击打；适合初学者
import { ref, onBeforeUnmount } from 'vue'
import { NButton, NRadioGroup, NRadioButton, NSpace, useMessage } from 'naive-ui'
import { GAME_WORDS } from '../../data/texts'
import { getGameWords } from '../../lib/gameWords'
import { playFx } from '../../lib/sound'
import { saveLog } from '../../lib/records'
import GameShell from './GameShell.vue'

const message = useMessage()
const state = ref('ready')
const mode = ref('letters')
const score = ref(0)
const timeLeft = ref(60)
const holes = ref(Array.from({ length: 9 }, (_, i) => ({ i, mole: null, bonk: false })))
const hits = ref(0)
const misses = ref(0)

let popTimer, clockTimer
const WORDS = ref(GAME_WORDS)
const composing = ref(false)

function popMole() {
  const empty = holes.value.filter(h => !h.mole)
  if (!empty.length) return
  const h = empty[Math.floor(Math.random() * empty.length)]
  const words = mode.value === 'letters' ? WORDS.value.letters : WORDS.value[mode.value]
  h.mole = { word: words[Math.floor(Math.random() * words.length)], typed: 0, ttl: Date.now() + (mode.value === 'letters' ? 2600 : 4200) }
}

async function start() {
  WORDS.value = await getGameWords()
  state.value = 'playing'
  score.value = 0; timeLeft.value = 60; hits.value = 0; misses.value = 0
  holes.value.forEach(h => { h.mole = null; h.bonk = false })
  popTimer = setInterval(() => {
    popMole()
    for (const h of holes.value) if (h.mole && Date.now() > h.mole.ttl) h.mole = null
  }, 700)
  clockTimer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) gameOver()
  }, 1000)
  setTimeout(() => document.getElementById('mole-input')?.focus(), 50)
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
  if (!v) return
  const withMole = holes.value.filter(h => h.mole)
  const target = withMole.find(h => h.mole.word.startsWith(v))
  if (target) {
    target.mole.typed = v.length
    if (v === target.mole.word) {
      score.value += target.mole.word.length * 10
      hits.value++
      target.bonk = true
      playFx('pop')
      setTimeout(() => { target.mole = null; target.bonk = false }, 250)
      e.target.value = ''
      withMole.forEach(h => h.mole && (h.mole.typed = 0))
    }
  } else {
    misses.value++
    e.target.value = ''
    withMole.forEach(h => h.mole && (h.mole.typed = 0))
  }
}

async function gameOver() {
  clearInterval(popTimer); clearInterval(clockTimer)
  state.value = 'over'
  playFx('win')
  const acc = hits.value + misses.value ? Math.round(hits.value / (hits.value + misses.value) * 1000) / 10 : 100
  const { unlocked } = await saveLog({ kind: 'game', game: 'mole', result: { score: score.value, accuracy: acc, durationSec: 60, activeSec: 60 } })
  unlocked.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`))
}
onBeforeUnmount(() => { clearInterval(popTimer); clearInterval(clockTimer) })
</script>

<template>
  <GameShell title="🎯 打地鼠 MoleType" :score="score" :state="state" :extra="`⏱ ${timeLeft}s`" @restart="start">
    <template #setup>
      <n-space vertical align="center">
        <n-radio-group v-model:value="mode">
          <n-radio-button value="letters">字母（入门）</n-radio-button>
          <n-radio-button value="en">英文单词</n-radio-button>
          <n-radio-button value="zh">中文词语</n-radio-button>
        </n-radio-group>
        <p style="opacity:.6">60 秒限时！打出地鼠头上的内容击打它。</p>
        <n-button type="primary" size="large" @click="start">开始游戏</n-button>
      </n-space>
    </template>
    <template #over><p>命中 {{ hits }} 只地鼠</p></template>

    <div class="field">
      <div class="grid">
        <div v-for="h in holes" :key="h.i" class="hole">
          <div v-if="h.mole" class="mole" :class="{ bonk: h.bonk }">
            <div class="word"><span class="done">{{ h.mole.word.slice(0, h.mole.typed) }}</span>{{ h.mole.word.slice(h.mole.typed) }}</div>
            {{ h.bonk ? '💫' : '🐹' }}
          </div>
          <div class="dirt"></div>
        </div>
      </div>
      <input id="mole-input" class="game-input" autocomplete="off" @input="onInput"
        @compositionstart="onCompStart" @compositionend="onCompEnd" placeholder="在此输入…（中文模式可直接用拼音输入法）" />
    </div>
  </GameShell>
</template>

<style scoped>
.field { max-width: 1000px; margin: 0 auto; background: linear-gradient(180deg,#bbf7d0,#86efac);
  border-radius: 12px; padding: 30px 30px 0; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.hole { position: relative; height: 150px; display: flex; align-items: flex-end; justify-content: center; }
.dirt { width: 90%; height: 26px; background: #92400e; border-radius: 50%; }
.mole { position: absolute; bottom: 14px; font-size: 40px; text-align: center; animation: pop .2s; }
.mole.bonk { transform: scale(1.2); }
@keyframes pop { from { transform: translateY(30px); opacity: 0; } }
.word { font-size: 15px; font-weight: 800; background: #fff; border-radius: 8px; padding: 1px 8px;
  margin-bottom: 4px; font-family: 'JetBrains Mono', monospace; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
.word .done { color: #10b981; }
.game-input { width: 100%; border: none; padding: 9px 14px; font-size: 16px; margin-top: 20px;
  border-radius: 10px 10px 0 0; outline: none; font-family: 'JetBrains Mono', monospace; }
</style>
