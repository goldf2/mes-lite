# 当前状态

## 2026-10-18 统一退出修复 v0.1.482（实现中）

- 用户报本站退出后统一身份仍有效。独立 `mes-casdoor-logout-20261018` 基于精确 main481/fa5b86c；客户主档整合在另一隔离分支483继续，不合并此修复。
- 本地撤销后即时清身份；正常验签回调保存绑定本会话/代际的 AES-GCM HttpOnly 分片退出 hint，固定两分钟 handoff 以首方表单 POST 身份中心，精确 state 回调返回已退出状态，无自动登录。缺 hint 兼容使用公共 helper，不能确认时明确提示；不依赖提供方未实现的 prompt/max_age。
- 复用原 AuthFrame/AppButton、身份/挑战/代际服务；无数据库、依赖、业务资料、人员或岗位变更。协议 v2 指纹使旧普通 Casdoor 会话重新登录；builtin/恢复不变。根任务后续须登记专用客户端精确退出 callback，候选未改提供方。
- 真实 Node20.19.4 本地回归通过：45项真实RSA协议/会话检查（含19项实际Next HTTP）、加密/客户端41项、UI16组、TypeScript、定向Lint、原身份认证服务、身份/模块/架构边界、Docker依赖、发布记录、开发文档与差异格式。精确CI、提供方回调登记、部署和真实跨站浏览器仍未验收。
- 设计与回退：[统一登录与退出](../architecture/casdoor-login.md)、[482版本](../releases/v0.1.482.md)。唯一下一步：完成定向验证和独立审阅，再推候选CI，精确成功后再 main/Con01。


## 2026-10-17 MES统一登录 v0.1.480（候选实现，生产未启用）

- 独立Worktree `Worktrees/mes-casdoor-login-20261017` / `ci/0.1.480`，基于已推API479 `9e9cc5cf4ab5e89c1cf83d4a2a1966305ee29d1e`；原dirty目录保持。
- 固定公共web-auth0.3.5（源0655dd907d12446dd671fedd82bede358fa021f7），仅复用正式子路径，不改Node20/React18。显式Runtime Casdoor，正常签名OIDC与精确issuer/subject绑定原ACTIVE人员；无自动建人/合并/授权。只读登录设置和明确已有ADMIN密码恢复；旧普通native会话不能绕过Casdoor。
- 99号追加迁移保存单次挑战和原会话来源/绑定/随机代际；模式/客户端/组织/secret旋转、撤销绑定、停用、恢复角色撤销及退出按实时策略拒绝旧会话。原native默认兼容，业务岗位与dataScope保持。
- 本机37协议/会话检查（含12实际Next HTTP）和14UI/client、原身份服务、0深导入/49edge架构与Docker清单通过；实际1440/390px隔离浏览器入口、缺配置阻断、原ADMIN恢复/只读诊断/账号菜单/退出通过。未运行本机完整生产构建。Docker daemon未运行；CI增加真实dependencies层门禁，不能冒充完整镜像。
- 未创建生产客户端/人员绑定/权限，不改AL03源、Con01备用停止和业务资料。生产启用前须精确确认客户端及issuer/sub→Operator，完成同SHA CI、镜像与普通真实登录验收。
- [完整设计](../architecture/casdoor-login.md)、[版本](../releases/v0.1.480.md)。唯一下一步：完成独立review/隔离浏览器后冻结候选，推ci/0.1.480核对精确SHA CI；禁止自动main或生产mode。


## 2026-10-17 企业业务平台只读目录 v0.1.479（本地通过，候选待CI）

