# MES-lite 协作规则

本文件是 MES-lite 仓库内的项目级规则，优先级高于通用习惯，适用于本仓库后续所有代码、文档和模型修改。

## 代码与模型必须同步

任何代码修改只要影响以下内容，必须在同一个变更中同步更新对应文档，不能只改代码：

- 业务流程：来料、工单、派工、领料、报工、质检、入库、发货、退货、库存调整、归档、恢复等流程。
- 数据模型：Prisma schema、字段含义、状态枚举、关联关系、库存/成本/权限/附件/审计结构。
- 页面结构：导航、页面入口、工具栏、筛选、卡片/列表、详情弹窗、全屏展示、移动端布局。
- 接口契约：API 入参、出参、状态流转、权限要求、错误语义。
- 权限与审计：角色、权限组、人员赋权、审计日志覆盖范围。

必须优先检查并同步以下文档：

- `docs/minierp/系统交互与设计规范.md`
- `docs/minierp/当前系统建模与结构审查.md`
- `docs/minierp/system-function-flow.md`
- `docs/minierp/data-model.md`
- `docs/minierp/domain-model.md`
- `docs/minierp/feature-model.md`
- `docs/minierp/界面开发规则.md`
- `docs/minierp/桌面端界面开发规范.md`
- `docs/minierp/移动端界面开发规范.md`
- `docs/minierp/响应式断点与验收矩阵.md`
- `docs/minierp/配置化页面框架规划.md`

如果某次代码修改不影响流程、模型或界面规范，需要在最终说明中明确“本次无需更新建模/流程文档”的理由。

## 推送与版本号

任何代码、文档、数据模型或配置变更只要需要推送到远程，必须同步递增项目版本号。

- 同步更新 `package.json` 与 `package-lock.json` 中的版本号，并保持一致。
- 每个版本必须新增 `docs/releases/v<版本号>.md`，记录更新内容、影响范围和验证结果；不能只修改历史版本文档。
- 同步更新 `docs/releases/README.md` 版本索引，并保持最新版本在最上方。
- 推送前运行 `npm run verify:release-notes`，确认版本号和版本文档一致。
- 提交信息或最终汇报中必须说明新版本号。
- 如果只是本地排查且不推送，不需要递增版本号。

## 提交说明要求

提交或汇报时必须说明：

- 改了哪些代码。
- 影响了哪些业务流程或数据结构。
- 同步更新了哪些文档或图。
- 做了哪些验证。

这样后续查看 git 历史时，可以同时看到代码变更、业务意图、流程影响和模型影响。

## Docker 与 Coolify 构建要求

MES-lite 的生产环境使用 Coolify 和 Docker BuildKit。修改 `Dockerfile`、系统依赖或构建脚本时，必须遵守以下规则：

- 部署服务器位于国内或访问官方源缓慢时，Debian 系统包默认使用部署区域内可稳定访问的镜像源；当前默认为 `http://mirrors.aliyun.com`，并必须保留 `DEBIAN_MIRROR` 构建参数便于替换。
- npm 镜像必须通过 `NPM_CONFIG_REGISTRY` 构建参数配置，不得在锁文件中批量改写依赖地址。Docker Hub 镜像加速应在部署服务器的 Docker daemon 中配置。
- 所有网络下载步骤必须设置有限重试和超时，不允许单个镜像源不可用时无限阻塞整个部署。
- APT 索引、APT 安装包、npm 缓存和 Next.js 构建缓存必须优先使用 BuildKit cache mount，并保留跨部署复用能力。
- 系统依赖安装、npm 依赖安装和 Prisma Client 生成必须位于业务源码 `COPY` 之前的稳定分层中，普通代码或版本号修改不得让这些慢步骤重新执行。
- 新增系统包前必须先评估能否使用已有运行库或随项目发布的静态资源；确实需要 APT 时，必须同时实现镜像源、缓存、重试和超时。
- 部署变慢或失败时，必须先根据 Coolify 详细日志区分基础镜像拉取、系统包下载、`npm ci`、`npm run build` 和健康检查，再针对真正耗时层修改，不得盲目更换全部镜像源。
- 变更 Docker 构建逻辑后必须运行可用的本地生产构建；本机有 Docker CLI 时还必须构建运行镜像。本机无 Docker CLI 时，必须在发布说明中明确记录，并以 Coolify 详细构建日志完成最终验证。

完整部署配置和故障排查步骤见 `docs/deployment/coolify.md`。
