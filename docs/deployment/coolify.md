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
mkdir -p .runtime/data .runtime/uploads .runtime/backups
docker compose up --build
```

本地 Compose 使用以下主机目录：

```text
./.runtime/data     -> /app/data
./.runtime/uploads  -> /app/public/uploads
./.runtime/backups  -> /app/backups
```

停止容器后，使用 `docker compose up` 再次启动，原有数据库和附件应继续存在。

## 3. Coolify 配置

在 Coolify 中以仓库根目录的 `Dockerfile` 构建：

- 应用端口：`3000`
- 健康检查路径：`/api/health/ready`
- 实例数量：`1`
- 构建上下文：仓库根目录
- Dockerfile：`Dockerfile`

环境变量：

```env
NODE_ENV=production
DATABASE_URL=file:/app/data/mes_lite.db
MES_LITE_DATABASE_PATH=/app/data/mes_lite.db
MES_LITE_DATA_DIR=/app/data
MES_LITE_UPLOAD_DIR=/app/public/uploads
MES_LITE_BACKUP_DIR=/app/backups
MES_LITE_BACKUP_RETENTION_COUNT=30
MES_LITE_BACKUP_RETENTION_DAYS=14
MES_LITE_BACKUP_MAX_AGE_HOURS=26
MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=true
MES_TRUSTED_ORIGINS=https://mes.example.com
MES_PUBLIC_REGISTRATION_ENABLED=false
```

`MES_TRUSTED_ORIGINS` 必须填写浏览器实际访问的 HTTPS Origin（协议、域名和可选端口，不带路径）。所有 `POST / PUT / PATCH / DELETE` API 都会先执行同源校验；多个可信 Origin 使用英文逗号分隔。公开注册默认关闭，只有在受控注册时间窗口才临时把 `MES_PUBLIC_REGISTRATION_ENABLED` 改为 `true`，新账号仍统一进入待审核状态。

启用全局 AI 协作助手时，在 Coolify 增加以下运行时变量。第一版默认使用阿里云百炼的 OpenAI 兼容接口，也可替换为其他国产兼容服务；密钥不得写入仓库或前端变量：

```env
AI_AGENT_ENABLED=true
AI_AGENT_PROVIDER_NAME=通义千问
AI_AGENT_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_AGENT_MODEL=<百炼中已开通且支持工具调用的模型 ID>
AI_AGENT_API_KEY=<服务端 API Key>
AI_AGENT_CONFIG_SECRET=<页面密钥加密主密钥>
AI_AGENT_TIMEOUT_MS=45000
AI_AGENT_MAX_TOOL_ROUNDS=4
```

`AI_AGENT_CONFIG_SECRET` 用于加密管理员在系统页面保存的 API Key，应使用 `openssl rand -hex 32` 生成一次并长期保留。修改或丢失该值后，数据库中的既有页面密钥无法解密，需要管理员重新录入。该主密钥不能写入数据库、仓库或客户端变量。

部署后，管理员可在“配置 → 系统设置 → AI 助手配置”维护提供商、接口地址、模型、API Key、超时和工具轮次。页面配置优先于环境变量；未建立页面配置或未保存页面密钥时继续使用上述环境变量。缺少模型或可用 API Key 时，全局入口仍可见但明确显示“AI 服务尚未配置”，不会向外部模型发送数据。

也可以参考仓库内的 `.env.coolify.example`，在 Coolify 的 Environment Variables 页面逐项填写。不要把生产 `.env` 文件提交到 Git。

主机先创建目录：

```bash
sudo mkdir -p /opt/mes-lite/data /opt/mes-lite/uploads /opt/mes-lite/backups
```

在 Coolify 的 Persistent Storage 中添加两个 Bind Mount：

```text
主机目录                    容器目录
/opt/mes-lite/data       -> /app/data
/opt/mes-lite/uploads    -> /app/public/uploads
/opt/mes-lite/backups    -> /app/backups
```

产品文档图片/PDF 的持久缩略图与原文件存放在同一个 uploads 挂载中，不需要新增存储卷；迁移或备份时必须整体保留该目录。

容器启动入口会先以 root 身份幂等修复 `/app/data`、`/app/public/uploads` 与 `/app/backups` 的所有者和读写权限，再立即通过 Debian 基础镜像内置的 `setpriv` 降权为 `node` 用户。已有 SQLite 非空且显式开启迁移前备份时，会先创建并验证数据库+附件备份，再清理兼容文件、执行 `prisma migrate deploy` 并启动 Next.js；备份失败则中止迁移。应用进程本身不会以 root 运行。已有数据库继续使用原账号；全新数据库必须按下一节显式安装首个管理员，任何密码或微信注册都不会按注册顺序自动提权。

### 3.1 首位管理员显式安装

1. 使用 `openssl rand -hex 32` 生成一次性随机值，临时保存到 Coolify 环境变量 `MES_INITIAL_ADMIN_TOKEN` 后重新部署。
2. 确认站点已经使用 HTTPS，并从受信任终端执行一次以下请求；管理员密码至少 12 位：

```bash
MES_ORIGIN='https://mes.example.com'
MES_INITIAL_ADMIN_TOKEN='<Coolify 中的临时令牌>'
curl --fail-with-body -X POST "$MES_ORIGIN/api/auth/setup" \
  -H "Origin: $MES_ORIGIN" \
  -H 'Content-Type: application/json' \
  -H "X-MES-Initial-Admin-Token: $MES_INITIAL_ADMIN_TOKEN" \
  --data '{"username":"admin","password":"replace-with-a-strong-password","name":"系统管理员"}'
