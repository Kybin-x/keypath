# Supabase 保活 Worker

免费版 Supabase 项目在 **7 天无活动**后会被暂停，需要人工登录控制台点击恢复。
本 Worker 每 2 天自动向数据库发一次读 + 写请求，把这个计时器重置掉，
这样寒暑假等长期不使用的时段也不会掉线。

## 部署

```bash
cd keypath/keepalive
wrangler deploy
```

首次运行会要求登录 Cloudflare 账号（浏览器授权）。

## 验证

部署完成后 wrangler 会输出一个 `*.workers.dev` 地址，直接用浏览器打开它可以
手动触发一次，返回 JSON：

```json
{ "ok": true, "at": "2026-08-12T03:00:00.000Z", "probe": 200, "write": 201 }
```

`ok: true` 即表示保活链路通了。之后就交给定时任务，无需再管。

## 查看运行日志

```bash
wrangler tail keypath-keepalive
```

## 费用

Cloudflare Workers 免费版每天 10 万次请求、Cron Trigger 无额外收费。
本 Worker 每 2 天才跑一次，用量可忽略。

## 注意

- 它写入的是 `app_config` 表里 `key = 'keepalive'` 的一行，不影响任何业务数据。
- 如果 Supabase 项目已经处于暂停状态，需要先到控制台手动恢复一次，
  这个 Worker 才能起作用——它能防止暂停，但唤不醒已经暂停的项目。
