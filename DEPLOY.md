# Vercel 部署步骤

这个版本面向 Vercel 正式部署，数据库使用 PostgreSQL，图片使用 Vercel Blob。

## 1. 导入 GitHub 仓库

在 Vercel 新建项目，选择：

```text
melontjc/food-analyze
```

Vercel 会读取 `vercel.json`，构建命令已经配置为：

```text
npm run vercel-build
```

这个命令会先执行 Prisma 数据库迁移，再构建 Next.js。

## 2. 创建数据库

在 Vercel 项目里创建或绑定 PostgreSQL 数据库。也可以使用 Neon、Supabase Postgres。

把数据库连接串填入环境变量：

```text
DATABASE_URL
```

连接串格式通常类似：

```text
postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require
```

## 3. 创建 Blob 存储

在 Vercel 项目里创建 Blob Store，把生成的读写 token 填入：

```text
BLOB_READ_WRITE_TOKEN
```

如果暂时不配置 Blob，图片识别仍可工作，但图片 URL 不会长期保存。

## 4. 填写环境变量

在 Vercel Project Settings -> Environment Variables 里填写：

```text
DATABASE_URL
BLOB_READ_WRITE_TOKEN
APP_URL
APP_ENCRYPTION_KEY
ADMIN_EMAIL
ADMIN_PASSWORD_HASH
OPENAI_API_KEY
OPENAI_MODEL
OURA_CLIENT_ID
OURA_CLIENT_SECRET
INTERVALS_API_KEY
INTERVALS_ATHLETE_ID
CRON_SECRET
```

`APP_URL` 填正式域名，例如：

```text
https://food-analyze.vercel.app
```

`APP_ENCRYPTION_KEY` 需要是一个长随机字符串。可以本地生成：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`ADMIN_PASSWORD_HASH` 用 bcrypt 生成：

```powershell
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash(process.argv[1],10).then(console.log)" "你的登录密码"
```

## 5. 配置 Oura 回调

到 Oura Developer 后台，把 Redirect URI 改成：

```text
https://你的正式域名/api/connections/oura/callback
```

这个域名要和 `APP_URL` 一致。

## 6. 部署后检查

部署成功后打开正式域名：

1. 使用 `ADMIN_EMAIL` 和原始密码登录。
2. 到设置页连接 Oura。
3. 填写 Intervals.icu API Key 和 Athlete ID。
4. 上传一张餐食图片测试 OpenAI 识别。
5. 输入一次体重，确认 7 日体重图有数据。
6. 手动同步一次，确认 Oura 和 Intervals 数据入账。

## 7. 回滚

当前重要快照：

```text
3aee167 Initial food calorie platform snapshot
76ce7a3 Add TailAdmin-style dashboard layout
```

如果部署版不满意，可以从 GitHub 或本地 Git 回到这些提交。
