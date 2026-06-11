<script setup>
// 可视化键盘：高亮下一个键；可叠加错误热力
import { computed } from 'vue'

const props = defineProps({
  activeKey: { type: String, default: '' },
  errorKeys: { type: Object, default: () => ({}) },  // {key: count}
  heatmap: { type: Boolean, default: false },         // 纯热力图模式
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
function label(k) {
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
</script>

<template>
  <div class="kbd">
    <div v-for="(row, ri) in ROWS" :key="ri" class="krow">
      <div v-for="k in row" :key="k" class="key"
        :style="{ flex: WIDE[k] || 1, '--heat': heat(k) }"
        :class="{ active: isActive(k), hot: heat(k) > 0 }">
        {{ label(k) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.kbd { margin-top: 18px; max-width: 760px; margin-left: auto; margin-right: auto; }
.krow { display: flex; gap: 5px; margin-bottom: 5px; }
.key { height: 42px; border-radius: 7px; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 600; background: rgba(127,127,127,.12); color: inherit;
  border: 1px solid rgba(127,127,127,.15); transition: all .1s; position: relative; overflow: hidden; }
.key.hot::after { content: ''; position: absolute; inset: 0; background: #ef4444; opacity: calc(var(--heat) * .65); }
.key.active { background: var(--kp-primary, #4F46E5); color: #fff; transform: translateY(2px);
  box-shadow: 0 0 12px var(--kp-primary, #4F46E5); }
</style>
