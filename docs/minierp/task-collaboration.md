# MES 内部任务协同本地候选（2026-10-20）

基线：47581a7ddf188220ae0b728924b66f996843ec57，v0.1.493。后端候选为独立源码副本，未升级发布版本。Gemini 已交付界面候选，公共菜单与页面注册已在本地接入；用户随后明确授权 GPT 完成界面收尾。默认完整本地 UI 回归已有通过记录，具体证据与后续收尾复核见文末验收记录；未推送、未部署。

## 既有能力与必要扩展

- 生产订单 `/api/orders`、派工 `/api/dispatches` 和班后实绩仍归生产领域。本模块关联既有 Dispatch，不建立派工引擎。现有派工要求订单、工序、员工和正整数数量；供应商仅作为协同任务对象，不映射为生产员工或供应商登录。
- 生产实绩确认、冲销拥有库存和成本事务；协同读取订单 `completeQty/scrapQty/status` 与派工状态，不写生产累计量。`progress` 严格拒绝 `completedQuantity` 等未知字段。无生产关联任务可经显式命令维护协同状态。
- 任务 BOM 是执行清单，引用 `Material.id`，数量可为正有限小数，单位使用现有业务/库存/计价单位之一，不新增物料主数据，不改生产或包装 BOM。模板使用已授权任务的固定说明、BOM、文件引用复制，执行、发布、发放和进度历史不复制。
- 文件复用 `DocumentAttachment`、公共上传、查看和下载接口，owner 为 `TASK_COLLABORATION`。先创建任务后上传，无新增暂存文件体系。原来源文件的资源权限、归档有效性与范围在保存和发布时重新核对。

## 接口与状态

共享唯一契约位于交付目录 `shared/interface-contract.json`（v1.2），以其中字段为准。后端输入使用 Zod strict，错误响应 `{error,code,details?}`；未登录401、资源/范围拒绝403、无效文件404、数量/引用/状态400、版本/幂等冲突409。

API 根路径 `/api/task-collaboration`：列表/创建、`/:id` 查询/修改、`/options` 引用选择；任务命令为 `/:id/assign`、`progress`、`release-preview`、`releases`、`archive`、`restore`；发布包命令为 `/:id/releases/:releaseId/manifest` 和 `deliveries`。options 逐类要求原资料 read；文件 options 另走通用附件 owner 鉴权。

草稿 `DRAFT → ASSIGNED`，关联现有派工时员工/中心/订单必须一致，空值可从派工补齐。无 MES 执行关联时允许 `ASSIGNED → IN_PROGRESS → COMPLETED`，或从前两态转 `CANCELLED`；终态不能重开。生产关联任务的执行状态仅从 MES 投影，协同备注不能代替报工。内容编辑仅允许 DRAFT/ASSIGNED/IN_PROGRESS。修改、派工、协同状态和归档/恢复使用 `expectedRevision`，成功递增 revision；纯备注不修改发布内容版本。

## 发布与发放

1. 使用 `expectedRevision` 和收件对象预览。员工/供应商 ID 必须匹配任务，名称从权威资料冻结；内部收件说明可手填。
2. 预览检查原文件权限、存在性和字节长度，计算文件 SHA-256，冻结文件原名/MIME/rotation/来源文档版本/更新时间/业务版本标签/BOM行归属。
3. 返回 `previewToken`，绑定任务内容、收件对象和来源文件内容/元数据。提交发布必须原样带回 token；来源变化须重新预览。
4. 发布使用通用附件存储复制原字节，复制后的 ID 与完整清单在同一个数据库事务创建，失败清理准备的文件。副本为 `SYSTEM_GENERATED_TASK_RELEASE`，普通上传、修改、归档拒绝。预览不会创建副本。
5. `operationId` 唯一；相同请求可安全重试；任务版本 `taskId+revision` 唯一，换操作ID重复发布返回409。清单与附件副本不随源文件更新、归档或任务后续修改改变。发布包只保存MES来源ID，实时执行数量/状态仅在当前任务execution中按生产范围读取，不把累计量冻结为跨范围发放资料。发布/进度/发放记录有数据库不可改删触发器，副本内容身份字段也受触发器保护。
6. 导出为受任务权限与范围保护的 JSON 清单，文件通过既有受鉴权下载/预览端点按冻结 ID 读取。手工记录 MANUAL/EXPORT/EMAIL/WECHAT 及 RECORDED/EXPORTED/FAILED；EMAIL/WECHAT 仅表示人工证据，不执行发送。发放对象固定为发布收件对象，单独 operationId 幂等。

任务、派工、进度、发布、发放、归档和恢复的写入与 `createAuditLog` 同事务。附件上传继续沿用既有附件审计。

## 权限、范围、归档

资源 `taskCollaboration` 控制 read/create/update/delete，`taskCollaborationPublish.update` 控制预览、发布和发放记录。所有任务路由额外要求任务 read。非管理员默认关闭且无旧资源隐式继承；沿用 ADMIN 规则。本地验证通过合成账号赋权，不触碰真实用户。

范围沿用 productionMode：ALL 全部，SELF 仅负责人为绑定员工的任务，WORK_CENTERS 仅授权工作中心。读、写、options、发布和文件入口都服务端检查；生产引用还复核生产/派工范围。附件继续要求既有 `attachments` 资源与 owner 资源。来源归档不能进入新发布，发布副本仍可按任务读取；任务归档后文件不可读，恢复后重新可读。

归档仅设置 deletedAt/deletedBy、保留状态和历史；列表 `archived=1` 可查归档，详情允许授权历史读取，恢复通过自有命令。未扩展通用永久删除能力。

