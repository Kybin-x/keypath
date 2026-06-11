// 轻量礼花特效（DOM + Web Animations API，无依赖）
const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#fde047', '#22d3ee']

// x/y 为相对视口的比例（0~1）
export function confetti({ count = 50, x = 0.5, y = 0.4, spread = 1 } = {}) {
  const cx = x * window.innerWidth, cy = y * window.innerHeight
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div')
    const size = 6 + Math.random() * 6
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 0.4)}px;` +
      `background:${COLORS[i % COLORS.length]};border-radius:${Math.random() < 0.3 ? '50%' : '2px'};` +
      'pointer-events:none;z-index:9999;'
    document.body.appendChild(el)
    const ang = Math.random() * Math.PI * 2
    const dist = (60 + Math.random() * 220) * spread
    const dx = Math.cos(ang) * dist
    const dy = Math.sin(ang) * dist * 0.6 + 180 + Math.random() * 120 // 整体下落
    el.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 700, easing: 'cubic-bezier(.15,.6,.4,1)' })
      .onfinish = () => el.remove()
  }
}
