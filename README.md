# MES-lite 工厂生产全流程记录系统

**Week 1 后端代码骨架** — 可直接运行的 Next.js + Prisma + PostgreSQL 后端。

---

## 快速启动

### 1. 环境准备

```bash
# 需要 Node.js 20+
node -v

# 需要 PostgreSQL（本地或云端）
# 推荐：Vercel Postgres 免费层，或 Docker 本地跑
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 DATABASE_URL 和 OPENAI_API_KEY（可选）
```

### 4. 初始化数据库

```bash
# 生成 Prisma Client
npx prisma generate

# 创建数据库表
npx prisma migrate dev --name init

# 插入种子数据（产品、原材料、BOM、工艺路线）
npx prisma db seed
```

### 5. 启动开发服务器

```bash
npm run dev
# 打开 http://localhost:3000
```

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
| `POST` | `/api/ai/analyze` | 流式 AI 分析工单质量（需 OPENAI_API_KEY） |

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

```bash
# 部署到 Vercel
vercel --prod
```

数据库使用 **Vercel Postgres** 或 **阿里云 RDS**，环境变量里配 `DATABASE_URL` 即可。

---

## 下一步（Week 2）

- 小程序工人端：扫码、报工、拍照
- 管理后台：Dashboard、工单列表、库存看板

详见 `/开发文档/生产全流程ERP系统开发文档.md`。