## 迁移候选与本地验证

`prisma/migrations/20261020093000_task_collaboration/migration.sql` 仅新增五个任务表、外键、索引和不可变保护触发器，不回填/改写现有业务记录、不赋权。测试在完整既有迁移后部署该迁移的临时 SQLite 中运行。

直接回归入口：`scripts/verify-task-collaboration-http.ts`、`modules/attachments/__tests__/task-release-files.ts`，以及既有 dispatch、production-order-actuals、production-order-execution、data-scopes、fine-grained-permissions 和附件回归。具体运行结果见交付 `backend-report.txt`。不执行本机完整生产 build。

## Gemini 交付接入

页面已注册为 `taskCollaboration`，入口 `modules/task-collaboration` 的 `TaskCollaborationPage`，props 见共享契约。HTTP 仅在领域 client 发起；页面复用资源工作区、工具栏、表格/卡片、ModalDialog、关联编辑、AttachmentPanel 和 DocumentFileViewer。任务详情需要并列呈现协同状态与 MES 执行来源、发布前资料版本和收件对象。

GPT 已统一注册 page-registry、workspaceFunctionKeys、MES 默认导航、production 模块目录与 WorkspacePageRendererRegistry。Gemini 交付后，用户明确授权 GPT 完成当前任务界面收尾；此授权仅适用于本任务，不改全局默认分工。1440与390视口完整用户流程及默认独立场景已有本地真实 API 整轮通过记录；后续收尾后的最终状态以交付报告为准。

页面入口只要求 `taskCollaboration.canRead`，发布命令单独检查 `taskCollaborationPublish.canUpdate`。权限使用现有 MES 的 `can*` 结构，缺少资源或动作默认拒绝。任务附件读取需任务 read 与附件 read；上传需任务 update 与附件 create；已有附件更新需任务 update 与附件 read；归档需任务 update 与附件 delete。公共附件控件接收各动作权限，已归档任务不挂载其附件列表；文件来源的 owner 与数据范围仍由服务端校验。

界面客户端回归使用真实临时 SQLite 服务 DTO 验证归一、不可用文件、冻结副本 ID、模板与本地交期往返；公共附件控件以实际组件 SSR 验证默认兼容和单动作/只读组合，已加载附件动作由真实浏览器合成账号验证。回归脚本为 `scripts/verify-task-collaboration-client.ts`、`scripts/verify-task-collaboration-ui.ts`；UI脚本直接导入随源码交付的 `scripts/task-collaboration-ui-fixture.ts`，不依赖被清单排除的work夹具。该夹具仅建立合成临时数据库与回环服务，拒读真实dotenv，并在SIGTERM关闭或超时SIGKILL后有界等待进程退出，再清理临时数据。


## v0.1.496 发布准备的界面分层

在v495主线基础上集成任务候选，保留原首页与其界面改版。为遵守新增界面文件预算，`TaskCollaborationPagePanels.tsx` 统一纯列表/筛选/分页、选中详情和无权限反馈装配；`TaskCollaborationPage` 继续拥有任务状态、请求、发布/导出操作ID以及归档竞态保护。`TaskBomDocumentReferences.tsx` 只呈现BOM行图纸列表、版本与追加选择器，`TaskDraftDialog` 仍拥有草稿会话、引用增删和提交整形。提取保持原DOM结构、样式、文案、回调与权限，不改变API或业务规则。

原493候选为628个模块TS/TSX文件，新增上述两个领域内组件后当前为630。历史候选证据及版本保留；发布worktree的最终验证、精确CI和部署状态另按实际结果登记，不用组件拆分本身宣称验收通过。

## 文件引用展示元数据接线（契约 v1.2）

任务、BOM与进度引用的读取响应在当前操作账号下逐来源检查附件资源权限、owner有效性与数据范围，并缓存同ID结果。允许访问时追加真实文件名、MIME、旋转及公共file/preview/thumbnail URL；拒绝/失效只保留ID和业务版本标签，返回fileUnavailable。原始storagePath不对外暴露。写入和发布快照仍仅存ID/versionLabel，展示URL或派生预览修订不参与发布token；源文档版本或文件字节改变仍使预览失效。


## 默认完整本地 UI 验收记录（2026-10-20）

用户在 Gemini 交付后明确授权 GPT 完成本任务界面及剩余收尾。使用默认命令 `./node_modules/.bin/tsx scripts/verify-task-collaboration-ui.ts`，1440px与390px完整闭环及默认6组独立场景已取得一次整轮通过：`work/task-ui-evidence/2026-10-20T07-03-34-260Z-3868ba/result.json` 的 `status=passed`、`localOnly=true`，10项场景结果，`pageErrors=[]`、`consoleErrors=[]`。归档期间文件访问拒绝、恢复后的冻结TXT预览/真实UI下载/哈希、旧版本冲突、只读和权限/数据范围拒绝、表单隔离、分页与远程候选等均在该默认整轮内执行。

该记录仅证明所对应本地候选运行；界面可见文案和测试夹具交付等后续必要收尾后的最终证据、静态复核与整体状态由交付报告登记。测试仅使用临时SQLite、合成账号文件与回环服务，未推送、未部署、未操作真实账号或生产数据。源码与锁文件版本保留本地 `0.1.493`，契约为v1.2。候选无.git导致architecture-baseline未完成、旧HomeApp导航字面量断言的基线失败仍保留，不以本地默认整轮通过伪称所有全仓/生产门禁完成。
