# 生产 Schema 漂移审计与收敛候选

状态：`v0.1.377` 可执行运维基线

本流程用于回答一个具体问题：“当前生产 SQLite 的真实结构，是否与指定 Git 提交的全部主线迁移一致？”它不使用 `schema.prisma` 直接推导生产修改，不在原库上执行 `migrate diff` 脚本，也不代替数据库与附件一致备份。

## 1. 安全边界

- 审计器先复制数据库及存在的 `-wal` / `-shm` / `-journal`，再对复制品生成一致快照；SQLite 不打开用户指定的源文件。
- 开始和结束均校验源证据大小与 SHA-256；复制期间有任何变化即废弃报告。
- 目标基线从 `--expected-ref` 对应提交的 `prisma/migrations/` 在空库上完整部署生成，不使用开发库作为基线。
- 报告、候选库、归档和候选报告都必须是不存在的新路径，拒绝覆盖旧证据。
- 收敛脚本只对新建的 `.partial` 候选执行 SQL；失败时删除部分候选，源库即为回滚点。

## 2. 只读审计

```bash
npm run audit:production-schema-drift -- \
  --database .runtime/production-audit/mes_lite.db \
  --report .runtime/production-audit/schema-drift-<timestamp>.json \
  --expected-ref <approved-commit>
```

退出码：

| 退出码 | 含义 | 下一步 |
| --- | --- | --- |
| `0` | `NO_SCHEMA_DRIFT` | 继续正常迁移、应用恢复和业务门禁 |
| `2` | 存在结构漂移 | 停止直接部署，审查报告与数据处置 |
| `1` | 参数、证据、Git 基线或工具失败 | 废弃本次输出并重新审计 |

报告分开记录额外对象、缺失对象、语义变更对象和 SQLite 重建引起的等价 SQL 定义差异。不得因为 SQL 文本排列不同就将等价表误判为业务漂移。

## 3. 生成非覆盖收敛候选

只有审计报告绑定的源库哈希、目标提交与当前 `HEAD` 都一致，且历史数据处置已获批准时，才能执行：

```bash
npm run prepare:production-schema-reconciliation -- \
  --database .runtime/production-audit/mes_lite.db \
  --audit .runtime/production-audit/schema-drift-<timestamp>.json \
  --target .runtime/production-audit/schema-reconciled-<timestamp>.db \
  --archive .runtime/production-audit/retired-schema-<timestamp>.json \
  --report .runtime/production-audit/schema-reconciliation-<timestamp>.json \
  --operator "真实操作人"
```

工具会：

1. 将待删除表的建表 SQL 和全部行、待移除列的旧值写入权限 `0600` 的 JSON 归档。
2. 只对新建候选执行审计报告内绑定的 Prisma diff SQL。
3. 执行 `quick_check`、`integrity_check` 和外键检查。
4. 对候选重新运行同一目标提交的 Schema 审计，只有 `NO_SCHEMA_DRIFT` 才原子更名为最终候选。
5. 保存源库、审计、归档和候选哈希，供审批和回滚复核。

## 4. 应用级验收与生产切换门禁

Schema 零漂移只证明候选结构与主线迁移一致，不证明附件完整、应用可用或 RPO 达标。随后必须按[备份、恢复与灾备演练](./备份恢复与灾备演练.md)执行 `storage:drill:application`。

生产切换前仍必须全部满足：

- 停止写入后从当前生产生成新的数据库与附件一致备份，RPO 不超过 24 小时。
- 业务负责人签字确认退役结构归档的数据去向，不得只由开发人员决定。
- 在隔离应用完成 readiness、登录、物料、库存、生产单和附件哈希抽查。
- 保留旧挂载目录，在 Coolify 维护窗口切换新候选；失败时停止容器并切回旧挂载，不在运行中覆盖 SQLite。
