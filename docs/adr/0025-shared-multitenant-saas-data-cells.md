# ADR 0025：共享多租户与数据单元架构

状态：长期候选，当前暂停；当前产品范围由 ADR 0030 约束
日期：2026-08-08

> 2026-08-12 复审：本文不代表当前产品合同，也不能驱动当前 Schema 增加 `tenantId`、PostgreSQL、RLS 或 DataCell。MES-lite 当前先完成单厂领域模型收敛；是否重启多租户 SaaS 须由真实商业需求触发并重新评审。见 [ADR 0030](./0030-single-factory-material-master-and-legacy-write-freeze.md)。

## 背景

MES-lite 当前使用 SQLite、本地附件目录和单实例 Coolify 部署。系统已经覆盖物料、BOM、库存、生产、销售、文档、附件、权限和审计，并计划发展为商业化 SaaS。

商业化需要同时解决：

- 客户之间的数据隔离。
- 多实例部署、备份和恢复。
- 普通客户的成本效率。
- 大客户的地域、密钥和物理隔离要求。
- 附件、AI、报表和图关系能力不能形成第二事实源。

如果从第一天为每个客户创建数据库和 Bucket，运维、迁移、监控、版本升级和小客户成本都会快速增长；如果只依赖应用查询条件，又无法为跨租户缺陷提供数据库级防线。

## 决策

1. PostgreSQL 是生产业务唯一事实源。
2. 普通 SaaS 使用共享数据库、共享 Schema、强制非空 `tenantId`。
3. 服务端 `TenantContext` 是第一层隔离，PostgreSQL RLS 是第二层隔离。
4. 普通租户共享 DataCell；每个 DataCell 拥有独立 RDS、OSS、应用和 Worker 范围。
5. 控制平面保存租户到 DataCell 的映射，业务模块不直接保存数据库连接地址。
6. 企业套餐可以分配独立 DataCell、数据库、Bucket 和 KMS 密钥，但继续运行同一套业务代码和迁移版本。
7. OSS Bucket 保持私有，附件对象键包含租户前缀；浏览器通过 MES 权限 API 或短时签名 URL 访问。
8. 图数据库、搜索、分析和 AI 均为可重建派生能力，不允许直接修改业务主数据、库存、成本、单据和权限。
9. PostgreSQL 与 OSS 分开切换，禁止在同一维护窗口同时更换两个事实存储边界。

## 备选方案

### 每租户独立数据库和 Bucket

隔离最强，但普通客户的资源成本、迁移数量、监控和故障处理复杂度过高。仅保留为企业专属套餐。

### 仅共享数据库，不使用 RLS

实现简单，但一次遗漏 `tenantId` 条件就可能跨租户泄露。商业 SaaS 风险不可接受。

### Schema-per-tenant

比共享表隔离更明显，但 Prisma 迁移、跨租户运营统计和大量 Schema 升级复杂，不作为默认方案。

### 图数据库作为主数据库

不适合库存、成本、单据状态和权限事务；只保留为可选读模型。

## 后果

正面影响：

- 普通租户具备较好的成本效率。
- 数据隔离同时有应用和数据库防线。
- 可以按负载、地域或合同把租户迁移到独立 Cell。
- 附件、分析和 AI 可以独立扩展但不破坏事实源。

需要承担：

- 所有业务表、索引、唯一约束、查询和后台任务都必须租户化。
- RLS、连接池事务上下文和平台运维角色需要专门测试。
- 共享数据库的单租户恢复需要恢复到隔离实例后逻辑回灌。
- 控制平面和 DataCell 路由成为商业运行的关键基础设施。

## 实施依据

- [MES-lite 商业化 SaaS 数据与存储架构](../architecture/saas-data-and-storage-architecture.md)
- [PostgreSQL SaaS 数据结构与迁移计划](../plans/postgresql-saas-migration.md)
- [OSS SaaS 附件存储接入计划](../plans/oss-saas-integration.md)