- 用户确认 MES Lite、数据平台、客户/联系人进入统一企业业务平台，模块独立通过 API 互通，地图是显示视图，企业地图保留独立发布。此切片只处理 MES 只读目录和管理员接入诊断，不合并数据库，不改变本地登录，也不宣称 Casdoor 统一登录已完成。
- 独立干净 Worktree `Worktrees/mes-business-platform-20261017` / `ci/0.1.479`，精确基于远端 main `6a771405d7b4f21f664c9933cb4d18e3a1f30df5` / v0.1.478。原主目录及 customer-continuous-paper 的所有既有未提交内容保持。
- 三个 GET `/api/integrations/business-directory/v1/{enterprises,contacts,locations}` 使用 business-directory.v1、严格白名单、固定 sourceRef、稳定派生联系人/地址 ID 和分页；联系人/地点含所属企业名称，没有源修订/修改时间/坐标时如实返回 null。所有 MES 数据均为只读投影，不自动匹配或同步写入。
- 服务默认关闭，仅接受 SHA-256 摘要凭据并要求明确有效期；每请求检查已有显式人员 ACTIVE 与精确 customers.read，原本地 Cookie 不能替代凭据、不创建会话或权限。仅增加向后兼容的 initializeDefaults:false 读取路径，原权限调用默认行为保持。
- API 接入页复用现有设置页壳；导航与真实 HTTP 接口都仅 ADMIN 可见/可读，不返回摘要或密钥。无 Prisma 模型/迁移/生产业务更改。
- 本地通过：隔离98迁移SQLite目录回归（完整逻辑数据库读取前后摘要一致）、实际Next临时库正常账号登录后的诊断200/普通人员403/委托撤权403、旧权限/身份服务、TypeScript、定向Lint、页面/设置/模块/文档/SOP/发布与Docker依赖门禁。架构必要公开依赖仅增加两条，根任务批准预算47→49，其余阈值不变。
- 当前正式MES地址为 https://mes.csyufeng.com（根任务Con01控制台只读核对）。此工作未访问AL02、未改变生产、未推main或部署；原自动部署源main保持。
- 详见 [目录契约与接入说明](../architecture/business-directory-api.md)、[v0.1.479](../releases/v0.1.479.md)。唯一下一步：推送候选并核对精确SHA的MES-lite CI；身份统一另从已推SHA的独立后续Worktree处理，禁止制造临时Operator会话冒充OIDC。


## 最新恢复摘要：2026-10-16 客户发货单版式修复 v0.1.477（发布及生产只读验收完成）

- 发布进度：`v0.1.477 / 5ba3c60629267aa07e5d9b45e9e3179debcbe333` 的候选 MES-lite CI `38852986428` completed/success；同一 SHA 于 2026-10-16 13:08 +08:00 推进 `main`。Con01 Web 队列 `okpotsvf2byq7osnxg10k4gg` 于 13:14:46.856 +08:00 rolling completed、13:14:47 +08:00 finished；Web 版式已部署并由根代理独立完成生产只读核验，当前 Web 为 477，旧 476 已移除。main CI `38854196221` completed/success，与候选 CI `38852986428` 均精确匹配 `5ba3c60629267aa07e5d9b45e9e3179debcbe333`，两个完整 CI 已通过。CAD 自动队列 `tx6gb1aorv30atkn1is3xqfi` 于 13:22:24 +08:00 finished；根代理独立确认 Web/CAD 两队列均 finished、同精确 SHA 且无 error。CAD 唯一新容器 `df0c26ebc8c9 / ruzskr3355n5mq9ouv3kiy9t-050811424859` healthy，image 为 `ruzskr3355n5mq9ouv3kiy9t:5ba3c60629267aa07e5d9b45e9e3179debcbe333`，旧 CAD 已移除（子代理确认），CAD smoke test 通过。根代理最终复查公网 readiness 为 200/ready，CAD 和迁移 pass，仅保留既有 Collabora warn；477 发布及生产只读验收全部完成。
- 运行容器与持久化：唯一 Web 容器 `036f02dce06d7b91efb8b85752f7d924a84165adc74bf094a673d83900f5d6c5 / jhjbwdumt46lsy4x2zj03llo-050809327290` healthy，package `0.1.477`、`SOURCE_COMMIT` 与 image 精确匹配 `5ba3c60629267aa07e5d9b45e9e3179debcbe333`。原三条 RW 持久挂载未变，启动备份 true。
- 备份与公网验收：新备份归档 hash、sidecar、manifest 每文件和两层 quickCheck 全部通过；完整文件名、大小及 SHA-256 见 REL-20261016-02。13:15:15 +08:00 根代理独立核对公网首页、health、readiness 均为 200，11 个首页 JS 均 200，`app/page-129079e0e8ca7502.js` 包含版本 `0.1.477`；CAD readiness pass，仅保留既有 Collabora 未配置 warn。未生成真实业务 PDF、未进行业务测试写入，未访问 AL02；实际纸张走纸、复写和定位仍待用户试打。
- 客户连续纸和 A4 发货单将收发货资料放在明细前；顶部收货方在左、供货方在右，联系人、电话和地址各归本栏，单号、日期独立横排。收货联系人取 `customerRef.contact`、缺失显示 `-`；长地址完整流式分页。合计仍紧接最后一条明细；页脚按“备注 → 客户凭证号/物流单号 → 包裹 → 签收”排列，备注位于页脚第一行并支持完整多行换行。短页脚整体锚定末页底部，长备注向上扩展，超长内容完整续页，末页签字位置固定；预留页脚空间，绝不覆盖明细或合计。customer profile 升为 v4，避免旧版式缓存，旧归档及二维码原文件不变。
- 本地验证：`verify:business-document-print`（双纸型左右分栏及两侧分别 240 段地址跨页、左右坐标同 y、单页/32 行多页、超高行、合计位置、联系人内容变更、v3/v4 历史字节，以及页脚底部锚定、备注首行与超长分页、不覆盖明细合计）、`tsc --noEmit --incremental false`、4 文件定向 Lint、`verify:module-boundaries`、`verify:sop`、`verify:development-docs`、`verify:release-notes` 和 `git diff --check` 均通过。180 段备注连续纸为 4 页、A4 为 2 页，续页标明“备注（续）”，全文完整，末页凭证/包裹/签字 y 坐标与普通单页一致；根代理已人工检查最终单页、32 行多页末页及 180 段备注连续纸 4 页/A4 2 页全部页面，无截断、裁切或重叠。
- 同步产品打印规则、模块边界、系统建模审查、交互/桌面规范、系统流程、功能模型、PENDING、四份交接记录、SOP 27/28/29 及 v0.1.477 Markdown；无数据库迁移、权限或库存规则变化。476 发布后记录当时先留本地，本次 477 修复一并归档。
- 下一步：仅待用户按匹配纸型、100% 实际大小试打连续纸和 A4，核对针式连续走纸、各联复写、分页与定位；477 无剩余候选/部署待办，原有产品事项继续按既有优先级处理。不得访问 AL02。

