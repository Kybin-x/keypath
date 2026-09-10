// TOTP (RFC 6238) — 使用 Web Crypto API，无外部依赖
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function b32Decode(s) {
  s = s.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bits = [...s].map(c => B32.indexOf(c).toString(2).padStart(5, '0')).join('')
  return new Uint8Array((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)))
}

function b32Encode(buf) {
  const bytes = Array.from(buf)
  const bits = bytes.map(b => b.toString(2).padStart(8, '0')).join('')
  const groups = bits.match(/.{1,5}/g) || []
  const raw = groups.map(g => B32[parseInt(g.padEnd(5, '0'), 2)]).join('')
  const pad = (4 - raw.length % 4) % 4
  return raw + '='.repeat(pad === 4 ? 0 : pad)
}

async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey(
    'raw', b32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  const buf = new ArrayBuffer(8)
  const dv = new DataView(buf)
  dv.setUint32(0, Math.floor(counter / 2 ** 32), false)
  dv.setUint32(4, counter >>> 0, false)
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf))
  const offset = hmac[19] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1_000_000
  return code.toString().padStart(6, '0')
}

export function generateSecret() {
  const buf = new Uint8Array(20)
  crypto.getRandomValues(buf)
  return b32Encode(buf)
}

export async function verifyTotp(secret, code, window = 1) {
  const t = Math.floor(Date.now() / 30000)
  const target = String(code).replace(/\s/g, '').padStart(6, '0')
  for (let i = -window; i <= window; i++) {
    if (await hotp(secret, t + i) === target) return true
  }
  return false
}

export function totpUri(secret, account, issuer = '键途 KeyPath') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
