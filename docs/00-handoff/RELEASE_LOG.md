# 发布记录

## REL-20261016-02：MES-lite v0.1.477（发布及生产只读验收完成）

- 状态：`v0.1.477 / 5ba3c60629267aa07e5d9b45e9e3179debcbe333` 的候选 MES-lite CI `38852986428` completed/success；同一 SHA 于 2026-10-16 13:08 +08:00 推进 `main`。Con01 Web 队列 `okpotsvf2byq7osnxg10k4gg` 于 13:14:46.856 +08:00 rolling completed、13:14:47 +08:00 finished；Web 版式已部署并由根代理独立完成生产只读核验，当前 Web 为 477，旧 476 已移除。main CI `38854196221` completed/success，与候选 CI `38852986428` 均精确匹配 `5ba3c60629267aa07e5d9b45e9e3179debcbe333`，两个完整 CI 已通过。CAD 自动队列 `tx6gb1aorv30atkn1is3xqfi` 于 13:22:24 +08:00 finished；根代理独立确认 Web/CAD 两队列均 finished、同精确 SHA 且无 error。CAD 唯一新容器 `df0c26ebc8c9 / ruzskr3355n5mq9ouv3kiy9t-050811424859` healthy，image 为 `ruzskr3355n5mq9ouv3kiy9t:5ba3c60629267aa07e5d9b45e9e3179debcbe333`，旧 CAD 已移除（子代理确认），CAD smoke test 通过。根代理最终复查公网 readiness 为 200/ready，CAD 和迁移 pass，仅保留既有 Collabora warn；477 发布及生产只读验收全部完成。
- 运行容器与持久化：唯一 Web 容器 `036f02dce06d7b91efb8b85752f7d924a84165adc74bf094a673d83900f5d6c5 / jhjbwdumt46lsy4x2zj03llo-050809327290` healthy，package `0.1.477`、`SOURCE_COMMIT` 与 image 精确匹配 `5ba3c60629267aa07e5d9b45e9e3179debcbe333`。原三条 RW 持久挂载未变，启动备份 true。
- 新备份完整性：新启动备份 `mes-lite-backup-2026-10-16T05-12-21-551Z-90f93085.tar.gz`，191066283 bytes，SHA-256 `15482e01c6aa461e2160a5e9eead6cefcf8f832eec33d91c32e21c16e5e39d25`；根代理和子代理独立重算归档 hash，并通过 sidecar、manifest 每文件校验、manifest quickCheck 及内存 SQLite 实际 `quick_check`。原 `/opt/mes-lite/data → /app/data`、`/opt/mes-lite/uploads → /app/public/uploads`、`/opt/mes-lite/backups → /app/backups` 三条 RW 挂载与启动备份 true 均确认。
- 范围：客户连续纸和 A4 发货单将收发货资料放在明细前；顶部收货方在左、供货方在右，联系人、电话和地址各归本栏，单号、日期独立横排。收货联系人取 `customerRef.contact`、缺失显示 `-`；长地址完整流式分页。合计仍紧接最后一条明细；页脚按“备注 → 客户凭证号/物流单号 → 包裹 → 签收”排列，备注位于页脚第一行并支持完整多行换行。短页脚整体锚定末页底部，长备注向上扩展，超长内容完整续页，末页签字位置固定；预留页脚空间，绝不覆盖明细或合计。customer profile 升为 v4，避免旧版式缓存，旧归档及二维码原文件不变。
- 复用与边界：沿用 `modules/sales` 客户 PDF 绘制、发货事实/可见内容投影、独立纸型归档与二维码下载；无数据库迁移、权限或库存计算变化，内部留档继续使用原通用 A4 引擎。
- 本地验证：`verify:business-document-print`（双纸型左右分栏及两侧分别 240 段地址跨页、左右坐标同 y、单页/32 行多页、超高行、合计位置、联系人内容变更、v3/v4 历史字节，以及页脚底部锚定、备注首行与超长分页、不覆盖明细合计）、`tsc --noEmit --incremental false`、4 文件定向 Lint、`verify:module-boundaries`、`verify:sop`、`verify:development-docs`、`verify:release-notes` 和 `git diff --check` 均通过。180 段备注连续纸为 4 页、A4 为 2 页，续页标明“备注（续）”，全文完整，末页凭证/包裹/签字 y 坐标与普通单页一致；根代理已人工检查最终单页、32 行多页末页及 180 段备注连续纸 4 页/A4 2 页全部页面，无截断、裁切或重叠。
- 文档同步：`docs/product/业务单据打印与归档.md`、`docs/architecture/code-directory-and-module-boundary.md`、`docs/minierp/当前系统建模与结构审查.md`、`docs/minierp/系统交互与设计规范.md`、`docs/minierp/桌面端界面开发规范.md`、`docs/minierp/system-function-flow.md`、`docs/minierp/feature-model.md`、`docs/releases/PENDING.md`、四份 `docs/00-handoff` 记录，以及 SOP 27/28/29、`sop/change-impact.json` 和 v0.1.477 Markdown 指导书。旧版指导书保留，未生成 DOCX/PDF/视频成品。476 发布后记录当时先留本地，本次 477 修复一并归档。
- 生产核验：13:15:15 +08:00 根代理独立核对公网首页、health、readiness 均为 200，11 个首页 JS 均 200，`app/page-129079e0e8ca7502.js` 包含版本 `0.1.477`；CAD readiness pass，仅保留既有 Collabora 未配置 warn。未生成真实业务 PDF、未进行业务测试写入，未访问 AL02；实际纸张走纸、复写和定位仍待用户试打。

