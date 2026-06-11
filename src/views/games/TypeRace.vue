<script setup>
// 🏃 赛跑竞速：打字速度控制奔跑；多人实时对战（Supabase Realtime 房间）或单人挑战电脑
import { ref, computed, onBeforeUnmount } from 'vue'
import { NButton, NSpace, NInput, NCard, NTag, useMessage, NRadioGroup, NRadioButton } from 'naive-ui'
import { supabase } from '../../lib/supabase'
import { useUserStore } from '../../stores/user'
import { LOCAL_TEXTS } from '../../data/texts'
import { playFx } from '../../lib/sound'
import { saveLog } from '../../lib/records'
import GameShell from './GameShell.vue'
import TypingEngine from '../../components/TypingEngine.vue'

const message = useMessage()
const user = useUserStore()

const state = ref('ready')       // ready | lobby | countdown | racing | over
const mode = ref('solo')         // solo | host | join
const roomCode = ref('')
const joinCode = ref('')
const players = ref({})          // key -> {name, progress, cpm, done, rank}
const myKey = ref('p' + Math.random().toString(36).slice(2, 8))
const myName = computed(() => user.user?.name || '访客' + myKey.value.slice(-3))
const raceText = ref('')
const countdown = ref(3)
const score = ref(0)
const myProgress = ref(0)
const finishOrder = ref([])
const isHost = ref(false)
const textChoice = ref('zh')

let channel = null
let botTimer = null
let cdTimer = null

function pickText() {
  const pool = LOCAL_TEXTS.filter(t => t.lang === textChoice.value)
  return pool[Math.floor(Math.random() * pool.length)].content
}

// ---------- 单人模式（挑战电脑） ----------
function startSolo() {
  mode.value = 'solo'
  raceText.value = pickText()
  players.value = {
    [myKey.value]: { name: myName.value, progress: 0, cpm: 0, done: false },
    bot1: { name: '🤖 小键', progress: 0, cpm: 0, done: false, bot: 80 },
    bot2: { name: '🤖 阿途', progress: 0, cpm: 0, done: false, bot: 140 },
  }
  beginCountdown()
}

// ---------- 多人房间 ----------
async function createRoom() {
  isHost.value = true
  roomCode.value = Math.random().toString(36).slice(2, 6).toUpperCase()
  await joinChannel(roomCode.value)
  mode.value = 'host'
  state.value = 'lobby'
}

async function joinRoom() {
  if (!joinCode.value.trim()) return message.warning('请输入房间码')
  isHost.value = false
  roomCode.value = joinCode.value.trim().toUpperCase()
  await joinChannel(roomCode.value)
  mode.value = 'join'
  state.value = 'lobby'
}

async function joinChannel(code) {
  channel = supabase.channel(`race-${code}`, { config: { presence: { key: myKey.value }, broadcast: { self: true } } })
  channel
    .on('presence', { event: 'sync' }, () => {
      const st = channel.presenceState()
      const next = {}
      for (const [key, metas] of Object.entries(st)) {
        const old = players.value[key]
        next[key] = { name: metas[0]?.name || key, progress: old?.progress || 0, cpm: old?.cpm || 0, done: old?.done || false }
      }
      players.value = next
    })
    .on('broadcast', { event: 'start' }, ({ payload }) => {
      raceText.value = payload.text
      beginCountdown()
    })
    .on('broadcast', { event: 'progress' }, ({ payload }) => {
      const p = players.value[payload.key]
      if (p) { p.progress = payload.progress; p.cpm = payload.cpm; p.done = payload.done }
      if (payload.done && !finishOrder.value.includes(payload.key)) finishOrder.value.push(payload.key)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ name: myName.value })
      else if (status === 'CHANNEL_ERROR') message.error('无法连接对战服务器（需要数据库已初始化且 Realtime 可用）')
    })
}

function hostStart() {
  channel?.send({ type: 'broadcast', event: 'start', payload: { text: pickText() } })
}

// ---------- 比赛流程 ----------
function beginCountdown() {
  state.value = 'countdown'
  countdown.value = 3
  finishOrder.value = []
  myProgress.value = 0
  playFx('tick')
  cdTimer = setInterval(() => {
    countdown.value--
    playFx(countdown.value <= 0 ? 'win' : 'tick')
    if (countdown.value <= 0) {
      clearInterval(cdTimer)
      state.value = 'racing'
      if (mode.value === 'solo') runBots()
      setTimeout(() => document.querySelector('.engine input')?.focus(), 100)
    }
  }, 1000)
}

function runBots() {
  const total = raceText.value.length
  botTimer = setInterval(() => {
    for (const [k, p] of Object.entries(players.value)) {
      if (!p.bot || p.done) continue
      p.progress = Math.min(1, p.progress + (p.bot / 60 / 10) / total * (0.8 + Math.random() * 0.4))
      p.cpm = p.bot
      if (p.progress >= 1 && !p.done) { p.done = true; finishOrder.value.push(k) }
    }
  }, 100)
}

function onProgress(s) {
  const total = raceText.value.length
  myProgress.value = Math.min(1, s.correctChars / total)
  const me = players.value[myKey.value]
  if (me) { me.progress = myProgress.value; me.cpm = s.cpm }
  channel?.send({ type: 'broadcast', event: 'progress', payload: { key: myKey.value, progress: myProgress.value, cpm: s.cpm, done: false } })
}

