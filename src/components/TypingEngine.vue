<script setup>
// 核心打字引擎：计时、对比、CPM/WPM/准确率统计、短文循环、键位错误记录
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { playKey } from '../lib/sound'
import KeyboardView from './KeyboardView.vue'

const props = defineProps({
  text: { type: String, required: true },
  durationSec: { type: Number, default: 0 }, // 0 = 不限时（打完文稿即结束）
  loop: { type: Boolean, default: true },     // 短文循环
  showKeyboard: { type: Boolean, default: true },
  autoFocus: { type: Boolean, default: true },
  meanings: { type: Object, default: null }, // {word: 中文释义}，打完单词后浮现
})
const emit = defineEmits(['finish', 'progress'])

const settings = useSettingsStore()
const inputEl = ref(null)
const started = ref(false)
const finished = ref(false)
const pos = ref(0)                 // 当前目标字符索引（在 fullTarget 中）
const typedStates = ref([])        // 每个已打字符: 'ok' | 'err'
const errorsTotal = ref(0)
const correctTotal = ref(0)
const typedTotal = ref(0)
const loops = ref(0)
const elapsed = ref(0)             // 总时长（含停顿）
const activeSec = ref(0)           // 实际打字时长（键间隔>3s 按 3s 计）
const errorKeys = ref({})
const composing = ref(false)
const compBuffer = ref('')
const focused = ref(false)

let timer = null
let lastKeyTs = 0
let startTs = 0

const baseText = computed(() => props.text.replace(/\r\n/g, '\n').replace(/\s+$/g, ''))
const fullTarget = ref('')

function reset() {
  started.value = false; finished.value = false
  pos.value = 0; typedStates.value = []
  errorsTotal.value = 0; correctTotal.value = 0; typedTotal.value = 0
  loops.value = 0; elapsed.value = 0; activeSec.value = 0
  errorKeys.value = {}; compBuffer.value = ''
  fullTarget.value = baseText.value
  clearInterval(timer); timer = null
  if (inputEl.value) inputEl.value.value = ''
}
watch(baseText, reset)
onMounted(() => { reset(); if (props.autoFocus) focus() })
onBeforeUnmount(() => clearInterval(timer))

function focus() { inputEl.value?.focus() }

function startTimer() {
  if (started.value) return
  started.value = true
  startTs = Date.now(); lastKeyTs = startTs
  timer = setInterval(() => {
    elapsed.value = (Date.now() - startTs) / 1000
    if (props.durationSec > 0 && elapsed.value >= props.durationSec) finish()
  }, 200)
}

function noteActivity() {
  const now = Date.now()
  if (lastKeyTs) activeSec.value += Math.min((now - lastKeyTs) / 1000, 3)
  lastKeyTs = now
}

// 接收一串新输入的字符（普通按键 1 个；中文上屏可能多个）
function consume(chars) {
  if (finished.value || !chars) return
  startTimer()
  noteApplyChars(chars)
  emit('progress', stats())
}

// 释义浮现：到达单词边界且整词打对时显示中文
const flash = ref(null)
let flashTimer = null, flashSeq = 0
function checkWordMeaning(boundaryPos) {
  if (!props.meanings) return
  const t = fullTarget.value
  let s = boundaryPos - 1
  while (s >= 0 && !/[\s\n]/.test(t[s])) s--
  const word = t.slice(s + 1, boundaryPos)
  const meaning = props.meanings[word] || props.meanings[word?.toLowerCase()]
  if (!word || !meaning) return
  // 仅整词全部打对时显示
  for (let i = s + 1; i < boundaryPos; i++) if (typedStates.value[i] !== 'ok') return
  flash.value = { word, meaning, id: flashSeq++ }
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => { flash.value = null }, 2000)
}

function noteApplyChars(chars) {
  noteActivity()
  for (const ch of chars) {
    const target = fullTarget.value[pos.value]
    if (target === undefined) break
    const ok = ch === target
    typedStates.value[pos.value] = ok ? 'ok' : 'err'
    typedTotal.value++
    if (ok) correctTotal.value++
    else {
      errorsTotal.value++
      const k = target.toLowerCase()
      errorKeys.value[k] = (errorKeys.value[k] || 0) + 1
    }
    playKey(settings.sound, ok)
    pos.value++
    if (ok && /[\s\n]/.test(ch)) checkWordMeaning(pos.value - 1)
  }
  // 循环：到达末尾
  if (pos.value >= fullTarget.value.length) {
    checkWordMeaning(pos.value)
    if (props.loop && props.durationSec > 0) {
      loops.value++
      fullTarget.value += '\n' + baseText.value
    } else {
      finish()
    }
  }
}