- 记录边界：本次 477 发布后记录只留本地，不另行提交或推送，以免触发新部署或改变已部署 SHA；476 历史生产验收保留。

## 历史恢复摘要：2026-10-16 客户发货单双纸型 v0.1.476（已部署）

- 当前发布版本为 `v0.1.476`，精确 SHA `81b22102188640903a069ce4598fbb238935c9a0`；用户已授权上线，同一 SHA 于 10:37 +08:00 推进 `main`。候选 MES-lite CI `38837203048` success，main CI `38841347727` completed/success（精确同 SHA；GitHub 更新时间2026-10-16 10:53:05 +08:00，verify 15m53s）。
- Con01 首次 Web `ryxqldab81le6ar7at0livtz` 与 CAD `as4v4rsba3iqhup61ztlmtfj` 于 10:45:11 +08:00 共同 exit 255，精确根因未证实；失败与旧服务保护事实完整保留于 REL-20261016-01。核对队列/helpers 清空后，仅串行重试 Web `e12qu6kigts324veh7ei58vq`，11:00:45 +08:00 finished。
- 最终唯一 Web 容器 `ff981079fe22 / jhjbwdumt46lsy4x2zj03llo-025011444575` healthy，image / `SOURCE_COMMIT` 精确匹配 `81b22102188640903a069ce4598fbb238935c9a0`，package `0.1.476`；旧 Web 容器已移除，根代理独立 SSH 复核通过。CAD 本轮源码未变，不另重试，保留原 `480be…` healthy 版本，最终 CAD readiness pass。
- 当前正确位置为 `RootTeam / 03网站与在线工具 / production / MES Lite · Web`，项目 `m11yfeih6uwg32b7w2jl6qjc`、环境 `o31ffsi3n0f3ijpruc6cli7o`、应用 `jhjbwdumt46lsy4x2zj03llo`；[当前 Web 资源](https://cool-con01.xiangshu.me/project/m11yfeih6uwg32b7w2jl6qjc/environment/o31ffsi3n0f3ijpruc6cli7o/application/jhjbwdumt46lsy4x2zj03llo)。用户澄清仅变更 projects 分组，仍使用 Con01 与原持久目录。
- 生产核查：原三条 `/opt/mes-lite/{data,uploads,backups}` 到 `/app/data`、`/app/public/uploads`、`/app/backups` 的 RW 挂载未变，启动备份 true，98 条迁移通过。新备份 `mes-lite-backup-2026-10-16T02-58-19-687Z-3d66702d.tar.gz` 的归档 hash、全部 698 个 tar 文件与 manifest/hash 均匹配，quickCheck ok，250 条附件/697 个上传文件；完整大小及 SHA-256 见发布记录。
- 11:01:51 +08:00 公网 readiness 200，数据库/迁移/持久目录/备份/CAD pass，仅原 Collabora 未配置 warn。11 个首页引用 JS 均 200，页面 JS 版本为 `0.1.476`；切换窗口的暂时 chunk 404 已随旧容器清理消失。使用既有认证会话刷新发货页后已显示版本 476、两种客户链接及内部留档；未生成真实 PDF 或创建业务测试数据。
- 客户 PDF 分连续纸 241 × 140 mm / A4 210 × 297 mm 两版，共用 190 mm 正文，分别归档和二维码下载；网页可新页预览原 PDF 并直接浏览器打印，按匹配纸型 100% 实际大小输出。首页完整抬头/二维码、续页简头、末页合计签收和整段说明；内部/其他通用 A4 模板及其设置保持。
- 下一步仅剩本次真实纸张试打：按匹配纸型 100% 输出，核对针式走纸、各联复写与 A4 定位；原有事项继续按既有优先级处理。476 发布后记录当时先留本地，本次 477 修复一并归档；本次上线核验仅访问 Con01，未访问 AL02。

以下保留各日期当时的历史快照；旧条目中的“当前”“待 CI”“唯一下一步”不代表本轮发布状态，以本节为准。

## 历史恢复摘要：2026-10-08 客户发货单扫码电子档 v0.1.475

- 需求已确认：客户 PDF 二维码下载该纸单对应的归档原文件；后补价格或备注再输出会另存新版并分配另一二维码，不覆盖旧 PDF。首次认证点击时生成，与最新归档的实际客户展示内容相同则复用，否则另存版本；内部成本、库位或单纯更新时间变化不生成客户新版。
- 已实现：随机 UUID v4 客户归档下载地址、说明文案、每次请求检查当前取消/冲销/归档状态并返回中文失效页面。内部 PDF 和业务标签扫码维持原认证。无数据库迁移、库存或生产数据修改。
- 本地验证：隔离业务 PDF 回归含未填价格后补价的原版字节一致、公开入口权限边界与 410/404；TypeScript、定向 Lint、扫码标签、模块/架构、SOP、开发文档与版本门禁通过；PDF 渲染及系统 Vision 二维码解码通过。
- 工作目录：本轮使用独立 `ci/0.1.475` Worktree，基于远端 main `480be814453ba677ea4749306d9590ccfe0f8b7d`。原工作目录的未提交文档、素材、删除文件未纳入本轮。
- 唯一下一步：推送候选并核对精确 SHA 的 MES-lite CI，成功后推进 main；生产实际部署/验证另行记录，不访问 AL02。

## 历史恢复摘要：2026-09-29 09:30 CST

- 当前工作版本 v0.1.470：来料历史按北京时间起止日核查，跨页状态/单位统计与归档只读；发货和退货归物流，销售仅订单；发货详情支持后补/修改价格，独立于库存并原子记录审计。
- 来料、销售订单/发货、销售模块、页面模块、模块边界、TypeScript、SOP 与发布说明定向验证通过。新增内容见 `docs/releases/v0.1.470.md`。
- 远端 main 实查仍是 8a7226c（v0.1.468）；前序候选 952c2a5（v0.1.469）CI 34172777141 成功，但尚未并入 main。v0.1.470 包含它的生产成本变更和迁移。
- 生产部署未核验。下一步：完成本版发布门禁，候选精确 SHA 通过后才允许推进 main；仅 Con01，不访问 AL02。
- 本地原有 README、历史发布/交接文档、白板删除及未跟踪素材不属于本次提交。


最后更新：2026-09-06  CST

## 项目阶段

当前持续目标进入“生产执行冻结工艺与成本依据、显式选择成本运行、并收紧生产滚动更新门禁”阶段。v0.1.466 已完成候选、main 和 Con01 验收；本地正在收口 v0.1.467，目标是让生产日报也能明确选择并冻结成本运行，同时修复 BOM 成本对象误匹配和物料全景旧成本运行兼容。v0.1.467 尚未形成候选 SHA 或 Con01 部署证据，不能提前写成已发布。

## 当前改动与验证

- `BomCostRun` 新增工艺路线完整快照；成本运行明细按工序、工作中心和成本分类保存。
- 新建 `ProductionOrder` 时按目标物料、明确 BOM 和默认路线冻结 BOM、路线、工序、工作中心与匹配成本运行；订单详情优先读取快照。
- `ProductionOrderActual` 和 `DailyProductionReport` 复制订单/成本快照，生产执行不再依赖后续可变路线解释历史。
- 物料全景按 `bomId` 映射最新成本运行，展示对应路线和工序明细；锯切成本对象覆盖同名工序时不重复计费。
- 纯成本规则与路线快照序列化器已下沉到 `lib`，模块边界与架构基线不再存在本轮新增的深层跨模块导入。
- 工作中心新增人工、机时、能源默认费率；工序成本按“工序正值 > 工作中心默认 > 页面费率”回退，并在新成本运行/生产执行快照中保存实际采用费率。
- 已通过 Prisma Client 生成、TypeScript、生产构建、BOM 成本/路线联动、订单快照、实绩继承、快捷日报快照、物料全景、模块边界、架构基线和 50 项 CI 领域基线；另补回归证明冻结路线即使没有工作中心也不会回退当前路线，历史成本对象名称相似但不相等时不会误跳过工序。
- Con01 当前运行 `d8305d0d8c8b1a51176afcf8b214c235bd1d4a86` 的最终容器 `jhjbwdumt46lsy4x2zj03llo-2974e1beb147`，healthy；`/api/health` 与 `/api/health/ready` 返回 200，迁移为 96，三条持久卷保持 `/opt/mes-lite/{data,uploads,backups}` 映射，旧容器已退出。
- Coolify 部署队列 `bnqbb12qoyhvvtkm8xbcaqjx` 已完成并加载 `MES_LITE_PRE_MIGRATION_BACKUP_ENABLED=true`；启动窗口为 120 秒，最终备份 `mes-lite-backup-2026-09-06T00-04-48-240Z-7ee4b427.tar.gz` 已生成并通过 SHA-256 校验（`5a9e5ca4ac1486566ba7860499e54e8e9f47dfe8482d32e0e627f8eaab25f405`），包含 219 条附件记录和 664 个文件。
- v0.1.463 将 Docker readiness 健康检查启动窗口从 15 秒延长至 120 秒，并以运维基线锁定，避免备份快照和 Prisma 启动耗时触发误回滚。

## 待验证与边界

- v0.1.466 候选 CI `33999128022`、main CI `33999726162` 和 Con01 队列 `bnqbb12qoyhvvtkm8xbcaqjx` 已完成；显式成本运行改动已进入生产并完成只读验收。
- v0.1.467 本地已完成生产订单/日报显式成本运行、BOM 成本精确匹配、复合锯切防重复覆盖和物料全景历史成本唯一归属兼容；显式成本运行缺少工艺路线快照时拒绝用于新生产，避免历史成本与当前路线混合。候选 CI、main 推进和 Con01 部署待本轮发布门禁完成。
- 新增快照字段均可空，旧记录读取时兼容当前默认路线；这只是历史兼容，不代表旧记录已经补齐冻结成本。
- 工作中心费率迁移以 0 初始化历史工作中心；0 表示未配置，当前不能表达“显式覆盖为零”的特殊费率。
- 能源费率统一按台·小时计；生产订单/日报仍在多条有效工艺路线时自动取默认路线，尚未提供执行时显式路线选择器。
- 旧成本运行若没有 `bomId`，物料全景仅在产品/BOM 可唯一确定时以“历史成本（唯一匹配）”展示；多 BOM、版本不一致或物料不一致的记录保留待归属提示，不自动改写。
- 成本运行在未显式指定时仍取默认已发布 BOM/路线，但只接受带冻结工艺快照的路线成本运行；显式运行缺少快照时要求重新计算。v0.1.466 已在生产提供显式选择，v0.1.467 扩展到日报并收紧安全边界。
- v0.1.465 的 Con01 滚动更新、备份开关和健康窗口已经完成并核对；后续版本仍须先确认新鲜备份、健康窗口和真实页面，未访问 AL02。
- 保留 README、旧 Excalidraw 删除、`.gitfinder`、AI 图标、库存数字孪生文档和 `tmp` 等无关本地修改，不得混入本次提交。

## 唯一下一步

完成 v0.1.467 候选 CI、main 和 Con01 实际部署验收；随后继续多路线生产执行与实际工序成本完善。
