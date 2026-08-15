# Product 到 Material 映射与回填

状态：阶段 1B-2 生产操作手册

事实基线：`v0.1.380` / 2026-08-15

## 1. 目的和边界

本流程将历史 `Product` 及其 BOM、成本、工艺、生产、入库、发货和退货引用映射到唯一用户主档 `Material`。`v0.1.353` 只交付“扩展 + 人工确认 + 可回填”：

- 部署时只增加可空 `materialId` 列和索引，不自动回填，不删除 `productId`。
- 映射候选只作为证据，必须由熟悉数据的人员逐行确认。
- 任何 BOM 缺少唯一主产出、引用数变化、投影冲突或 Product 库存非零/有流水，命令都拒绝修改。
- 第 84 个迁移保证每条 `Stock` 必须且只能关联一个 Material 或旧 Product；无归属/双归属历史行会先阻断部署，Product-only 行仍可在 `apply` 的同一更新中切换到目标 Material。
- 本手册不授权在本地推断服务器数据；生产结论以服务器导出的审计、映射文件和结果报告为准。

## 2. 准备条件

1. Coolify 已持久挂载 `/app/data`、`/app/public/uploads` 和 `/app/backups`，且日常备份可验证。
2. 先部署 `v0.1.353`，确认 readiness 通过。该步只应用可空字段迁移，旧映射未确认时业务仍可以运行。
3. 在 Coolify 容器 Terminal 中执行以下命令。如果停止应用后无法进入原容器，应使用同一镜像和同一持久卷的一次性维护容器；不得拷贝数据到容器临时层处理。
4. 映射文件、审计和报告使用不存在的新文件名，命令拒绝覆盖历史证据。

以下命令均先在 Terminal 执行 `cd /app`；如一次性容器的应用目录不是 `/app`，设置 `MES_LITE_APP_ROOT` 为真实应用根目录。

## 3. 导出只读证据

先导出模型审计：

```bash
node scripts/product-material-migration.mjs audit \
  --report /app/backups/product-material/audit-2026-08-12.json
```

再生成待确认映射计划：

```bash
node scripts/product-material-migration.mjs plan \
  --mapping /app/backups/product-material/mapping-2026-08-12.json
```

`audit` 和 `plan` 都只读数据库。计划中每个 Product 包含依赖数、Product 独占库存风险、物料候选以及候选来源；`materialCatalog` 提供有效物料和 `materialStockExists`，便于选择空库存处置。审计会单独统计 `ambiguousCodeMappings`；同时存在 `X` 和 `MAT-X` 两个候选时，兼容读写也会拒绝按排序猜测。`snapshotSha256` 只覆盖不可编辑的计划快照；`preflight` 和 `apply` 都会重新计算，快照变化后必须废弃旧签字。

## 4. 人工确认映射

将映射 JSON 下载到可留档的工作目录，逐项核对：

1. `decision.materialId` 和 `decision.materialCode` 必须指向同一条有效 Material。
2. BOM 必须每张有且仅有一个主产出，且主产出与映射一致。缺主产出的历史 BOM 应先由业务负责人补正。
3. 关联生产订单、入库、发货、退货和销售明细的物料必须一致；有冲突时不得以编码覆盖。
4. `productStock.risky=true` 表示数量、预留、成本、流水或库位余额不为空，自动回填必定拒绝，应先单独制定库存处置单。
5. 空 Product 库存根据计划使用 `DELETE_EMPTY_PRODUCT_STOCK` 或 `MOVE_EMPTY_PRODUCT_STOCK_TO_MATERIAL`；无 Product 库存时为 `NONE`。
6. 每条 `decision.note` 都必须留下核对依据，最后填写真实的 `confirmation.confirmedBy` 和不早于 `generatedAt` 的 ISO 8601 `confirmation.confirmedAt`。

映射必须覆盖所有 Product，一个 Material 不能绑定多个兼容 Product。确认期间如 Product 或依赖数变化，应废弃旧文件并重新生成。

## 5. 维护窗口前只读预检

如维护副本存在已撤回分支迁移或物理 Schema 漂移，必须先按[生产 Schema 漂移审计与收敛候选](./生产Schema漂移审计与收敛候选.md)生成 `NO_SCHEMA_DRIFT` 的非覆盖候选，再对该候选重新生成 Product→Material `plan`。Schema 收敛会改变数据库指纹，收敛前的计划、签字和预检报告一律失效，不得重用。

