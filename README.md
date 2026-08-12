# MES-lite 轻量制造管理系统

MES-lite 是面向小微制造企业的轻量化复合系统：以 MES 为主体，提供有限的 MRP-lite 和 ERP-lite 能力。当前技术核心为 Next.js + TypeScript + Prisma + SQLite，默认使用 Docker/Coolify 单实例部署。

> 本 README 只是快速入口。要理解业务边界、39 个页面模块、数据模型、权限、公共页面骨架、开发流程和已知缺口，请从 [文档中心](./docs/README.md) 或 [系统开发与理解手册](./docs/开发文档.md) 开始。

## 当前能力边界

| 范围 | 当前支持 | 暂不支持 |
| --- | --- | --- |
| MES | 物料、BOM、生产订单与实绩、产出内部批次、整批质检放行/冻结、待检/可用/冻结库存、库存库位、设备、文档、派工和流程转移 | APS 高级排程、来料到客户的完整批次谱系、部分放行及完整不合格处置 |
| MRP-lite | BOM 用量与计划基础 | 净需求、短缺展开和自动建议 |
| ERP-lite | 客户、供应商、销售订单、销售价快照、发货和退货 | 财务、税务、应收应付和完整采购 |

## 快速启动

### 1. 准备环境

- Node.js 20+
- npm
- 本地开发不需要单独安装数据库服务

### 2. 安装和初始化

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
```

### 3. 启动

```bash
npm run dev
```

打开 `http://localhost:3000`。另有 `npm run dev:3001` 和 `npm run dev:3002` 可用于固定端口。

### 4. 创建开发管理员

```bash
DEV_ADMIN_USERNAME=admin \
DEV_ADMIN_PASSWORD='replace-this-password' \
DEV_ADMIN_NAME='开发管理员' \
npm run dev:admin
```

`dev:admin` 在 `NODE_ENV=production` 时会拒绝执行，不是生产后门。

生产环境不会让首位注册者自动成为管理员。首次部署时先在 Coolify 临时配置至少 32 字符的 `MES_INITIAL_ADMIN_TOKEN`，再按 [Coolify 部署说明](./docs/deployment/coolify.md) 调用一次 `/api/auth/setup`；成功后立即删除令牌并重新部署。公开注册默认关闭，开启后新账号仍需管理员审核。

## 常用命令

```bash
npm run dev                  # 开发服务器
npm run build                # 生产构建
npm run lint                 # ESLint
npx tsc --noEmit             # TypeScript 检查
npm run db:migrate           # 开发迁移
npm run db:deploy            # 应用已发布迁移
npm run db:studio            # Prisma Studio
npm run verify:page-modules  # 页面注册与模块契约
npm run verify:permissions   # 权限契约
npm run verify:data-integrity # 关键数据一致性
```

更多领域验证见 `package.json` 中的 `verify:*` 脚本。

## 架构入口

- [文档中心](./docs/README.md)
- [系统开发与理解手册](./docs/开发文档.md)
- [功能、页面、权限与接口矩阵](./docs/architecture/功能页面权限接口矩阵.md)
- [系统结构图](./docs/architecture/系统结构图.md)
- [系统时序图](./docs/architecture/系统时序图.md)
- [数据库结构](./docs/architecture/数据库结构.md)
- [MES-MRP-ERP 功能矩阵](./docs/architecture/MES-MRP-ERP功能矩阵.md)
- [人员权限组与页面矩阵](./docs/architecture/人员权限组与页面矩阵.md)
- [公共前端模块使用指南](./docs/minierp/公共前端模块使用指南.md)
- [版本更新记录](./docs/releases/README.md)

## AI 和附件

- 系统内置应用级只读 AI 协作助手，工具受白名单和后端权限约束。
- 单据可在新建时上传附件，AI 识别只生成字段建议/草稿回填，不自动确认业务事务。
- PDF、图片和常用 Office 文件可使用自托管预览链路；其他文件仍可下载原件。

## 部署

当前推荐单实例 Docker + SQLite 持久卷部署到 Coolify：

- `/app/data`：SQLite 数据库
- `/app/public/uploads`：原始附件和派生预览
- `/app/backups`：经一致性和 SHA-256 校验的数据库+附件备份
- `/api/health/live`：进程存活检查
- `/api/health/ready`：数据库、迁移和持久存储就绪检查
- 写 API：校验同源 `Origin`；额外允许来源由 `MES_TRUSTED_ORIGINS` 配置

详见 [Coolify 部署说明](./docs/deployment/coolify.md) 和 [备份、恢复与灾备演练](./docs/operations/备份恢复与灾备演练.md)。PostgreSQL、对象存储和多租户是规划中的演进方向，不是当前运行事实。
