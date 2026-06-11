// 键盘音效（WebAudio 合成，无需音频文件）
let ctx
function ac() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx }

function blip({ freq = 600, dur = 0.05, type = 'square', gain = 0.08, slide = 0 }) {
  const c = ac()
  const o = c.createOscillator(), g = c.createGain()
  o.type = type; o.frequency.value = freq
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur)
  g.gain.setValueAtTime(gain, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  o.connect(g).connect(c.destination)
  o.start(); o.stop(c.currentTime + dur)
}

function noise(dur = 0.03, gain = 0.06) {
  const c = ac()
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const s = c.createBufferSource(), g = c.createGain()
  s.buffer = buf; g.gain.value = gain
  s.connect(g).connect(c.destination); s.start()
}

export const SOUND_SCHEMES = [
  { key: 'mech', label: '经典机械键盘音' },
  { key: 'membrane', label: '薄膜键盘音' },
  { key: 'game', label: '游戏风音效' },
  { key: 'crystal', label: '清脆水晶音' },
  { key: 'mute', label: '静音模式' },
]

export function playKey(scheme, correct = true) {
  try {
    if (scheme === 'mute') return
    if (!correct) { blip({ freq: 160, dur: 0.12, type: 'sawtooth', gain: 0.1, slide: -80 }); return }
    switch (scheme) {
      case 'mech': noise(0.025, 0.09); blip({ freq: 2200, dur: 0.02, type: 'square', gain: 0.03 }); break
      case 'membrane': noise(0.02, 0.04); break
      case 'game': blip({ freq: 880, dur: 0.05, type: 'square', gain: 0.05, slide: 300 }); break
      case 'crystal': blip({ freq: 1760, dur: 0.09, type: 'sine', gain: 0.06, slide: 200 }); break
    }
  } catch { /* 忽略音频错误 */ }
}

export function playFx(name) {
  try {
    switch (name) {
      case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip({ freq: f, dur: 0.15, type: 'triangle', gain: 0.1 }), i * 120)); break
      case 'lose': [400, 320, 240].forEach((f, i) => setTimeout(() => blip({ freq: f, dur: 0.2, type: 'sawtooth', gain: 0.08 }), i * 150)); break
      case 'boom': noise(0.4, 0.2); blip({ freq: 90, dur: 0.4, type: 'sawtooth', gain: 0.15, slide: -50 }); break
      case 'pop': blip({ freq: 700, dur: 0.07, type: 'triangle', gain: 0.09, slide: 500 }); break
      case 'tick': blip({ freq: 1000, dur: 0.03, type: 'sine', gain: 0.05 }); break
    }
  } catch { /* ignore */ }
}
