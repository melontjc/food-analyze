# Food Deficit

响应式图片热量分析与热量缺口看板。电脑和 iOS Safari 都可以上传餐食图片；服务端会先压缩图片，再调用 OpenAI 视觉模型生成餐食热量草稿。草稿需要确认后才计入当天摄入。

## 核心口径

- 摄入：只统计 `confirmed` 餐食。
- 消耗：`Oura 静息消耗 + Intervals.icu 训练消耗`。
- Oura active calories 只用于推导静息消耗，不直接加入总消耗。
- 7 日预测：`最近 7 日累计缺口 / 3850 = 预计下降斤数`。

## 本地启动

```powershell
npm.cmd install
Copy-Item .env.example .env
```

生成管理员密码哈希：

```powershell
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash(process.argv[1],10).then(console.log)" "your-password"
```

把输出填入 `.env` 的 `ADMIN_PASSWORD_HASH`。

初始化数据库：

```powershell
npx.cmd prisma generate
npm.cmd run db:local:init
npm.cmd run dev
```

## Vercel

当前本地开发默认使用 SQLite，`DATABASE_URL="file:./dev.db"`。如果要部署到 Vercel Postgres，需要把 `prisma/schema.prisma` 的 datasource provider 改为 `postgresql`，并把 `DATABASE_URL` 改成 Vercel Postgres 的连接串。`vercel.json` 已配置每 3 小时调用一次 `/api/cron/sync`。

## 图片成本控制

上传接口会拒绝超过 8MB 的图片，并在发给 OpenAI 前执行：

- 自动旋转方向；
- 最长边限制到 1280px；
- 转成质量 72 的 JPEG；
- 入库记录 `originalBytes` 和 `compressedBytes`。

原图和压缩图会在配置 `BLOB_READ_WRITE_TOKEN` 后上传到 Vercel Blob；模型只接收压缩图。
