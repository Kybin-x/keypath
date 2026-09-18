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
const KEY_SHIFT = Object.fromEntries(Object.entries(SHIFT_MAP).map(([s, b]) => [b, s]))

// 指法分配 0=左小 1=左无 2=左中 3=左食 4=左拇/右拇 5=右食 6=右中 7=右无 8=右小
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
const FINGER_COLORS = ['#fb923c','#c084fc','#60a5fa','#4ade80','#94a3b8','#facc15','#22d3ee','#f472b6','#a3e635']

// 左手从小指→拇指排列，右手从拇指→小指排列
const LEFT_FINGERS  = [
  { name: '小', fi: 0, thumb: false },
  { name: '无', fi: 1, thumb: false },
  { name: '中', fi: 2, thumb: false },
  { name: '食', fi: 3, thumb: false },
  { name: '拇', fi: 4, thumb: true  },
]
const RIGHT_FINGERS = [
  { name: '拇', fi: 4, thumb: true,  right: true },
  { name: '食', fi: 5, thumb: false, right: true },
  { name: '中', fi: 6, thumb: false, right: true },
  { name: '无', fi: 7, thumb: false, right: true },
  { name: '小', fi: 8, thumb: false, right: true },
]

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

// 判断某个 fi 是否需要激活
function isFingerActive(fi, isRight) {
  if (props.heatmap || !tk.value.key) return false
  const keyFi = FINGER_MAP[tk.value.key]
  if (keyFi === undefined) return false

  // Space：双拇指同时亮
  if (tk.value.key === 'Space') return fi === 4

  // 主键手指
  if (keyFi === fi) {
    // fi=4 是拇指，Space 已处理；普通键不用拇指，此处不会触发
    return true
  }

  // Shift 键：用与主键相对的那只手的小指
  if (tk.value.shift) {
    if (keyFi <= 4) return fi === 8 && isRight   // 左手键 → 右小指按 Shift
    else            return fi === 0 && !isRight   // 右手键 → 左小指按 Shift
  }

  return false
}

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
  return { flex: WIDE[k] || 1, '--heat': heat(k), '--fcolor': fcolor || 'transparent' }
}

const activeFingerLabel = computed(() => {
  if (!tk.value.key) return ''
  const fi = FINGER_MAP[tk.value.key]
  if (fi === undefined) return ''
  const labels = ['左小指','左无名指','左中指','左食指','拇指','右食指','右中指','右无名指','右小指']
  let hint = labels[fi]
  if (tk.value.key === 'Space') hint = '双手拇指'
  if (tk.value.shift) {
    const shiftHand = fi <= 4 ? '右小指' : '左小指'
    hint += ` + ${shiftHand}(Shift)`
  }
  return hint
})
</script>

<template>
  <div class="kbd">
    <!-- 键盘行 -->
    <div v-for="(row, ri) in ROWS" :key="ri" class="krow">
      <div v-for="k in row" :key="k" class="key"
        :style="keyStyle(k)"
        :class="{ active: isActive(k), hot: heat(k) > 0, 'has-finger': showFinger && FINGER_MAP[k] !== undefined }">
        <span v-if="KEY_SHIFT[k]" class="key-shift">{{ KEY_SHIFT[k] }}</span>
        <span class="key-main">{{ mainLabel(k) }}</span>
      </div>
    </div>

    <!-- 动态手指提示 -->
    <div v-if="showFinger" class="finger-hint">
      <!-- 左手 -->
      <div class="hand left-hand">
        <div class="hand-label">左手</div>
        <div class="fingers">
          <div v-for="f in LEFT_FINGERS" :key="'l'+f.fi"
            class="fing" :class="{ 'fing-active': isFingerActive(f.fi, false), thumb: f.thumb }"
            :style="{ '--fc': FINGER_COLORS[f.fi] }">
            <span class="fing-name">{{ f.name }}</span>
          </div>
        </div>
      </div>

      <!-- 中间提示文字 -->
      <div class="hint-center">
        <div class="hint-key" v-if="tk.key">{{ mainLabel(tk.key) }}<span v-if="tk.shift" class="hint-shift"> +Shift</span></div>
        <div class="hint-finger">{{ activeFingerLabel }}</div>
      </div>

      <!-- 右手 -->
      <div class="hand right-hand">
        <div class="hand-label">右手</div>
        <div class="fingers">
          <div v-for="f in RIGHT_FINGERS" :key="'r'+f.fi"
            class="fing" :class="{ 'fing-active': isFingerActive(f.fi, true), thumb: f.thumb }"
            :style="{ '--fc': FINGER_COLORS[f.fi] }">
            <span class="fing-name">{{ f.name }}</span>
          </div>
        </div>
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
.key-main  { font-size: 11px; line-height: 1; }

/* ── 手指提示区 ── */
.finger-hint {
  display: flex; align-items: flex-end; justify-content: center;
  gap: 12px; margin-top: 14px; flex-wrap: wrap;
}
.hand { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.hand-label { font-size: 11px; opacity: .5; }
.fingers { display: flex; align-items: flex-end; gap: 5px; }

/* 手指形状 */
.fing {
  width: 30px; height: 52px;
  border-radius: 15px 15px 7px 7px;
  background: rgba(127,127,127,.12);
  border: 2px solid rgba(127,127,127,.2);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
  opacity: .55; transition: all .18s cubic-bezier(.34,1.56,.64,1);
  cursor: default; position: relative;
}
.fing.thumb {
  width: 36px; height: 36px;
  border-radius: 10px; margin-bottom: 0;
}
.fing.fing-active {
  background: var(--fc); color: #fff; opacity: 1;
  transform: translateY(-8px);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--fc) 60%, transparent);
}
.fing.thumb.fing-active { transform: translateY(-5px); }

/* 中间文字 */
.hint-center {
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 0 8px; min-width: 90px; text-align: center;
}
.hint-key {
  font-size: 22px; font-weight: 800;
  color: var(--kp-primary, #4F46E5); line-height: 1;
}
.hint-shift { font-size: 12px; font-weight: 600; opacity: .7; }
.hint-finger { font-size: 12px; opacity: .65; }
</style>