人工填写完成后，先在停止写入的恢复候选或维护副本上执行：

```bash
node scripts/product-material-migration.mjs preflight \
  --mapping /app/backups/product-material/mapping-2026-08-14-confirmed.json \
  --report /app/backups/product-material/preflight-2026-08-14.json
```

`preflight` 不创建备份、不执行回填。它复用 `apply` 的全部映射门禁，验证签字、逐行依据、Material 有效性、一对一关系、BOM 主产出、现有单据投影、引用计数、Product 库存风险及计划快照；成功和失败都写入不存在的新报告文件，并记录数据库前后 SHA-256。

只有以下条件全部满足才能进入维护窗口：

- `status=PASS` 且 `readyForApply=true`；
- `databaseSha256Before` 与 `databaseSha256After` 完全一致；
- 报告中的 `mappingSha256` 与待执行映射文件一致；
- 当前数据库仍保持停止写入；任何业务数据变化都必须重新 `plan → 签字 → preflight`。

失败报告必须保留。不得直接修改 `snapshotSha256`、绕过签字、复用旧报告或把候选自动决定当作业务批准。

## 6. 维护窗口执行回填

1. 停止对外流量和所有能写数据的应用副本，确认只有一个维护进程持有数据库。
2. 将确认后的 JSON 放回持久备份卷。
3. 执行：

```bash
node scripts/product-material-migration.mjs apply \
  --mapping /app/backups/product-material/mapping-2026-08-12-confirmed.json \
  --report /app/backups/product-material/result-2026-08-12.json \
  --backup-dir /app/backups \
  --uploads /app/public/uploads \
  --maintenance-confirmation STOPPED_SINGLE_INSTANCE
```

`apply` 首先预留报告文件，然后创建并验证数据库+附件一致备份，通过后才在一个数据库事务中回填。失败时保留 `FAILED` 报告、错误和备份信息；`mappingTransactionCompleted=false` 证明映射事务未完成。成功报告为 `COMPLETE`，包含映射文件 SHA-256、备份 SHA-256、前后审计和各表改动数。

## 7. 验收和回滚

成功后先检查报告：

- `after.blockers` 为空，`after.readyForProductForeignKeyMigration=true`。
- Product 数与 mappings 数相同，依赖表回填数与计划一致。
- `integrity.total.invalidMaterialRows=0` 且 `mismatchedProductRows=0`。
- 随机抽查 BOM、工艺路线、生产订单、发货和退货，再启动应用并检查 readiness。

如果失败报告中 `mappingTransactionCompleted=false`，数据映射没有提交，先修正阻塞项并生成新计划。如果报告写入或后置审计在事务完成后失败，停止应用，以报告中 `backup.archivePath` 执行非覆盖恢复：

```bash
node scripts/runtime-backup.mjs stage-restore \
  --archive /app/backups/mes-lite-backup-<timestamp>.tar.gz \
  --target /app/restore-candidates/product-material-<timestamp>
```

验证候选后再切换 `data/uploads` 挂载，不得直接解压覆盖当前运行目录。代码回退本身不会逆转数据回填；数据回滚必须使用该次报告绑定的备份。

## 8. 本地已验证与未完成

已在运行后删除的隔离 SQLite 上验证：从空库应用全部迁移、只读审计、计划、预检通过、未签字/非法 JSON/缺依据/签字后漂移/冲突/缺主产出/非零库存阻断、失败报告、自动备份、9 类数据回填、对账和从成功报告备份恢复。新种子数据审计达到 `ready=true`。

2026-08-14 已对 2026-08-13 生产恢复候选执行只读审计、计划和未签字预检，源文件前后 SHA-256 一致；匿名缺口见[恢复候选只读审计与预检证据](./drills/2026-08-14-product-material-preflight-v0.1.368.md)。2026-08-15 已将同一源候选收敛为当前主线零 Schema 漂移候选，因数据库指纹已变，旧映射计划和预检只作历史缺口证据，不能用于 apply。该隔离候选顺序应用第 83、84 个迁移后，62 条库存保持 Material-only 46、Product-only 16、非法归属 0，关键业务统计和库存汇总不变；这仍不是最新在线生产快照。仍未完成最新生产数据刷新、新候选上的计划与人工映射签字、生产维护窗口回填、异地备份和真实 Coolify 挂载切换。完成这些之前，不得将可空字段收紧或删除 Product 外键。
