<script setup>
import { computed } from 'vue'

const props = defineProps({
  activeKey: { type: String, default: '' },
  errorKeys: { type: Object, default: () => ({}) },
  heatmap: { type: Boolean, default: false },
  showFinger: { type: Boolean, default: true },
})

const ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
  ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Shift2'],
  ['Space'],
]
const WIDE = { Backspace: 2, Tab: 1.5, '\\': 1.5, Caps: 1.8, Enter: 2.2, Shift: 2.3, Shift2: 2.7, Space: 9 }
const SHIFT_MAP = { '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/' }

// 反向：基础键 → Shift 字符
const KEY_SHIFT = Object.fromEntries(Object.entries(SHIFT_MAP).map(([s, b]) => [b, s]))

// 指法分配：0=左小指 1=左无名 2=左中指 3=左食指 4=拇指 5=右食指 6=右中指 7=右无名 8=右小指
const FINGER_MAP = {
  '`': 0, '1': 0, '2': 1, '3': 2, '4': 3, '5': 3,
  '6': 5, '7': 5, '8': 6, '9': 7, '0': 8, '-': 8, '=': 8, 'Backspace': 8,
  'Tab': 0, 'q': 0, 'w': 1, 'e': 2, 'r': 3, 't': 3,
  'y': 5, 'u': 5, 'i': 6, 'o': 7, 'p': 8, '[': 8, ']': 8, '\\': 8,
  'Caps': 0, 'a': 0, 's': 1, 'd': 2, 'f': 3, 'g': 3,
  'h': 5, 'j': 5, 'k': 6, 'l': 7, ';': 8, "'": 8, 'Enter': 8,
  'Shift': 0, 'z': 0, 'x': 1, 'c': 2, 'v': 3, 'b': 3,
  'n': 5, 'm': 5, ',': 6, '.': 7, '/': 8, 'Shift2': 8,
  'Space': 4,
}
const FINGER_COLORS = ['#fb923c', '#c084fc', '#60a5fa', '#4ade80', '#94a3b8', '#facc15', '#22d3ee', '#f472b6', '#a3e635']
const FINGER_LABELS = ['左小指', '左无名', '左中指', '左食指', '拇指', '右食指', '右中指', '右无名', '右小指']

const maxErr = computed(() => Math.max(1, ...Object.values(props.errorKeys)))

function targetKey() {
  const k = props.activeKey
  if (!k) return { key: '', shift: false }
  if (k === ' ') return { key: 'Space', shift: false }
  if (k === '\n') return { key: 'Enter', shift: false }
  const lower = k.toLowerCase()
  if (/[a-z]/.test(lower) && lower.length === 1) return { key: lower, shift: k !== lower }
  if (SHIFT_MAP[k]) return { key: SHIFT_MAP[k], shift: true }
  return { key: k, shift: false }
}
const tk = computed(targetKey)

function heat(k) {
  const key = k === 'Space' ? ' ' : k.toLowerCase()
  const n = props.errorKeys[key] || 0
  return n ? Math.min(1, n / maxErr.value) : 0
}
function mainLabel(k) {
  if (k === 'Shift2') return 'Shift'
  if (k === 'Space') return '空格'
  return k.length === 1 ? k.toUpperCase() : k
}
function isActive(k) {
  if (props.heatmap) return false
  if (k === tk.value.key) return true
  if (tk.value.shift && (k === 'Shift' || k === 'Shift2')) return true
  return false
}
function keyStyle(k) {
  const fi = FINGER_MAP[k]
  const fcolor = (props.showFinger && fi !== undefined) ? FINGER_COLORS[fi] : null
  return {
    flex: WIDE[k] || 1,
    '--heat': heat(k),
    '--fcolor': fcolor || 'transparent',
  }
}
</script>

<template>
  <div class="kbd">
    <div v-for="(row, ri) in ROWS" :key="ri" class="krow">
      <div v-for="k in row" :key="k" class="key"
        :style="keyStyle(k)"
        :class="{ active: isActive(k), hot: heat(k) > 0, 'has-finger': showFinger && FINGER_MAP[k] !== undefined }">
        <span v-if="KEY_SHIFT[k]" class="key-shift">{{ KEY_SHIFT[k] }}</span>
        <span class="key-main">{{ mainLabel(k) }}</span>
      </div>
    </div>

    <div v-if="showFinger" class="finger-legend">
      <div v-for="(lbl, i) in FINGER_LABELS" :key="i" class="legend-item">
        <span class="legend-dot" :style="{ background: FINGER_COLORS[i] }"></span>
        <span class="legend-lbl">{{ lbl }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kbd { margin-top: 10px; max-width: 780px; margin-left: auto; margin-right: auto; }
.krow { display: flex; gap: 4px; margin-bottom: 4px; }
.key {
  height: 38px; border-radius: 6px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1px;
  font-weight: 600; background: rgba(127,127,127,.12); color: inherit;
  border: 1px solid rgba(127,127,127,.18); transition: all .1s;
  position: relative; overflow: hidden; cursor: default;
}
.key.has-finger { border-bottom: 3px solid var(--fcolor); }
.key.hot::after { content: ''; position: absolute; inset: 0; background: #ef4444; opacity: calc(var(--heat) * .6); pointer-events: none; }
.key.active {
  background: var(--kp-primary, #4F46E5); color: #fff;
  transform: translateY(2px); border-bottom-color: transparent;
  box-shadow: 0 0 10px var(--kp-primary, #4F46E5);
}
.key-shift { font-size: 9px; line-height: 1; opacity: .65; }
.key-main { font-size: 11px; line-height: 1; }

.finger-legend {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  margin-top: 8px; justify-content: center;
}
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.legend-lbl { font-size: 11px; opacity: .65; }
</style>