function onKeydown(e) {
  if (finished.value) return
  if (e.key === 'Backspace' && !composing.value) {
    e.preventDefault()
    if (pos.value > windowStart.value) {
      pos.value--
      const st = typedStates.value[pos.value]
      if (st === 'ok') correctTotal.value--
      typedStates.value[pos.value] = undefined
      typedTotal.value = Math.max(0, typedTotal.value - 1)
      noteActivity()
    }
    return
  }
  if (e.key === 'Enter' && !composing.value) {
    e.preventDefault(); consume('\n'); return
  }
  if (e.key === 'Tab') e.preventDefault()
}

function onInput(e) {
  if (composing.value) { compBuffer.value = e.target.value; return }
  const v = e.target.value
  if (v) consume(v)
  e.target.value = ''
}
function onCompStart() { composing.value = true }
function onCompEnd(e) {
  composing.value = false
  const v = e.target.value
  e.target.value = ''
  compBuffer.value = ''
  if (v) consume(v)
}

function stats() {
  const active = Math.max(activeSec.value, 0.5)
  const minutes = active / 60
  const cpm = correctTotal.value / minutes
  const wpm = (correctTotal.value / 5) / minutes
  // 错误累计计入准确率（退格修正不抹除错误记录）
  const denom = correctTotal.value + errorsTotal.value
  const accuracy = denom ? (correctTotal.value / denom) * 100 : 100
  return {
    cpm: Math.round(cpm), wpm: Math.round(wpm),
    accuracy: Math.round(accuracy * 10) / 10,
    errors: errorsTotal.value, correctChars: correctTotal.value, typedChars: typedTotal.value,
    durationSec: Math.round(elapsed.value * 10) / 10,
    activeSec: Math.round(activeSec.value * 10) / 10,
    errorKeys: { ...errorKeys.value }, loops: loops.value,
  }
}

function finish() {
  if (finished.value) return
  finished.value = true
  clearInterval(timer)
  emit('finish', stats())
}

defineExpose({ reset, focus, finish, stats })

