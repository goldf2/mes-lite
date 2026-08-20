# Coolify 部署说明

MES-lite 当前使用 SQLite，适合单实例 Docker 部署。数据库和上传附件必须挂载到主机持久目录，容器可以重建，主机数据目录不能随容器删除。

## 1. 开发机验证与 GitHub Actions 远端构建

普通变更在开发机只运行受影响的回归、静态检查或开发服务器验证，不再重复运行完整 `npm run build`。标准发布顺序为：

1. 完成本机针对性验证并提交代码。
2. 将精确提交推送到 `ci/<版本号>` 候选分支，不先推送 `main`。
3. 等待该 SHA 对应的 `MES-lite CI` 成功。工作流执行 Prisma 校验与生成、生产构建、依赖该构建产物的恢复演练、领域与治理基线、TypeScript 和 Lint。
4. 核对 run ID、提交 SHA 和结论后，把同一提交推送或合并到 `main`，再由 Coolify 的 main Webhook 部署。

需要手动重跑时，可在 GitHub 的 Actions 页面选择 `MES-lite CI`，点击 `Run workflow` 并选择候选分支。远端构建失败时不得继续推送 `main` 或人工 Redeploy。

这项调整替代的是开发机上的 Next.js 生产构建，不是 Coolify 的 Docker 镜像构建。当前 Actions 不发布可部署镜像；Coolify 收到 `main` 后仍会从仓库执行 Dockerfile。若后续目标是降低 Coolify 主机 CPU，而不只是取消本机编译，应单独建立“Actions 构建并推送 GHCR 镜像、Coolify 仅拉取镜像”的发布链路，并先验证镜像权限、版本标签、三个持久挂载和回滚策略。

