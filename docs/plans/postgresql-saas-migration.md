# PostgreSQL SaaS 数据结构与迁移计划

状态：待实施  
日期：2026-08-08  
上位架构：[MES-lite 商业化 SaaS 数据与存储架构](../architecture/saas-data-and-storage-architecture.md)

## 1. 目标

把当前 SQLite + Prisma 单实例数据层迁移为支持商业化多租户的 PostgreSQL 数据层，同时满足：

- 租户数据隔离。
- 多实例和滚动部署。
- 库存、成本和单据事务一致性。
- 自动备份、日志备份和按时间点恢复。
- 在线演进、可观测、可回滚。
- 未来按数据单元拆分，而不重写业务模块。

目标生产环境使用阿里云 RDS PostgreSQL 高可用版，并优先选择跨可用区部署。数据库大版本在采购前以 RDS、Prisma、扩展和迁移演练兼容结果为准；若兼容验证通过，优先使用当前受支持的新稳定版本，不在文档阶段锁死版本号。

## 2. 不同时实施的改造

以下工作有价值，但不得和首次 PostgreSQL 切换捆绑：

- `Product` 与 `Material` 全量合并。
- 仓库、库存状态和复杂在制品模型一次性补齐。
- 图数据库或数据仓库接入。
- 全量微服务拆分。
- 每租户独立数据库。

首次切换的目标是等价迁移、租户隔离和可靠运行，不借迁移窗口重写整个 MES 模型。

## 3. 目标表组

### 3.1 控制平面

| 表 | 关键字段 |
| --- | --- |
| `Tenant` | id、name、status、planId、cellId、region、retentionPolicy |
| `User` | id、登录标识、状态、最近登录 |
| `TenantMember` | tenantId、userId、role、status、employeeId |
| `Plan` | code、功能集合、额度、计费规则版本 |
| `Subscription` | tenantId、planId、status、periodStart、periodEnd |
| `FeatureEntitlement` | tenantId、featureCode、limit、source |
| `UsageEvent` | tenantId、metric、quantity、period、idempotencyKey |
| `DataCell` | code、region、databaseBackend、storageBackend、status |

### 3.2 数据平面公共字段

租户业务表至少包含：

```text
id
tenantId NOT NULL
createdAt / updatedAt
createdBy / updatedBy（适用时）
deletedAt / deletedBy（需要归档时）
```

关键约束示例：

```prisma
@@unique([tenantId, code])
@@index([tenantId, createdAt])
@@index([tenantId, deletedAt])
```

所有租户内业务外键都需要确认两端租户一致。Prisma 无法自然表达的复合约束，由 PostgreSQL 迁移 SQL 和服务层测试共同保证。

### 3.3 平台运行表

| 表 | 作用 |
| --- | --- |
| `OutboxEvent` | 业务事务内登记异步事件 |
| `IdempotencyKey` | 防止重试重复创建单据或重复过账 |
| `MigrationCheckpoint` | 大规模数据回填和附件迁移断点 |
| `SystemAuditLog` | 平台配置、越权运维和租户生命周期审计 |
| `TenantExport` | 客户数据导出任务、范围和校验信息 |

## 4. 租户上下文改造

### 4.1 请求链路

1. 从服务端会话识别 `User`。
2. 验证用户对应的 `TenantMember` 处于可用状态。
3. 生成不可由客户端伪造的 `TenantContext`。
4. 页面/API/领域服务只接收 `TenantContext`，不接受任意 `tenantId` 作为权限依据。
5. Prisma 仓储自动添加 `tenantId` 条件。
6. PostgreSQL 事务设置租户变量，由 RLS 再次限制。

### 4.2 后台任务

任务载荷必须包含 `tenantId`、业务实体 ID、事件 ID 和权限来源；Worker 每次执行重新构造租户上下文。禁止让 Worker 使用没有租户范围的通用仓储方法。

### 4.3 平台运维

跨租户数据检查使用独立平台角色和独立 API：

- 默认只返回计数和健康状态。
- 查看客户明细必须记录原因、工单和到期时间。
- 平台角色和应用运行角色分离。
- 所有跨租户读取写入独立审计日志。

## 5. 字段类型改造

| 当前问题 | PostgreSQL 目标 | 迁移方法 |
| --- | --- | --- |
| 金额使用 `Float` | `Decimal(18, 2)` 或按业务定义更高精度 | 增加影子字段、双算核对、切换读取、删除旧字段 |
| 长度/重量/数量使用 `Float` | 按计量要求使用 `Decimal(20, 6)` 等明确精度 | 先统计历史最大值和小数位再定精度 |
| 状态为任意字符串 | 应用枚举 + CHECK 约束 | 先清理异常值，再增加约束 |
| 时间依赖本地时区 | PostgreSQL `timestamptz`，统一 UTC 存储 | 页面按租户时区展示 |
| 全局唯一编码 | `tenantId + code` 唯一 | 默认租户回填后替换唯一索引 |
| 附件绝对路径 | storageBackend + objectKey | 按 OSS 迁移计划实施 |

金额和数量精度迁移需要独立版本和业务抽样，不和数据库引擎切换同时完成最终字段删除。

## 6. 分阶段实施

### 阶段 A：数据盘点与门禁

