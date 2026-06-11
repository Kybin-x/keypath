// DiceBear 头像（https://dicebear.com 免费开源，URL 直接调用）
export const AVATAR_STYLES = [
  { key: 'adventurer', label: '卡通人物' },
  { key: 'lorelei', label: '清新插画' },
  { key: 'pixel-art', label: '像素风' },
  { key: 'bottts', label: '机器人' },
  { key: 'fun-emoji', label: '趣味表情' },
  { key: 'thumbs', label: '萌趣大拇指' },
  { key: 'shapes', label: '抽象几何' },
  { key: 'big-smile', label: '大笑脸' },
]

export function avatarUrl(avatar, fallbackSeed = 'guest') {
  if (!avatar) return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(fallbackSeed)}`
  if (avatar.startsWith('http')) return avatar
  // 格式：style:seed
  const [style, ...rest] = avatar.split(':')
  const seed = rest.join(':') || fallbackSeed
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`
}