仅在本机排查生产构建或启动差异时使用：

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
SOP_PUBLIC_BASE_URL=
MES_PUBLIC_BASE_URL=https://mes.example.com
COLLABORA_PUBLIC_URL=https://office.example.com
COLLABORA_DISCOVERY_URL=https://office.example.com/hosting/discovery
WOPI_VIEW_TOKEN_TTL_SECONDS=7200
CAD_PREVIEW_SERVICE_URL=http://cad-preview:8080
CAD_PREVIEW_SERVICE_TOKEN=<至少 32 字符的随机服务令牌>
CAD_PREVIEW_TIMEOUT_MS=120000
```

`MES_TRUSTED_ORIGINS` 必须填写浏览器实际访问的 HTTPS Origin（协议、域名和可选端口，不带路径）。所有 `POST / PUT / PATCH / DELETE` API 都会先执行同源校验；多个可信 Origin 使用英文逗号分隔。公开注册默认关闭，只有在受控注册时间窗口才临时把 `MES_PUBLIC_REGISTRATION_ENABLED` 改为 `true`，新账号仍统一进入待审核状态。

### 3.0 自托管 Collabora 电子表格直览

XLS、XLSX 和 ODS 默认由独立的 Collabora Online 服务直接打开，不先转换为 PDF。`MES_PUBLIC_BASE_URL` 是 Collabora 回调 MES-lite WOPI 接口时可访问的 HTTPS 根地址；`COLLABORA_PUBLIC_URL` 是浏览器访问 Collabora 的 HTTPS Origin；`COLLABORA_DISCOVERY_URL` 必须是同一 Origin 下的 discovery 地址。生产环境拒绝 HTTP，令牌有效期默认 2 小时，可在 300–28800 秒内调整。

Collabora 应部署为独立 Coolify Service 或独立主机，不与 MES-lite SQLite 容器共享进程和扩缩容生命周期。反向代理必须支持 WebSocket 和长连接，并只允许其访问 MES-lite 的 `/api/wopi/*`。Collabora 侧只信任 `mes.example.com` 这个 WOPI Host；关闭宏执行、外部数据自动刷新和不需要的编辑能力。Community Development Edition 适合隔离试点，正式生产容量和支持等级应根据 Collabora 授权与并发需求另行确认。

上线前必须完成以下验收：

1. 从 MES-lite 容器访问 `$COLLABORA_DISCOVERY_URL`，确认响应包含 `xlsx`、`xls` 和 `ods` action 及 proof key。
2. 使用测试附件验证 `CheckFileInfo` 与 `GetFile` 均成功，篡改令牌、proof、附件 ID 或撤销会话后均返回拒绝。
3. 用真实 24 工作表 XLSX 验证原生工作表标签、横向/纵向滚动、缩放和第 22 张宽表完整显示；再验证“兼容 PDF”和“下载原文件”降级入口。
4. 检查反向代理访问日志不会记录 POST 表单中的 `access_token`，并避免保存含令牌的完整查询串。

未配置或 discovery 不可用时，readiness 只返回 `warn`，避免外部预览服务故障导致 MES-lite 重启循环；用户可改用兼容 PDF 或下载原文件。不得把生产附件上传到 Collabora 公网演示站验证。

### 3.1 自托管 DWG/DXF 只读预览

DWG/DXF 原文件继续保存在附件持久卷中，MES-lite 不在 Web 主进程加载 CAD SDK。首次打开图纸时，应用把受权附件发送给同一私有网络内的隔离转换服务，生成只读 PDF 派生文件并持久缓存；后续查看和缩略图复用现有 PDF 查看器。仓库提供 `services/cad-preview/` 开源试用服务：LibreDWG 把 DWG 转为 DXF，再由 ezdxf/PyMuPDF 生成 PDF；DXF 直接进入相同渲染链路。

转换服务必须实现以下内部契约：

- `GET /health`：返回 2xx 表示可用。
- `POST /v1/convert/pdf`：`multipart/form-data`，文件字段为 `file`，另有 `output=pdf`；成功时返回以 `%PDF-` 开头且不超过 100 MB 的 PDF。
- 设置 `CAD_PREVIEW_SERVICE_TOKEN` 时，两条请求都必须校验 `Authorization: Bearer <token>`。
- `CAD_PREVIEW_TIMEOUT_MS` 允许 5 秒至 10 分钟，默认 120 秒；readiness 健康探测固定最多等待 5 秒。

转换容器使用只读输入、临时工作目录、CPU/内存/超时限制，不挂载数据库，不暴露公网入口，也不保留输入副本。`CAD_PREVIEW_SERVICE_URL` 未配置或服务离线时 readiness 只返回 `warn`，原文件上传、权限校验和下载仍正常；用户会看到明确的预览失败与下载降级提示。上线前用真实单页、多布局、中文字体和大尺寸 DWG/DXF 分别验证线宽、字体、图层、纸张、方向和缩略图，不得用 ODA 公网示例转换生产附件。

在 Coolify 中把转换器建成与 MES-lite 同一项目、同一环境下的第二个 Dockerfile Application：

1. Repository 与 MES-lite 相同，Build Pack 选择 Dockerfile，Build Context 使用仓库根目录，Dockerfile Location 填写 `services/cad-preview/Dockerfile`。
2. 不绑定域名、不暴露公网端口；容器仅在 Coolify 私有网络监听 `8080`。为转换器设置 `CAD_PREVIEW_SERVICE_TOKEN`，再在 MES-lite 设置同值令牌和 `CAD_PREVIEW_SERVICE_URL=http://<转换器内部别名>:8080`。
3. 建议从 1 CPU、1 GiB 内存、256 MiB 临时空间和单实例开始，启用只读根文件系统、`/tmp` tmpfs、`no-new-privileges` 与 capability drop（以当前 Coolify 可用选项为准）。转换器不挂载数据库、附件目录或备份目录。
4. Health Check 使用 `/health`；若令牌已启用而 Coolify 的 HTTP 健康检查不能添加请求头，则保留 Dockerfile 内置健康检查，不另建无鉴权公网探针。
5. 先部署并确认转换器健康，再给 MES-lite 写入上述两个环境变量并重新部署；回滚时先移除 `CAD_PREVIEW_SERVICE_URL`，MES-lite 会退回下载原文件且 readiness 仅警告。

容器发布前必须使用企业真实样本建立验收集，至少覆盖：R2000、R2007+、单模型空间、多布局、中文字体、外部参照、块、尺寸标注、大图和已知复杂实体。LibreDWG 与 ezdxf 不保证所有版本和垂直产品实体的像素级兼容；任一样本转换失败或关键内容缺失，都应保留原文件下载/配套 PDF，并评估在同一内部契约后替换 ODA 等引擎。

许可证边界必须随部署留档：LibreDWG 为 GPL-3.0-or-later，ezdxf 为 MIT，PyMuPDF 为 AGPL-3.0-or-later/商业双许可。转换器源码和镜像单独管理；如果向客户分发该镜像，应在交付前完成对应源代码提供、许可证文本和修改说明等合规复核。

最终交付的 PDF/DOCX 和自托管视频若发布到对象存储，只填写一个只读 HTTPS 基地址，例如 `SOP_PUBLIC_BASE_URL=https://downloads.example.com/mes-lite/sop`。地址不包含 Bucket 写入密钥、查询签名或具体文件名；应用按目录清单生成精确下载或播放路径。未配置时帮助中心不显示离线下载按钮和文件视频，在线 SOP 仍可使用；哔哩哔哩/YouTube 条目不依赖该地址。生成目录、对象路径和校验步骤见 [SOP 生成与发布策略](../operations/SOP生成与发布策略.md)及[视频帮助分类与发布](../operations/视频帮助分类与发布.md)。

`v0.1.384` 起运行镜像内置 `node scripts/sop-library-publication.mjs`。它可以只读下载 `SOP_PUBLIC_BASE_URL/v<当前版本>/manifest.json` 及对应 PDF/DOCX，校验版本、大小和 SHA-256 后登记到持久化产品文档库。该命令不会随 Webhook 自动部署或容器启动自动执行；先在 Coolify Terminal 运行 `--operator <文控账号> --from-oss` 预检，完成一致备份后再增加 `--apply --backup-reference <备份编号或清单路径>`。生产数据库和 `/app/public/uploads` 的变更必须由具有文档类别、产品文档和附件权限的启用账号发起，详细门禁和回滚步骤见上述 SOP 发布策略。

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

### 3.1 持久存储的唯一配置来源

MES-lite 的 `Dockerfile` 只通过 `mkdir -p` 创建 `/app/data`、`/app/public/uploads` 和 `/app/backups` 并设置运行时环境变量；它没有声明 `VOLUME`。创建容器内目录不等于持久化，生产也禁止依赖 Docker 为镜像 `VOLUME` 隐式创建的匿名卷。匿名卷使用随机 ID，无法从业务名称直接判断用途，且 Coolify 滚动替换、回滚、迁移或清理容器时不能把它视为已登记、可复用的交付资产。

Dockerfile 部署必须在 Coolify 的 Persistent Storage 中显式登记三个 Directory 或 Volume，并以运行容器的 `docker inspect <容器> --format '{{json .Mounts}}'` 结果作为最终挂载证据。当前生产应用 `yjad2gnk1ycpeletd0aqlq4g` 实际使用 Coolify 管理的三个 Directory：

```text
/data/coolify/applications/yjad2gnk1ycpeletd0aqlq4g/data     -> /app/data
/data/coolify/applications/yjad2gnk1ycpeletd0aqlq4g/uploads  -> /app/public/uploads
/data/coolify/applications/yjad2gnk1ycpeletd0aqlq4g/backups  -> /app/backups
```

Coolify 页面、运行容器和宿主机目录三者必须一致。只看到两个目录、看到 `/opt/mes-lite/*`，或只在文件管理器中看到同名文件夹，都不能证明当前生产容器已经挂载；先确认所处应用是生产而不是演示，再核对三个 Destination Path。不得在运行中的 SQLite 实例上直接修改 Source Path 或搬迁目录。

从零创建新环境且希望宿主机路径便于人工识别时，可以先创建：

```bash
sudo mkdir -p /opt/mes-lite/data /opt/mes-lite/uploads /opt/mes-lite/backups
```

在 Coolify 的 Persistent Storage 中添加三个 Bind Mount：

```text
主机目录                    容器目录
/opt/mes-lite/data       -> /app/data
/opt/mes-lite/uploads    -> /app/public/uploads
/opt/mes-lite/backups    -> /app/backups
```

产品文档图片/PDF 的持久缩略图与原文件存放在同一个 uploads 挂载中，不需要新增存储卷；迁移或备份时必须整体保留该目录。

容器启动入口会先以 root 身份幂等修复 `/app/data`、`/app/public/uploads` 与 `/app/backups` 的所有者和读写权限，再立即通过 Debian 基础镜像内置的 `setpriv` 降权为 `node` 用户。已有 SQLite 非空且显式开启迁移前备份时，会先创建并验证数据库+附件备份，再清理兼容文件、执行 `prisma migrate deploy` 并启动 Next.js；备份失败则中止迁移。应用进程本身不会以 root 运行。已有数据库继续使用原账号；全新数据库必须按下一节显式安装首个管理员，任何密码或微信注册都不会按注册顺序自动提权。

### 3.2 首位管理员显式安装

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

### 3.3 国内部署镜像加速

只有 Coolify 的详细构建日志长时间停在拉取基础镜像、`load metadata`、`npm ci` 或下载 npm 包时，镜像站才是主要优化方向。若耗时集中在 `npm run build`，切换镜像站不会缩短编译时间。

国内服务器可在 Coolify 的 Docker Build Arguments 中设置：

```env
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
DEBIAN_MIRROR=http://mirrors.aliyun.com
```

`NPM_CONFIG_REGISTRY` 未设置时使用 npm 官方源。`DEBIAN_MIRROR` 在 Dockerfile 中默认为阿里云镜像，部署区域不同时可替换为当地稳定镜像。Docker Hub 基础镜像加速应在部署服务器的 Docker daemon 中统一配置，不应把某个第三方 Docker Hub 镜像域名硬编码进项目 `Dockerfile`；修改 daemon 后先验证 `docker pull node:20-bookworm-slim` 和 `docker pull buildpack-deps:bookworm-curl`，再重新部署。

系统包下载、npm 依赖和 Next.js 编译均应使用 BuildKit cache mount。缓存目录不得在同一构建步骤末尾删除，否则失败重试和后续版本无法复用已下载内容。慢网络操作必须设置有限重试与超时；依赖安装层应位于业务源码 `COPY` 之前，避免每次应用修改都重新下载。

### 3.4 构建成功但导出镜像失败

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

每季度和重大迁移前应使用 `npm run storage:drill -- ...` 将归档验证、非覆盖候选恢复和 RPO/RTO 写入独立 Markdown 报告。`CANDIDATE_PASS` 只表示候选目录技术校验通过；必须继续在隔离的新实例完成 `/api/health/ready`、管理员登录、业务单据和附件抽查，才可签署生产恢复验收。

SQLite 数据目录只能由一个运行中的应用实例写入。需要多实例或滚动部署时，应先迁移到 PostgreSQL，并将附件迁移到对象存储或共享文件存储。

### 4.1 当前生产发布基线（2026-08-15）

- 生产应用 ID 为 `yjad2gnk1ycpeletd0aqlq4g`；当前连接 `main` Webhook，Auto Deploy 已开启，推送会创建来源为 Webhook 的部署。
- 自动触发不等于自动验收。每次推送仍必须先通过 CI；部署后同时核对 Coolify Running 提交、应用版本、首页静态版本和 `/api/health/ready`。长时间仍提供旧静态文件时，保留旧健康容器，不重复点击 Redeploy，先检查当前部署日志。
- `/app/backups` 已持久挂载，`MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=true` 已配置；非空数据库在每次迁移前先生成并校验一致备份。
- `MES-lite 每日一致备份` 使用 `0 18 * * *`。该表达式仅因当前容器实测为 UTC，换算为北京时间 02:00；迁移服务器后必须重新验证时区。
- Coolify 邮件通知已启用部署失败、备份失败、定时任务失败、容器状态和磁盘告警。
- S3 Storages 尚未配置，当前归档只在应用主机持久目录，不能表述为异地容灾完成。

2026-08-13 应用上述配置时，第一次重建完成编译和镜像层组装后在 `exporting layers` 被 BuildKit `context canceled` 中断；旧健康容器未被移除。复核主机仍有 29 GB 可用空间、3.5 GiB 可用内存，随后把迁移前备份变量改为仅 Runtime 注入并重试。第二次构建复用既有镜像，启动日志先生成一致备份 `mes-lite-backup-2026-08-13T11-33-44-021Z-5330c3ab.tar.gz`（SHA-256 `cbcfe027ee518032247806768c2c35c811434e377a8020cabb5f6ab3be37999b`），再确认 76 个迁移无待处理，新容器健康后才移除旧容器并完成滚动更新。

普通迭代当前采用“Git 推送 + Webhook 自动部署 + 运行验收”；涉及生产数据迁移、模型回填或高风险权限变更时，仍须在维护窗口临时关闭 Auto Deploy、固定批准提交并准备可回滚挂载。不得仅凭 `main` 最新提交或部署列表中的日志文案判断线上版本；必须同时核对 Coolify Running 链接、应用版本、首页静态文件和 `/api/health/ready`。

2026-08-15 的生产与演示双 Webhook 构建造成 4 vCPU 主机失去响应。事故证据、已完成止血、未完成门禁和恢复验收见 [Coolify 双构建导致主机失去响应](../operations/incidents/2026-08-15-coolify双构建主机失联.md)。在关闭演示应用 Auto Deploy 或迁移到独立构建节点之前，不得推送新的 `main` 提交触发生产部署。
