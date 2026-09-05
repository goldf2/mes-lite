# 单厂 MES 产品边界与核心模型收敛

状态：当前产品合同与阶段 1 迁移依据

事实基线：`v0.1.368` / 2026-08-14

## 1. 当前产品合同

MES-lite 当前是面向单个工厂、单个部署实例和单个业务数据库的轻量 MES。MES 是产品主体，负责物料、BOM、生产订单、生产实绩、来料、库存、库位、设备、文档、销售履约、权限与审计的协同。

- MRP-lite 只提供 BOM 用量和计划数据基础，不承诺净需求、自动排程或完整采购建议。
- ERP-lite 只提供客户、供应商、销售订单、发货、退货和价格快照，不承诺总账、应收应付、税务或完整采购。
- 当前不承诺多租户 SaaS、跨工厂组织隔离或多实例数据单元。相关文档仅是长期候选，不得驱动当前 Schema 扩张。

## 2. 唯一物品主数据

`Material` 是唯一用户可见、可维护的物品主数据，覆盖原料、半成品、成品、包装物、废料和可回收料。

`Product` 是旧表外键的临时兼容投影，不是第二套产品主档：

1. 用户不能独立维护 `Product`。
2. 后端只允许为仍依赖旧外键的记录解析兼容映射：保留 `Product.id`，以 `materialId` 显式绑定物料，并以 `Material.code` 作为同码 SKU；真实 `MAT-` 不是可随意增删的兼容标记。历史未绑定编码仅作无歧义候选，冲突必须由数据工具预检阻断并人工处理。
3. 新建或补齐库存只面向有效 `Material`；不得再为 `Product` 创建或补齐 `Stock`。
4. `Product` 不能成为新功能、新字段或新关联的设计依据。

`Stock` 表示物料总库存余额，`StockLocationBalance` 表示库位余额。历史 `Product` 独占库存只进入审计清单，不自动修复或扩大双轨。

## 3. 唯一生产事实链

当前生产事实由以下两个模型表达：

- `ProductionOrder`：生产目标、计划数量、BOM 引用与创建时快照。
- `ProductionOrderActual`：班后实际投入、全部产出、人员、库位、成本和确认/冲销事实。

旧模型只承担历史解释和迁移，不再承接新业务：

- `DailyProductionReport`：禁止新建，`POST /api/daily-production-reports` 返回 `410`；查询、修改、确认和冲销仅用于既有历史记录。
- `PickItem`、`WorkReport`、`StockIn`：`/api/orders/:id/pick`、`reports`、`stock-in` 只允许处理没有 `materialId` 的历史工单；已绑定 `Material` 的工单返回 `410`，必须使用 `ProductionOrderActual`。

本冻结不删除任何表或历史记录，也不改写现有库存。

`v0.1.380` 进一步在数据库层固定过渡期库存归属：每条 `Stock` 必须且只能关联一个 `Material` 或一个旧 `Product`。迁移前门禁拒绝带着无归属/双归属历史行继续部署；Product-only 仍是合法待迁移状态，不能把该约束误解为 Product→Material 已完成。

## 4. Product 外键退出表

| 当前依赖 | 阶段 1B 目标 | 迁移原则 |
| --- | --- | --- |
| `BOM.productId` | 显式主产出 `Material` 关系 | 由已发布 BOM 主产出和兼容编码交叉校验，冲突必须人工确认 |
| `BomCostRun.productId` | `materialId` + BOM/成本快照 | 历史成本结果保留当时物料名称、单位和版本 |
| `ProcessRoute.productId` | `materialId` | 同一物料的有效路线和工序顺序不得重复 |
| `SawingCostScenario.productId` | 可空 `materialId` | 允许保留无主数据的历史试算，但新试算优先绑定物料 |
| `ProductionOrder.productId` | 必填 `materialId` | 先补齐、核对 BOM 快照，再收紧非空 |
| `Stock.productId` | 必填 `materialId`，移除 `productId` | Product 独占库存必须先映射；非零或有流水时禁止自动合并 |
| `StockIn.productId` | 归档历史模型，不再新建 | 完成历史解释与核对后再决定是否物理迁移或保留只读表 |
| `Shipment.productId` | 必填 `materialId` | 先用销售明细和兼容编码回填，冲突人工处理 |
| `ReturnOrder.productId` | 必填 `materialId` | 与来源发货保持同一物料，禁止独立猜测 |

## 5. 阶段 1B 迁移顺序

