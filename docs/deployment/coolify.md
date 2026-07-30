# Coolify 部署说明

MES-lite 当前使用 SQLite，适合单实例 Docker 部署。数据库和上传附件必须挂载到主机持久目录，容器可以重建，主机数据目录不能随容器删除。

## 1. 本地验证

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start
```

浏览器打开 `http://localhost:3000`。开发管理员可通过 `npm run dev:admin` 重置为 `admin / admin123`；该脚本禁止在生产环境执行。

## 2. Docker 本地验证

```bash
mkdir -p .runtime/data .runtime/uploads
docker compose up --build
```

本地 Compose 使用以下主机目录：

```text
./.runtime/data     -> /app/data
./.runtime/uploads  -> /app/public/uploads
```

停止容器后，使用 `docker compose up` 再次启动，原有数据库和附件应继续存在。

## 3. Coolify 配置

在 Coolify 中以仓库根目录的 `Dockerfile` 构建：

- 应用端口：`3000`
- 健康检查路径：`/api/health`
- 实例数量：`1`
- 构建上下文：仓库根目录
- Dockerfile：`Dockerfile`

环境变量：

```env
NODE_ENV=production
DATABASE_URL=file:/app/data/mes_lite.db
```

也可以参考仓库内的 `.env.coolify.example`，在 Coolify 的 Environment Variables 页面逐项填写。不要把生产 `.env` 文件提交到 Git。

主机先创建目录：

```bash
sudo mkdir -p /opt/mes-lite/data /opt/mes-lite/uploads
```

在 Coolify 的 Persistent Storage 中添加两个 Bind Mount：

```text
主机目录                    容器目录
/opt/mes-lite/data       -> /app/data
/opt/mes-lite/uploads    -> /app/public/uploads
```

容器启动入口会先以 root 身份幂等修复 `/app/data` 与 `/app/public/uploads` 的所有者和读写权限，再立即通过 `gosu` 降权为 `node` 用户；随后创建 SQLite 文件、执行 `prisma migrate deploy` 并启动 Next.js。应用进程本身不会以 root 运行。全新数据库首次注册的用户会自动成为管理员；已有数据库则继续使用原账号。

默认目录可通过以下环境变量调整，但禁止把 `/`、`/app` 或 `/app/public` 这类过宽目录设为修复目标：

```env
MES_LITE_DATA_DIR=/app/data
MES_LITE_UPLOAD_DIR=/app/public/uploads
MES_LITE_STORAGE_USER=node
MES_LITE_STORAGE_GROUP=node
```

需要在运行中的容器内手动复查或修复时，可以执行：

```bash
docker exec -u root <容器名> npm run storage:fix
```

脚本会递归修复 SQLite 数据库、WAL/SHM 文件及附件子目录，并验证降权后的 `node` 用户确实可写；无法修复时容器会停止并输出明确错误。

`20260730163000_link_work_instructions_to_material` 是一次明确的破坏性迁移：首次执行前会删除旧指导书专属附件目录，迁移会删除旧指导书及对应附件元数据，然后启用产品必选的“产品文档”模型。迁移完成后，启动脚本通过迁移记录识别已执行状态，不会再次清理新产品文档。

镜像内置了 Docker `HEALTHCHECK`，使用 `curl` 请求 `/api/health` 检查 Web 服务是否启动。首次启动会先执行 SQLite 迁移，健康检查有 60 秒启动宽限期。如果健康检查失败，优先检查：

- `/app/data` 是否可写。
- `DATABASE_URL` 是否为 `file:/app/data/mes_lite.db`。
- Coolify 的 Persistent Storage 是否正确挂载。
- 启动日志是否出现“持久存储权限已就绪”；若未出现，检查挂载是否允许容器 root 用户执行 `chown`。

## 4. 部署与备份

代码推送到 Git 仓库后，在 Coolify 连接该仓库并部署。每次发布前至少备份：

```bash
sudo tar -czf "/opt/backups/mes-lite-$(date +%F-%H%M%S).tar.gz" /opt/mes-lite
```

SQLite 数据目录只能由一个运行中的应用实例写入。需要多实例或滚动部署时，应先迁移到 PostgreSQL，并将附件迁移到对象存储或共享文件存储。
