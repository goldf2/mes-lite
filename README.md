# MES-lite 轻量生产业务与物料库存系统

可直接运行的 Next.js + Prisma + SQLite 轻量生产管理系统。当前主线收敛为“小微企业先把日常生产和库存流转记准”：仪表盘、生产日报、物料档案、来料、工单、库存、发货、退货是默认核心；派工和 BOM 成本保留为隐藏高级模块，待流程稳定后再打开。

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

### 当前核心

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/stats/production` | 生产日报/产量统计 |
| `GET` | `/api/materials` | 物料档案查询 |
| `POST` | `/api/materials` | 创建物料档案 |
| `GET` | `/api/stocks?type=material\|product` | 库存查询，物料库存会返回物料封面图片 |
| `POST` | `/api/stocks` | 盘点调整（必须备注原因） |
| `GET` | `/api/material-ins` | 来料记录查询 |
| `GET` | `/api/orders` | 工单记录查询 |
| `GET` | `/api/shipments` | 发货记录查询 |
| `GET` | `/api/returns` | 退货记录查询 |

### 隐藏高级模块

派工和 BOM 成本 API 仍保留在代码中，用于后续恢复完整派工追踪和产品结构成本计算；当前轻量模式默认不在业务菜单中展示。

### AI 分析

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/analyze` | AI 分析占位接口，当前未启用 |

---

## 核心设计原则

1. **日报优先**：默认入口是生产日报，用于看每日产量、报废和生产批次。
2. **库存准确**：物料档案、来料、发货、退货和库存余额是第一核心，库存调整必须备注原因并写入记录。
3. **派工可隐藏**：工单可以记录生产计划和结果，但派工不作为轻量模式必走流程。
4. **逐步扩展**：当日常流转稳定后，再打开派工、BOM 成本等更细的制造管理能力。

---

## 工单流程测试

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

- 生产日报：补充按日期、产品、人员维度的日报录入和查询。
- 物料库存：补齐库存流水查看、盘点和低库存预警。

详见 `/开发文档/生产全流程ERP系统开发文档.md`。