只有生产环境备份挂载、可验证备份和非覆盖恢复演练完成后，才允许迁移：

1. 在停止写入的最新生产恢复候选运行 `audit` 与 `plan`，保存只读盘点和待确认映射；历史候选统计只能作为准备证据，不能替代维护窗口前刷新。
2. 人工建立所有未映射 `Product → Material` 的确认表，尤其核对非零库存、流水、成本和单据引用。
3. 执行 `preflight`，要求 `PASS`、`readyForApply=true` 且数据库前后 SHA-256 一致；任何漂移都重新生成并签字。
4. `v0.1.353` 已先增加可空 `materialId` 投影和索引，并交付备份门禁、事务回填和对账报告；生产真实映射尚待人工签字执行。
5. 仅在必要的短窗口内双写新旧关系；结构守卫禁止新增依赖范围。
6. 当每张表的旧引用数为零后，依次收紧 `materialId`、移除兼容读写，最后删除 `Product` 外键。

任何自动推断不能覆盖有业务冲突的数据。每一步必须可从迁移前备份恢复，并保留前后统计证据。

## 6. 目标状态机

### 生产订单

```text
DRAFT -> RELEASED -> IN_PROGRESS -> COMPLETED
  |          |             |
  +----------+-------------+-> CANCELLED
```

- 历史 `CONFIRMED / PICKED / DISPATCHED` 统一解释并迁移为 `RELEASED`。
- 历史 `RUNNING / QC_WAITING / QC_DONE` 统一解释并迁移为 `IN_PROGRESS`。
- 已完成订单不能直接取消；冲销生产实绩后再按明确规则回退累计状态。

`v0.1.350` 已在应用层执行该状态机：草稿必须显式发布后才能派工或登记实绩；首次确认实绩进入 `IN_PROGRESS`；达到计划数量进入 `COMPLETED`；冲销全部实绩回到 `RELEASED`。列表筛选、派工候选、仪表盘和 AI 查询把历史状态归并到当前口径，但不批量改写数据库原值。

### 生产实绩

```text
DRAFT -> CONFIRMED -> REVERSED
```

批次、待检、可用、冻结、放行和不合格处置属于阶段 2 的独立批次/质量事实，不再继续塞入生产订单状态。

## 7. 审计与当前结果

运行：

```bash
npm run audit:model-convergence
```

该命令只读统计 Product 映射、旧外键引用、缺失 Material 投影、Product 独占库存、订单原始/归并状态、旧生产记录和迁移阻断项，不修改数据库。

`v0.1.353` 本地原数据库没有应用新迁移或修改数据，只读命令安全返回“数据库尚未应用 Material 投影扩展迁移”。将原库复制到隔离路径后应用待执行迁移，核心表行数不变且 `PRAGMA quick_check=ok`。空库全迁移+新种子数据审计达到 `ready=true`；隔离回归完成了阻断、备份、9 类投影回填、对账和恢复。这些都不代表生产真实数据；生产结论必须按[Product 到 Material 映射与回填](../operations/Product到Material映射与回填.md)重新导出并签字。

`v0.1.368` 增加只读 `preflight`，复用实际回填前的全部映射守卫并记录数据库前后 SHA-256。已对 2026-08-13 生产恢复候选生成匿名缺口：16 个 Product 中 13 个有唯一候选、3 个无候选，2 张 BOM 缺主产出，独占库存无非零/流水风险；该结果不是在线生产实时审计，不能替代业务签字或维护窗口刷新。

## 8. 回滚边界

`v0.1.349` 不修改 Prisma Schema、不迁移数据、不删除历史记录。代码回滚到 `v0.1.348` 可以恢复旧写入口，但会重新扩大双轨，只用于紧急技术回退。已存在的数据不需要回滚；后续任何阶段 1B 数据迁移必须另建版本、备份和恢复点。

`v0.1.350` 同样不修改 Schema 或批量状态数据。回退到 `v0.1.349` 会恢复旧订单状态写法和草稿直接登记实绩行为；新版本已经写入的 `RELEASED / IN_PROGRESS` 记录不会被旧界面完整解释，因此回退前需先确认没有这两类新记录，或同时提供兼容补丁。

`v0.1.353` 的 Schema 扩展可在回退代码时保留，不做 SQLite 破坏性删列。如已执行生产 `apply`，必须用该次报告绑定的备份恢复数据，只回退代码无法逆转映射事务。