async function onFinish(s) {
  const me = players.value[myKey.value]
  if (me) { me.done = true; me.progress = 1 }
  if (!finishOrder.value.includes(myKey.value)) finishOrder.value.push(myKey.value)
  channel?.send({ type: 'broadcast', event: 'progress', payload: { key: myKey.value, progress: 1, cpm: s.cpm, done: true } })
  const rank = finishOrder.value.indexOf(myKey.value) + 1
  score.value = Math.max(0, Math.round(s.cpm * (s.accuracy / 100)) + Math.max(0, (Object.keys(players.value).length - rank)) * 50)
  clearInterval(botTimer)
  state.value = 'over'
  playFx(rank === 1 ? 'win' : 'lose')
  const { unlocked } = await saveLog({ kind: 'game', game: 'race', result: { score: score.value, cpm: s.cpm, accuracy: s.accuracy, durationSec: s.durationSec, activeSec: s.activeSec } })
  unlocked.forEach(a => message.info(`${a.icon} 解锁成就：${a.title}`))
}

const ranking = computed(() => Object.entries(players.value)
  .map(([k, p]) => ({ key: k, ...p, order: finishOrder.value.indexOf(k) }))
  .sort((a, b) => (a.order === -1 ? 99 : a.order) - (b.order === -1 ? 99 : b.order) || b.progress - a.progress))

const myRank = computed(() => ranking.value.findIndex(p => p.key === myKey.value) + 1)

function cleanup() {
  clearInterval(botTimer); clearInterval(cdTimer)
  if (channel) { supabase.removeChannel(channel); channel = null }
}
onBeforeUnmount(cleanup)

function restart() {
  cleanup()
  state.value = 'ready'
  players.value = {}
}
</script>

<template>
  <GameShell title="🏃 赛跑竞速 TypeRace" :score="score" :state="state === 'lobby' || state === 'countdown' || state === 'racing' ? 'playing' : state" @restart="restart">
    <template #setup>
      <n-space vertical align="center" :size="18">
        <n-radio-group v-model:value="textChoice">
          <n-radio-button value="zh">中文文稿</n-radio-button>
          <n-radio-button value="en">英文文稿</n-radio-button>
        </n-radio-group>
        <n-space>
          <n-button type="primary" size="large" @click="startSolo">🤖 单人挑战电脑</n-button>
          <n-button type="info" size="large" @click="createRoom">🏠 创建房间</n-button>
        </n-space>
        <n-space align="center">
          <n-input v-model:value="joinCode" placeholder="输入房间码" style="width: 140px" @keyup.enter="joinRoom" />
          <n-button @click="joinRoom">加入房间</n-button>
        </n-space>
      </n-space>
    </template>
    <template #over><p>名次：第 {{ myRank }} 名 / {{ ranking.length }} 人</p></template>

    <!-- 大厅 -->
    <n-card v-if="state === 'lobby'" style="max-width: 560px; margin: 0 auto; text-align: center">
      <h3>房间码：<n-tag type="primary" size="large" round>{{ roomCode }}</n-tag></h3>
      <p style="opacity:.65">把房间码告诉同学，等大家都进来后由房主开始比赛</p>
      <n-space justify="center" style="margin: 12px 0">
        <n-tag v-for="(p, k) in players" :key="k" round :type="k === myKey ? 'success' : 'default'">{{ p.name }}</n-tag>
      </n-space>
      <n-button v-if="isHost" type="primary" size="large" :disabled="Object.keys(players).length < 1" @click="hostStart">开始比赛 🏁</n-button>
      <p v-else style="opacity:.6">等待房主开始…</p>
    </n-card>

    <!-- 倒计时 -->
    <div v-else-if="state === 'countdown'" class="countdown">{{ countdown > 0 ? countdown : 'GO!' }}</div>

    <!-- 比赛 -->
    <div v-else-if="state === 'racing'" class="race">
      <div class="tracks">
        <div v-for="p in ranking" :key="p.key" class="track">
          <span class="pname" :class="{ me: p.key === myKey }">{{ p.name }}</span>
          <div class="lane">
            <div class="runner" :style="{ left: `calc(${(p.progress * 100).toFixed(1)}% - 14px)` }">{{ p.done ? '🏆' : '🏃' }}</div>
          </div>
          <span class="pcpm">{{ Math.round(p.cpm) }} CPM</span>
        </div>
      </div>
      <TypingEngine :text="raceText" :duration-sec="0" :loop="false" :show-keyboard="false" @progress="onProgress" @finish="onFinish" />
    </div>
  </GameShell>
</template>

<style scoped>
.countdown { font-size: 110px; font-weight: 900; text-align: center; padding: 80px 0;
  color: var(--kp-primary); animation: zoom .9s infinite; }
@keyframes zoom { from { transform: scale(.6); opacity: .4; } to { transform: scale(1.1); } }
.tracks { margin-bottom: 18px; }
.track { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.pname { width: 110px; text-align: right; font-weight: 600; font-size: 13px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pname.me { color: var(--kp-primary); }
.lane { flex: 1; position: relative; height: 30px; background: rgba(127,127,127,.12);
  border-radius: 15px; border-right: 4px solid #10b981; }
.runner { position: absolute; top: 1px; font-size: 22px; transition: left .15s linear; }
.pcpm { width: 76px; font-size: 12px; opacity: .7; font-variant-numeric: tabular-nums; }
</style>
