/**
 * 键途 KeyPath — Supabase 保活 Worker
 *
 * 免费版 Supabase 项目在 7 天无活动后会被暂停，需要手动到控制台恢复。
 * 本 Worker 每 3 天向数据库发一次读 + 写请求，重置那个 7 天计时器。
 *
 * 写入目标是 app_config 表的 keepalive 行（只读请求是否计入活动没有明确保证，
 * 因此额外做一次 upsert，确保一定产生数据库写入）。
 */

const PING_PATH = '/rest/v1/app_config'
const PROBE_PATH = '/rest/v1/achievements?select=id&limit=1'

async function ping(env) {
  const { SUPABASE_URL, SUPABASE_KEY } = env
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_KEY 配置')
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  }
  const now = new Date().toISOString()

  // 1) 读一次：确认数据库真的活着（暂停时这里会失败）
  const probe = await fetch(SUPABASE_URL + PROBE_PATH, { headers })

  // 2) 写一次：产生确定的数据库活动
  const write = await fetch(SUPABASE_URL + PING_PATH, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ key: 'keepalive', value: { last_ping: now }, updated_at: now }]),
  })

  const ok = probe.ok && write.ok
  const result = {
    ok,
    at: now,
    probe: probe.status,
    write: write.status,
    detail: ok ? '' : `${await probe.text().catch(() => '')} ${await write.text().catch(() => '')}`.trim(),
  }

  if (ok) console.log('keepalive ok', now)
  else console.error('keepalive failed', JSON.stringify(result))

  return result
}

export default {
  // 定时触发（见 wrangler.toml 的 crons）
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ping(env))
  },

  // 浏览器访问 Worker 域名可手动触发一次，用于部署后立刻验证
  async fetch(request, env) {
    const result = await ping(env).catch((e) => ({ ok: false, detail: String(e) }))
    return new Response(JSON.stringify(result, null, 2), {
      status: result.ok ? 200 : 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
  },
}
