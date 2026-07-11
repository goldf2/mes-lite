# MES-lite 工厂生产全流程记录系统

可直接运行的 Next.js + Prisma + SQLite 轻量生产管理系统。

> 当前仓库是实际工程目录。MiniERP 作为后续产品方向和管理端模型，建模文档已放在 `docs/minierp/`。

## MiniERP 建模文档

- [项目上下文](./docs/minierp/CONTEXT.md)
- [领域模型](./docs/minierp/domain-model.md)
- [功能模型](./docs/minierp/feature-model.md)
- [数据模型](./docs/minierp/data-model.md)
- [微信小程序接入模型](./docs/minierp/wechat-mini-program-model.md)
- [功能验收清单](./docs/minierp/功能验收清单.md)
- [ADR 0001：小程序第一版作为移动管理入口](./docs/adr/0001-mini-program-as-management-entry.md)

---

## 快速启动

### 1. 环境准备

```bash
# 需要 Node.js 20+
node -v

# 当前版本使用本地 SQLite，无需单独安装数据库服务
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL
```

### 4. 初始化数据库

```bash
# 生成 Prisma Client
npx prisma generate

# 应用已有数据库迁移
npx prisma migrate deploy

# 插入种子数据（产品、原材料、BOM、工艺路线）
npx prisma db seed
```

### 5. 启动开发服务器

```bash
npm run dev
# 打开 http://localhost:3000
```

### 6. 开发管理员

开发阶段固定管理员账号：

- 账号：`admin`
- 密码：`admin123`

该账号由开发初始化脚本写入数据库，密码以哈希保存。脚本在 `NODE_ENV=production` 时拒绝执行，不属于生产登录后门。

如需重置开发管理员：

```bash
npm run dev:admin
```

也可以临时指定：

```bash
DEV_ADMIN_USERNAME=admin DEV_ADMIN_PASSWORD=admin123 DEV_ADMIN_NAME=开发管理员 npm run dev:admin
```

### 权限分级

| 角色 | 系统值 | 主要权限 |
|------|--------|----------|
| 录入 | `OPERATOR` | 创建业务单据、报工、上传原始单据 |
| 审核 | `AUDITOR` | 包含录入权限，可确认/拒绝/取消单据、确认收货、确认发货、成品入库 |
| 管理 | `ADMIN` | 包含审核权限，可管理人员、基础资料、删除附件和基础资料 |

管理员登录后可进入“权限管理”，按角色为每个功能页配置“查、增、改、删”权限。管理员角色默认全开，避免误关权限管理入口。

---

## API 接口清单

### 生产工单

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/orders` | 创建工单（自动按 BOM 生成领料需求） |
| `GET` | `/api/orders?status=xxx` | 工单列表 |
| `GET` | `/api/orders/:id` | 工单详情（含当前应报工工序） |
| `PATCH` | `/api/orders/:id/cancel` | 取消工单（事务回退物料 + 作废报工） |
| `POST` | `/api/orders/:id/pick` | 领料（校验库存、扣库存、更新状态） |
| `POST` | `/api/orders/:id/reports` | 工序报工（防呆：上一工序未完成不可报） |
| `POST` | `/api/orders/:id/stock-in` | 成品入库（仅 QC_DONE 状态可入） |

### 库存

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/stocks?type=material\|product` | 库存查询 |
| `POST` | `/api/stocks` | 盘点调整（必须备注原因） |

### AI 分析

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/analyze` | AI 分析占位接口，当前未启用 |

---

## 核心设计原则

1. **状态机强制锁定**：工单状态必须按顺序流转，非法跳转直接 400
2. **取消必须回退**：取消工单时，Prisma 事务自动回退物料、作废报工、记录日志
3. **库存强关联**：所有库存变动必须有 `refType` + `refId` 指向源单据
4. **工序防呆**：报工必须上一工序已完成，否则拒绝

---

## 测试流程

```bash
# 1. 创建工单
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"productId":"<产品ID>","planQty":100}'

# 2. 确认工单（需要自行实现 PATCH /confirm，或在数据库改 status=CONFIRMED）

# 3. 领料
curl -X POST http://localhost:3000/api/orders/<工单ID>/pick \
  -H "Content-Type: application/json" \
  -d '{"items":[{"pickItemId":"<领料项ID>","actualQty":35,"pickedBy":"张三"}]}'

# 4. 报工（按返回的 currentStepId）
curl -X POST http://localhost:3000/api/orders/<工单ID>/reports \
  -H "Content-Type: application/json" \
  -d '{"stepId":"<工序ID>","workerName":"张三","goodQty":98,"badQty":2}'

# 5. 取消工单（测试回退）
curl -X PATCH http://localhost:3000/api/orders/<工单ID>/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason":"客户取消订单"}'
```

---

## 部署

当前推荐使用单实例 Docker + SQLite 持久卷部署到 Coolify。数据库目录和上传附件目录必须挂载到主机，详细步骤见 [Coolify 部署说明](./docs/deployment/coolify.md)。

---

## 下一步（Week 2）

- 小程序工人端：扫码、报工、拍照
- 管理后台：Dashboard、工单列表、库存看板

详见 `/开发文档/生产全流程ERP系统开发文档.md`。