- 冻结新增不受控的原生 SQL。
- 生成表、行数、外键、唯一约束、空值和异常枚举清单。
- 运行库存、成本层、附件孤儿和权限一致性检查。
- 记录 SQLite 文件大小、附件规模、迁移耗时和业务低峰窗口。
- 完成一次 SQLite 恢复演练，保证迁移失败可以回到原系统。

验收：所有已知不一致有处理决定，迁移脚本不得静默跳过异常数据。

### 阶段 B：租户骨架

- 新增 `Tenant`、`User`、`TenantMember` 和 `DataCell`。
- 创建 `default-tenant`。
- 分批给现有业务数据回填 `tenantId`。
- 将唯一约束改为租户内唯一。
- 所有新写入强制带租户；历史字段暂时允许回填过程中的过渡状态。
- 增加跨租户自动化测试。

验收：`tenantId` 缺失为零，默认租户业务与迁移前统计一致。

### 阶段 C：PostgreSQL 兼容

- Prisma datasource 改为 PostgreSQL 的独立迁移分支。
- 审查 SQLite 专有 SQL、排序、布尔值、日期和空值行为。
- 用全新 PostgreSQL 数据库生成基线迁移，禁止直接复用 SQLite 迁移 SQL。
- 为库存二选一、数量非负、状态范围等增加 PostgreSQL CHECK 约束。
- 建立生产运行账号、迁移账号和只读审计账号。
- 在预生产导入脱敏数据并运行全量校验。

验收：构建、Prisma Client、种子数据、全部验证脚本和关键流程在 PostgreSQL 通过。

### 阶段 D：RLS 与连接管理

- 高风险租户表先启用 RLS，再逐步覆盖全部业务表。
- 应用事务设置当前租户变量；事务结束后不得泄漏到连接池下一请求。
- 应用账号不拥有表，不使用超级用户。
- 设置连接池上限和查询超时，避免每个 Web 实例按默认连接数压垮 RDS。
- 慢报表与导出进入后台任务；需要时再增加只读实例。

验收：故意使用其他租户 ID、原生 SQL、批量更新和后台任务均无法越权。

### 阶段 E：生产切换演练

首次迁移不采用长期双写。推荐维护窗口：

1. 提前完成至少两次全量演练并记录耗时。
2. 将系统切为只读维护状态。
3. 备份 SQLite 与附件目录。
4. 导出并导入 RDS PostgreSQL。
5. 对比每表行数、关键汇总、库存/成本不变量和附件引用。
6. 运行关键业务冒烟测试。
7. 切换 `DATABASE_URL`，只开放少量管理员验证。
8. 全量开放并持续观察。

回滚条件：关键不变量失败、跨租户隔离失败、核心事务失败或数据差异无法解释。回滚时停止 PostgreSQL 写入，恢复原 SQLite 版本和维护窗口前文件；禁止合并两个数据库切换后的新增业务写入。

### 阶段 F：收紧和清理

- 移除 SQLite 运行依赖和主机数据库卷要求。
- 删除过渡可空字段、兼容读取和临时迁移脚本。
- 开启自动备份、日志备份、告警和恢复演练日程。
- 更新 Coolify 部署与故障排查文档。
- 稳定后再评估金额 Decimal 最终切换、统一物料和库存维度增强。

## 7. 备份与恢复

生产最低要求：

- RDS 高可用版跨可用区。
- 自动数据备份和日志备份。
- 支持按时间点恢复到新实例。
- 每季度恢复演练并记录实际 RPO/RTO。
- 大版本升级和破坏性迁移前执行手动备份。
- 客户数据导出不是数据库备份，数据库备份也不能替代客户迁出包。

共享数据库中的单租户恢复流程：

1. 将目标时间点恢复到隔离 RDS 实例。
2. 按 `tenantId` 导出租户数据及依赖顺序。
3. 在隔离环境验证完整性。
4. 冻结目标租户写入。
5. 事务性回灌或创建新租户副本。
6. 验证后恢复服务并保留审计记录。

## 8. 监控指标

- 连接数、连接等待、CPU、IOPS、存储使用率。
- P50/P95/P99 查询耗时和慢查询。
- 锁等待、死锁、长事务和空闲事务。
- 备份状态、日志备份延迟和恢复演练结果。
- 每租户数据量、写入量、报表负载和异常增长。
- Outbox 积压和幂等冲突。

## 9. 验收清单

- 默认租户回填完整，所有租户业务表 `tenantId` 非空。
- 租户内编码可以重复使用，租户间不冲突。
- A 租户无法通过 ID、搜索、附件、导出、AI 或后台任务访问 B 租户。
- 来料、库存调整、领料、报工、入库、发货和退货事务结果与 SQLite 基线一致。
- 库存、库位、预留、成本层和流水不变量全部通过。
- RDS 故障切换、备份和按时间点恢复至少完成一次演练。
- 维护窗口和回滚步骤已计时、可重复执行。

## 10. 参考资料

- [阿里云 RDS PostgreSQL 高可用系列](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/rds-high-availability-edition)
- [阿里云 RDS PostgreSQL 自动与手动备份](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance/)
- [阿里云 RDS PostgreSQL 恢复数据](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/restore-data-of-an-apsaradb-rds-for-postgresql-instance)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