// ------- 渲染窗口：按"循环轮次"整段展示（自动换行，从左到右），光标随行滚动 -------
const textBox = ref(null)
const windowStart = computed(() => loops.value * (baseText.value.length + 1))
const view = computed(() => {
  const t = fullTarget.value
  const slice = t.slice(windowStart.value, windowStart.value + baseText.value.length)
  return Array.from(slice).map((ch, i) => {
    const idx = windowStart.value + i
    return { ch: ch === '\n' ? '⏎\n' : ch, idx, state: idx === pos.value ? 'cur' : typedStates.value[idx], nl: ch === '\n' }
  })
})
watch(pos, () => nextTick(() => {
  const cur = textBox.value?.querySelector('.ch.cur')
  cur?.scrollIntoView({ block: 'nearest' })
}))
const remainSec = computed(() => props.durationSec > 0 ? Math.max(0, props.durationSec - elapsed.value) : null)
const live = computed(() => stats())
const nextKey = computed(() => fullTarget.value[pos.value] || '')
function fmtTime(s) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}` }
</script>

<template>
  <div class="engine" :class="{ dark: settings.isDark }" @click="focus">
    <div class="statbar">
      <div class="stat" v-if="remainSec !== null"><span class="label">剩余时间</span><span class="val time">{{ fmtTime(remainSec) }}</span></div>
      <div class="stat" v-else><span class="label">用时</span><span class="val time">{{ fmtTime(elapsed) }}</span></div>
      <div class="stat"><span class="label">CPM</span><span class="val">{{ live.cpm }}</span></div>
      <div class="stat"><span class="label">WPM</span><span class="val">{{ live.wpm }}</span></div>
      <div class="stat"><span class="label">准确率</span><span class="val">{{ live.accuracy }}%</span></div>
      <div class="stat"><span class="label">错误</span><span class="val err">{{ live.errors }}</span></div>
      <div class="stat" v-if="loops"><span class="label">循环</span><span class="val">×{{ loops + 1 }}</span></div>
    </div>

    <div ref="textBox" class="textarea-wrap" :style="{ fontSize: settings.fontPx + 'px', fontFamily: settings.fontFamily, lineHeight: settings.lineHeight }">
      <span v-for="c in view" :key="c.idx" class="ch" :class="[c.state, { nl: c.nl }]">{{ c.ch }}</span>
      <input ref="inputEl" class="ghost-input" autocomplete="off" autocapitalize="off" spellcheck="false"
        @keydown="onKeydown" @input="onInput" @compositionstart="onCompStart" @compositionend="onCompEnd"
        @focus="focused = true" @blur="focused = false" />
      <div v-if="!focused && !finished" class="focus-hint">点击此处开始打字</div>
      <div v-if="composing && compBuffer" class="ime-buffer">{{ compBuffer }}</div>
    </div>
    <Transition name="meaning">
      <div v-if="flash" :key="flash.id" class="meaning-flash">
        <span class="mf-word">{{ flash.word }}</span><span class="mf-sep">·</span><span class="mf-meaning">{{ flash.meaning }}</span>
      </div>
    </Transition>

    <KeyboardView v-if="showKeyboard" :active-key="nextKey" :error-keys="errorKeys" />
  </div>
</template>

<style scoped>
.engine { user-select: none; }
.statbar { display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 18px; border-radius: 12px;
  background: rgba(127,127,127,.08); margin-bottom: 16px; }
.stat { display: flex; flex-direction: column; align-items: center; min-width: 56px; }
.stat .label { font-size: 12px; opacity: .6; }
.stat .val { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.stat .val.time { color: var(--kp-primary, #4F46E5); }
.stat .val.err { color: #ef4444; }
.textarea-wrap { position: relative; padding: 24px 28px; border-radius: 12px; min-height: 130px;
  max-height: 320px; overflow-y: auto; scroll-padding: 60px;
  background: rgba(255,255,255,.78); border: 2px solid rgba(127,127,127,.15); cursor: text;
  word-break: break-all; white-space: pre-wrap; }
.dark .textarea-wrap { background: rgba(0,0,0,.35); }
.ch { opacity: .55; border-radius: 3px; transition: background .08s; }
.ch.ok { opacity: 1; color: #10b981; }
.ch.err { opacity: 1; color: #ef4444; background: rgba(239,68,68,.15); animation: shake .15s; }
.ch.cur { opacity: 1; background: var(--kp-primary, #4F46E5); color: #fff; animation: blink 1s infinite; }
.ch.nl { opacity: .3; }
@keyframes blink { 50% { filter: brightness(1.4); } }
@keyframes shake { 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
.ghost-input { position: absolute; opacity: 0; left: 0; top: 0; width: 100%; height: 100%; border: none; cursor: text; }
.focus-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(127,127,127,.25); backdrop-filter: blur(2px); border-radius: 12px;
  font-size: 16px; font-weight: 600; pointer-events: none; }
.ime-buffer { position: absolute; bottom: -34px; left: 12px; padding: 2px 10px; border-radius: 6px;
  background: var(--kp-primary, #4F46E5); color: #fff; font-size: 14px; }
.meaning-flash { position: sticky; bottom: 8px; margin: 10px auto 0; width: fit-content;
  padding: 6px 18px; border-radius: 20px; font-size: 18px;
  background: linear-gradient(90deg, var(--kp-primary, #4F46E5), var(--kp-secondary, #7C3AED));
  color: #fff; box-shadow: 0 6px 18px rgba(79,70,229,.35); }
.mf-word { font-weight: 800; font-family: 'JetBrains Mono', monospace; }
.mf-sep { margin: 0 8px; opacity: .6; }
.mf-meaning { font-weight: 600; }
.meaning-enter-active { animation: mfpop .3s; }
.meaning-leave-active { transition: opacity .4s; }
.meaning-leave-to { opacity: 0; }
@keyframes mfpop { 0% { transform: translateY(12px) scale(.7); opacity: 0; } 100% { transform: none; opacity: 1; } }
</style>