- 记录边界：本次 477 发布后记录只留本地，不另行提交或推送，以免触发新部署或改变已部署 SHA；476 历史生产验收保留。

## REL-20261016-01：MES-lite v0.1.476（Con01 已部署，生产只读验收通过）

- 状态：用户授权后于 2026-10-16 10:37 +08:00 推进同一精确提交到 `main`；首次部署失败后单独重试 Web，队列 `e12qu6kigts324veh7ei58vq` 于 11:00:44 +08:00 rolling completed、11:00:45 +08:00 finished。生产版本、健康、备份与认证浏览器只读验收通过；真实打印仍待用户试打。
- 发布提交：`81b22102188640903a069ce4598fbb238935c9a0`，版本 `v0.1.476`；候选 MES-lite CI `38837203048` success，main CI `38841347727` completed/success（精确同 SHA；GitHub 更新时间2026-10-16 10:53:05 +08:00，verify 15m53s）。
- 范围：客户发货单连续纸 241 × 140 mm / 标准 A4 210 × 297 mm 双输出，均为 190 mm 正文；网页原 PDF 预览可直接打印，按纸型独立归档/二维码/历史，发货详情使用正文顶部可换行动作区。无本轮数据库迁移。
- 当前 Coolify 位置：Con01 `RootTeam / 03网站与在线工具 / production / MES Lite · Web`；项目 `m11yfeih6uwg32b7w2jl6qjc`、环境 `o31ffsi3n0f3ijpruc6cli7o`、应用 `jhjbwdumt46lsy4x2zj03llo`。用户澄清只是变更 projects 分组，不是更换服务器或数据目录；[当前 Web 资源](https://cool-con01.xiangshu.me/project/m11yfeih6uwg32b7w2jl6qjc/environment/o31ffsi3n0f3ijpruc6cli7o/application/jhjbwdumt46lsy4x2zj03llo)。
- 首次部署：同一 SHA 的 Web `ryxqldab81le6ar7at0livtz`、CAD `as4v4rsba3iqhup61ztlmtfj` 于 2026-10-16 10:45:11 +08:00 共同 exit 255 失败。Web 的 Next.js 构建本身成功，随后 runner 依赖/镜像阶段与 CAD 的 C 编译被中断；Docker 日志随后出现 `context canceled` 与 `session healthcheck fatal (only one connection allowed)`。未发现 OOM，磁盘约 124 GB 可用，Docker/SSH 无重启；精确根因未证实，不能据此断言并发必然导致失败。
- 串行重试：首次失败期间旧 Web `v0.1.475 / 8c7…` 与旧 CAD `480be…` 保持 healthy，数据挂载未动。核对 active queues/helpers 清空后，经 Coolify UI 只重试 Web；最终唯一 Web 容器为 `ff981079fe22 / jhjbwdumt46lsy4x2zj03llo-025011444575`，image 与 `SOURCE_COMMIT` 均为精确 `81b22102188640903a069ce4598fbb238935c9a0`，package `0.1.476`、healthy，旧 Web 容器已移除。根代理独立 SSH 复核唯一健康容器和原三条 RW 挂载。
- 持久化与迁移：`/opt/mes-lite/data → /app/data`、`/opt/mes-lite/uploads → /app/public/uploads`、`/opt/mes-lite/backups → /app/backups` 保持 RW，`MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=true`；98 条迁移验证通过，无本轮新增迁移。
- 启动备份：`mes-lite-backup-2026-10-16T02-58-19-687Z-3d66702d.tar.gz`，190984020 bytes，SHA-256 `cb0c8bc3665ac9313104c37a919db292b6a4c3d36527cb2293a2ef706870157a`。子代理流式检查全部 698 个 tar 文件及 manifest/hash 全匹配，数据库 quickCheck `ok`，附件记录 250、上传文件 697；根代理独立复算归档 SHA-256 匹配。
- 公网验收：11:01:51 +08:00 `/api/health/ready` 返回 200，database、98 migrations、dataStorage、attachmentStorage、backupFreshness、CAD 均 pass，仅保留原未配置 Collabora warn。首页引用的 11 个 JS 全部 200，`app/page-e8f9855939739da6.js` 含版本 `0.1.476`；打印模块按需加载。滚动切换时新旧两容器并存曾短暂出现新 chunk 404，旧容器清理后全部 JS 200，该现象已消失。
- 认证页面验收：使用既有认证会话刷新 [发货页](https://mes.csyufeng.com/?page=shipment)，确认系统版本 `0.1.476`，每行可见“客户发货单·连续纸”（`paper=continuous`）、“客户发货单·A4”（`paper=a4`）及“内部留档”。未点击生成真实业务 PDF，未创建测试单据或进行业务测试写入；实际纸张走纸、复写与定位尚待用户试打。
- CAD：本次自动队列失败记录保留；CAD 源码未变，不额外重试，仍使用原 `480be…` healthy 版本，最终 readiness 的 CAD 为 pass。
- 下一步：用户按匹配纸型、100% 实际大小试打，核对针式连续走纸、各联复写和普通 A4 定位；原有产品事项继续按既有优先级推进。
- 476 发布后记录当时先留本地，本次 477 修复一并归档；本次上线核验仅访问 Con01，未访问 AL02。

## REL-20260906-06：MES-lite v0.1.467（发布前）

- 状态：本地实现和定向门禁通过；候选 CI、main 和 Con01 待完成。
- 目标：生产日报明确选择并冻结 BOM 成本运行；BOM 成本对象精确匹配并防止复合锯切重复覆盖；物料全景安全兼容唯一可归属的历史成本运行。
- 兼容：无数据库迁移、库存数据改写或权限变化；历史歧义成本运行只提示待归属，不自动改写；未选择成本运行时保留旧的最新匹配回退。
- 本地证据：日报、生产订单、BOM-工艺路线-工作中心成本、BOM 成本规则、物料全景、模块边界、开发文档、SOP、发布树、TypeScript 和差异格式检查已通过。
- 下一步：在 `ci/0.1.467` 形成精确提交并通过 CI 后推送同一 SHA 到 `main`，只在 Con01 部署并核对备份、容器健康、迁移和公网 readiness；不访问 AL02。

## REL-20260906-05：MES-lite v0.1.466

- 状态：已完成候选、main 和 Con01 生产验收。
- 目标：生产订单在选定已发布 BOM 后可以明确选择已保存成本运行；服务端再次校验产品、BOM 和工艺路线归属，订单冻结所选成本与路线快照。
- 兼容：未选择成本运行时保留最新匹配运行回退；无 BOM 临时生产不变；无数据库迁移和数据改写。
- 本地证据：`verify:production-order-module`、`verify:bom-lifecycle`、`verify:production-actual-context`、`verify:bom-process-cost-link`、`verify:module-boundaries`、TypeScript 已通过。
- 证据：候选 CI `33999128022`、main CI `33999726162`；Con01 队列 `bnqbb12qoyhvvtkm8xbcaqjx` 于 00:09:08 finished，最终容器 healthy，备份 `mes-lite-backup-2026-09-06T00-04-48-240Z-7ee4b427.tar.gz` SHA-256 校验 OK，公网 health/readiness 200，迁移 96，持久卷未变。
- 下一步：继续多路线生产执行与实际工序成本完善，不访问 AL02。

## REL-20260906-04：MES-lite v0.1.465

- 状态：仅收口 v0.1.464 最终活跃容器和最新备份证据；候选、main 和 Con01 复验待本版本门禁完成。
- 运行时：无业务代码、数据库结构、库存数量、BOM/工艺/成本规则变化；继续使用 v0.1.463 的 120 秒 readiness 启动窗口和迁移前备份变量。
- 证据基线：v0.1.464 精确 SHA `ea126da453e6fa8640734da1a9248d2c61bfacdd`，候选 CI `33993847398`、main CI `33994513463`；最终 Coolify 部署 `omufsu03hc2k9l7iy9crpi14` finished，详见 `docs/releases/v0.1.465.md`。
- 下一步：完成本次文档版本的候选/main/Con01 复验后，回到生产成本闭环的显式成本运行选择、多路线执行和实际成本完善。

## REL-20260906-03：MES-lite v0.1.464

- 状态：仅收口 v0.1.463 的生产验收证据和交接文档；候选 CI `33993847398`、main CI `33994513463` 均成功，Con01 部署 `x10zu5ki8won9u8pq45ecexg` 与 `omufsu03hc2k9l7iy9crpi14` 均完成。
- 运行时：无业务代码、数据库结构、库存数量、BOM/工艺/成本规则变化；继续使用 v0.1.463 的 120 秒 readiness 启动窗口和迁移前备份变量。
- 证据基线：v0.1.463 精确 SHA `72beb984f58c46f98589568ff167eca94d290b2a`，候选 CI `33991640324`、main CI `33992378118`、Coolify 部署 `q7vtzftk9wah6r6bu4tv2nga` 均已成功，详见 `docs/releases/v0.1.464.md`。
- 下一步：以 v0.1.465 收口最终活跃容器和最新备份证据；不再重复触发同一 SHA 的滚动更新。

## REL-20260906-02：MES-lite v0.1.463

- 状态：修复已提交并推送 `main`，候选 CI `33991640324`、main CI `33992378118` 均成功；Con01 部署 `q7vtzftk9wah6r6bu4tv2nga` 已通过并完成生产验收。
- 根因：启用 `MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=true` 后，备份快照和 Prisma 启动超过 Docker/Coolify 15 秒健康检查启动窗口；新容器实际完成备份并启动，但被 Coolify 判定为不健康并回滚。
- 修复：Docker readiness 健康检查启动窗口改为 120 秒；运维回归锁定该门槛，恢复/部署文档补充备份启动语义。
- 生产证据：失败部署 `n3fep7049rrhg020flpidkna` 已自动回滚；备份归档 `mes-lite-backup-2026-09-05T20-36-41-944Z-2383919f.tar.gz` 创建成功，数据库快照检查通过；旧容器继续运行 `5508d3d…` 并保持公开 readiness 200。
- 下一步：以 v0.1.464 收口生产证据；不再重复触发 v0.1.463 的滚动更新。

## REL-20260906-01：MES-lite v0.1.462

- 状态：候选 CI `33988801209` 与 main CI `33989565361` 均成功；`main` 已快进并自动部署到 Con01。备份开关仍待 v0.1.463 重试时加载。
- 目标：冻结生产订单、生产实绩和快捷生产日报的 BOM/工艺路线/工作中心/成本依据，并按 BOM 展示成本追溯。
- 数据迁移：`20260905150000_freeze_production_route_and_cost_snapshots`，仅新增可空快照列、外键和索引。
- 本地验证：Prisma 生成、TypeScript、BOM 成本联动、生产订单/实绩/日报快照、物料全景按 BOM、模块边界、架构基线和差异格式已通过；完整 CI 待候选分支。
- 下一步：由 v0.1.463 延长健康检查启动窗口后重试 Con01 滚动更新；旧容器已验证健康，未发生数据回滚。
- 回滚：不删除新迁移；生产若已写入快照，先备份并停止新写入，再按迁移兼容策略回退代码。

## REL-20260905-02：MES-lite v0.1.460

- 时间：2026-09-05 12:07 CST；状态：准备替代候选。
- v0.1.459 候选 a1a80c007b63fd217ab10ea064eea31a6c920242 / CI 33943480904 已主动取消；发现统一编码顺带同步单位会误解释旧 Product 库存数量，未进入 main 或生产。
- v0.1.460 只同步已有 Product 编码/物料绑定，编辑时同步名称，保留其历史单位/客户/类别；新建仍复制必要元数据。
- 无新 schema 或自动迁移；新增历史单位保留的确定性回归后重新提交候选。

### 2026-09-05 12:03 CST：v0.1.459 候选已推送

- 提交 a1a80c007b63fd217ab10ea064eea31a6c920242，远端 ci/0.1.459；MES-lite CI 33943480904 运行中，尚未推进 main。
- 本地发布说明、SOP/研发文档、依赖与发布树检查、TypeScript、所有改动 TS/TSX 的定向 Lint 通过；数据库/依赖/用户原目录改动均未提交。
- 此条为候选 SHA 形成后的本地发布证据，等待最终结果补齐。

## REL-20260905-01：MES-lite v0.1.459

- 时间：2026-09-05 12:00 CST；状态：本地定向验证通过，候选待推送。
- 工作树：/private/tmp/mes-lite-unified-code.QpageH；分支 fix/unified-material-code-v01459。
- 范围：统一 Material/Product 编码、显式身份查询、选择器去重、真实 MAT- 保留和受控规范化预览。
- 无 schema/自动 SQL 迁移；既有 Product ID、发布 BOM、库存和历史快照不变。
- 本地：领域回归、TypeScript、定向 Lint、边界与审计检查通过；构建留给 CI。
- 目标：Con01 / mes.csyufeng.com；当前 Mac 锁屏，生产旧数据尚未执行修复。
- 下一步：精确候选 SHA 通过 CI 后推 main；新鲜备份后通过数据工具预览执行、复核。

## 2026-09-05 11:57 CST：更正 v0.1.458 发布状态

- origin/main 为 08b7cf5ec5b786daafadc64c1b9a4c642500998a；候选 CI 33887668557 与主线 CI 33890614050 均通过，后者 completed/success 再次经 GitHub 读取确认。
- 公开 readiness 返回 ready，93 个迁移；备份超过 26 小时与 Collabora 未配置仍警告。
- 下方 2026-09-04 的“未提交/待运行”记录为历史状态，不代表当前主线。

## REL-20260904-05：MES-lite v0.1.458

- 状态：本地验证通过，候选待运行
- 时间：2026-09-04 23:04 CST
- 版本：v0.1.458
- Git 提交：待提交
- 目标环境：Con01 Coolify 生产环境

### 变更范围

- 物料全景左栏最大占比由 48% 收紧为 42%，且“档案与库存”到超宽屏才内部并排，为 1280px 宽屏下的右侧复杂明细保留可读空间。
- 隐藏当前展开明细时同步清空活动状态。
- 公共 `SplitWorkspace` 在站点存储读写异常时降级到默认比例或当前会话布局。

### 验证证据

- SOP Markdown 已重新生成；物料/BOM 定向回归、TypeScript、SOP 清单、版本说明、开发文档、架构与模块边界、差异格式校验通过。
- 定向 Lint 为 0 error；`MaterialPanoramaOverviewModules.tsx` 保留 1 条既有 `no-img-element` 警告。
- 1280px 最大 42% 左栏下右侧约 690px，档案与库存上下排列、文本正常、无横向溢出；隐藏并恢复当前模块后保持收起；390px 上下排列且 `scrollWidth = 390`。
- `v0.1.457` 主线 CI `33886361407` 已取消，由本版本取代；候选 CI 尚未运行。
- 尚未提交、推送、部署或进行生产验收。

### 回滚

- 无数据库迁移；候选尚未形成，不适用生产回滚。
- 实际回滚结果：未触发。

## REL-20260904-04：MES-lite v0.1.457

- 状态：候选已通过并推入 main；主线 CI 已取消，由 v0.1.458 取代
- 时间：2026-09-04 22:16 CST
- 版本：v0.1.457
- Git 提交：`6e1491915c034ec05bfbcca996bc37304c2d5082`
- 目标环境：Con01 Coolify 生产环境

### 变更范围

- 物料全景宽屏改为左侧纵览、右侧明细的可调宽主从布局；窄屏自动上下排列。
- 明细默认全部收起且一次只展开一组，原七组模块与业务查询保持不变。

### 验证证据

- 物料/BOM 模块边界、TypeScript、定向 Lint、本地窄屏真实交互和候选 CI `33883741692` 已通过，候选精确对应上述提交。
- 同一提交已推入 `main`；发现中等宽屏边界后，主线 CI `33886361407` 已主动取消，最终发布改由 `v0.1.458` 承接。

### 回滚

- 无数据库迁移，可重新发布 v0.1.456 对应提交。
- 实际回滚结果：未触发。

## REL-20260904-03：MES-lite v0.1.456

- 状态：已部署并完成生产验收
- 时间：2026-09-04 19:35 CST
- 版本：v0.1.456
- Git 提交：`51d0cd45638d53c4fe3abf5e3797816d819d5ae0`
- 目标环境：Con01 Coolify 生产环境

### 变更范围

- 物料全景改为关键指标仪表台和按需折叠的详细资料。
- 原业务查询、库存余额、成本计算、接口、权限和数据库保持不变。

### 验证证据

- 完整 50 项本地 CI 基线、物料/BOM 模块边界、TypeScript、定向 Lint、生产构建、SOP、版本说明和差异格式验证通过。
- 候选 CI `33869015178`、主线 CI `33871113932` 通过，均对应上述提交；Con01 生产静态版本为 `v0.1.456`。
- 生产物料 `P12-12288040-21-cut` 的折叠交互、BOM 关系与锯切成本 `¥13.96/件` 已核验；2026-09-04 22:17 CST 公开 readiness 返回 `ready`。

### 回滚

- 无数据库迁移，可重新发布 v0.1.455 对应提交。
- 实际回滚结果：未触发。

## REL-20260904-02：MES-lite v0.1.455

- 状态：候选验证中
- 时间：2026-09-04 14:50 CST
- 版本：v0.1.455
- Git 提交：待提交
- 目标环境：Con01 Coolify 生产环境

### 变更范围

- 只有确认发货允许形成由明细支撑的负库存。
- 后续同物料、同库位可用入库自动补齐原发货的批次和成本。
- 欠库未补齐时限制退货；发货冲销同步恢复补账事实。

### 验证证据

- Prisma、TypeScript、发货负库存、多明细、冲销、退货批次、库存事务账本、数据一致性和来料回归已通过。
- Lint、SOP、研发文档、发布说明、候选 CI、健康检查和生产真实工作流待记录。

### 回滚

- 没有产生欠库记录时可重新发布上一个已验证提交。
- 已产生欠库记录时先暂停写入、备份并补齐或冲销开放欠库，不直接降级旧应用。
- 实际回滚结果：未触发。

## REL-20260904-01：MES-lite v0.1.454

- 状态：准备中
- 时间：2026-09-04 12:17 CST
- 版本：v0.1.454
- Git 提交：待提交
- 目标环境：Con01 Coolify 生产环境

### 变更范围

- 锯切成本默认关联已有物料，并在物料全景显示。
- 锯切成本可选关联到目标物料的草稿 BOM；已发布 BOM 保持只读。

### 验证证据

- 领域与静态验证：见 `CURRENT_STATE.md`，当前均通过。
- 候选 CI 首次运行：run `33836782479` / SHA `01779b09b5e0c4ee90b39b33a88aa667d4b70a65`，SOP 影响声明版本未同步而失败，未推进 `main`；修复后待重新运行。
- 健康检查、真实工作流、当前对外版本：待部署后记录。

### 回滚

- 无数据库迁移；可重新发布上一个已验证提交。
- 实际回滚结果：未触发。

## REL-20261008-01：MES-lite v0.1.475（2026-10-08T14:42:59+08:00）

- 状态：本地完成，候选 CI、main 和生产核验待进行。
- 行为：客户纸单二维码绑定独立 PDF 归档；修改后新输出保留旧版；取消/冲销/归档实时停止扫码下载并显示中文说明。
- 本地证据：隔离 PDF 回归、扫码标签、TypeScript、定向 Lint、模块/架构、SOP、开发文档、发布说明及渲染/二维码解码均通过。
- 边界：无迁移或生产业务写入；原目录未提交变更未混入。生产只涉及 Con01，不访问 AL02。

### 2026-10-08T14:52:45+08:00 — 客户版本判定细化

用户确认按实际客户 PDF 内容判定是否生成新版：共用内容投影与渲染，展示内容变更另存版本；内部字段和单纯更新时间不影响客户版本。A → B → A 保留第三版。隔离回归、类型、Lint、架构/模块、SOP、文档和最终 PDF 渲染/二维码解码通过。首个候选 be1a196 的 CI 37739159059 因本轮需求细化已主动取消，未推进 main；修订候选待推送。