```

3. 收到“初始管理员安装成功”后，立即从 Coolify 删除 `MES_INITIAL_ADMIN_TOKEN` 并重新部署。接口在令牌缺失时返回 404；数据库已有任意管理员时返回 409，不提供远程密码重置能力。
4. 若遗失管理员密码，不要重新开放安装接口；应进入受控维护窗口备份数据库，再使用单独的账号恢复流程处理。

登录、公开注册和管理员安装都按来源写入 `AuthenticationThrottle` 限流；同一账号 15 分钟内连续 5 次密码错误会锁定 15 分钟。生产会话 Cookie 和微信登录 state Cookie 强制 `Secure`，因此正式环境必须使用 HTTPS。

限流来源优先使用反向代理覆盖写入的 `X-Real-IP`，其次读取 `X-Forwarded-For` 最右侧地址；部署入口不得绕过 Coolify 代理直接暴露容器端口，也不得允许客户端覆盖这些代理头。超过 30 天未活动的限流窗口会在后续认证请求中自动清理。

默认目录可通过以下环境变量调整，但禁止把 `/`、`/app` 或 `/app/public` 这类过宽目录设为修复目标：

```env
MES_LITE_DATA_DIR=/app/data
MES_LITE_UPLOAD_DIR=/app/public/uploads
MES_LITE_BACKUP_DIR=/app/backups
MES_LITE_STORAGE_USER=node
MES_LITE_STORAGE_GROUP=node
```

需要在运行中的容器内手动复查或修复时，可以执行：

```bash
docker exec -u root <容器名> npm run storage:fix
```

脚本会递归修复 SQLite 数据库、WAL/SHM 文件、附件子目录和备份目录，并验证降权后的 `node` 用户确实可写；无法修复时容器会停止并输出明确错误。

`20260730163000_link_work_instructions_to_material` 是一次明确的破坏性迁移：首次执行前会删除旧指导书专属附件目录，迁移会删除旧指导书及对应附件元数据，然后启用产品必选的“产品文档”模型。迁移完成后，启动脚本通过迁移记录识别已执行状态，不会再次清理新产品文档。

镜像构建仅在确有必要时执行 `apt-get`：PDF 缩略图需要 `poppler-utils`，Office 预览需要 LibreOffice，可验证备份归档显式依赖 `tar`。安装阶段使用可配置的 Debian 镜像、BuildKit APT 缓存、有限重试和超时。Prisma 所需的 OpenSSL 3 运行库仍从 Docker 官方 `buildpack-deps:bookworm-curl` 镜像复制，送货单使用的 Noto Sans CJK SC 字体及其 SIL OFL 许可证随仓库发布。普通代码修改不会让系统依赖安装层重新执行。

Docker 的 `dependencies` 阶段使用 `docker/dependencies/` 下去除项目发布版本号的依赖清单。正常递增 `package.json` 与 `package-lock.json` 的版本号不会再触发 `npm ci`；只有依赖或锁定结果变化时才会重建该层。新增、升级或删除 npm 依赖后必须运行并提交：

```bash
npm run docker:sync-deps
npm run verify:docker-deps
```

Docker 正式构建也会执行一致性校验，依赖清单过期时会中止构建并给出同步命令。页面显示的 `MES-lite v...` 仍来自根目录 `package.json`，不受缓存清单影响。

Prisma Client 生成使用独立缓存层，仅在 npm 依赖或 `prisma/` 发生变化时重建。运行镜像使用 Next.js standalone 输出，只带入服务器实际追踪到的依赖，并显式补充容器启动迁移所需的 Prisma CLI 和 PDF 缩略图所需的原生 Canvas 包；不再向最终镜像复制整套生产 `node_modules`。Next.js 构建通过 BuildKit cache mount 复用 `.next/cache`，Coolify 必须保持 BuildKit 构建缓存，才能在连续部署中获得增量编译效果。

镜像内置了 Docker `HEALTHCHECK`，使用 Node.js 内置 `fetch` 请求 `/api/health/ready`。该接口不只检查 Web 进程，还会验证 SQLite 查询、未完成 Prisma 迁移、数据目录和附件目录的读写性。备份过期作为返回体中的 `warn`，不导致容器重启循环。首次启动会先执行 SQLite 迁移，健康检查在 15 秒后开始，并允许最多 6 次、每 10 秒一次的重试。如果健康检查失败，优先检查：

- `/app/data` 是否可写。
- `DATABASE_URL` 是否为 `file:/app/data/mes_lite.db`。
- Coolify 的 Persistent Storage 是否正确挂载。
- 启动日志是否出现“持久存储权限已就绪”；若未出现，检查挂载是否允许容器 root 用户执行 `chown`。
- `/api/health/live` 是否正常；若 live 正常而 ready 失败，按 ready 响应中的具体检查项排查数据与迁移。

### 3.2 国内部署镜像加速

只有 Coolify 的详细构建日志长时间停在拉取基础镜像、`load metadata`、`npm ci` 或下载 npm 包时，镜像站才是主要优化方向。若耗时集中在 `npm run build`，切换镜像站不会缩短编译时间。

国内服务器可在 Coolify 的 Docker Build Arguments 中设置：

```env
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
DEBIAN_MIRROR=http://mirrors.aliyun.com
```

`NPM_CONFIG_REGISTRY` 未设置时使用 npm 官方源。`DEBIAN_MIRROR` 在 Dockerfile 中默认为阿里云镜像，部署区域不同时可替换为当地稳定镜像。Docker Hub 基础镜像加速应在部署服务器的 Docker daemon 中统一配置，不应把某个第三方 Docker Hub 镜像域名硬编码进项目 `Dockerfile`；修改 daemon 后先验证 `docker pull node:20-bookworm-slim` 和 `docker pull buildpack-deps:bookworm-curl`，再重新部署。

系统包下载、npm 依赖和 Next.js 编译均应使用 BuildKit cache mount。缓存目录不得在同一构建步骤末尾删除，否则失败重试和后续版本无法复用已下载内容。慢网络操作必须设置有限重试与超时；依赖安装层应位于业务源码 `COPY` 之前，避免每次应用修改都重新下载。

### 3.3 构建成功但导出镜像失败

如果日志已出现 `Compiled successfully`、静态页生成完成和完整路由表，却在 `exporting layers` 立即失败，说明应用代码已构建成功，应优先检查部署主机的 Docker 存储，而不是把 lint warning 当作失败原因。

在 Coolify 部署服务器执行：

```bash
df -h
docker system df -v
docker ps -a --filter status=exited
```

确认旧容器和旧镜像不再需要回滚后，可先清理已停止容器、超过 24 小时的 BuildKit 缓存和超过 7 天的未使用镜像：

```bash
docker container prune -f
docker builder prune -af --filter 'until=24h'
docker image prune -af --filter 'until=168h'
```

不要执行 `docker volume prune`，也不要删除 `/opt/mes-lite/data` 和 `/opt/mes-lite/uploads`。清理后应再检查 `docker system df -v` 并重新部署；如果容量充足但仍在导出层时出现 Docker `exit code 255`，再重启 Docker 服务或 Coolify builder 后重试。

## 4. 部署与备份

代码推送到 Git 仓库后，在 Coolify 连接该仓库并部署。容器会在数据库迁移前自动生成经验证的 SQLite+附件备份。另外必须在 Coolify Scheduled Tasks 中建立每日任务：

```bash
node /app/scripts/runtime-backup.mjs create
```

备份会写入 `/app/backups`，默认最多保留 30 份且最长 14 天。不再使用直接 `tar` 正在写入的 SQLite 目录作为唯一备份，因为该方式无法证明数据库快照与附件引用可恢复。

完整的手动验证、异地副本、非覆盖恢复候选、生产切换/回滚和 RPO/RTO 演练步骤见 [备份、恢复与灾备演练](../operations/备份恢复与灾备演练.md)。

SQLite 数据目录只能由一个运行中的应用实例写入。需要多实例或滚动部署时，应先迁移到 PostgreSQL，并将附件迁移到对象存储或共享文件存储。
