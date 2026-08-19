# 待整理版本记录

本页保留尚未整理成独立发布说明的小版本变更。阶段收口时再按主题合并、校对并转入正式发布文档；在此之前不得删除未迁移的记录。

| 版本 | 日期 | 变更记录 | 验证证据 | 待整理文档 |
| --- | --- | --- | --- | --- |
| v0.1.411 | 2026-08-19 | XLS/XLSX/ODS 默认通过自托管 Collabora（LibreOffice 核心）和只读 WOPI 直接浏览，保留原生工作表标签与滚动；会话使用摘要令牌、proof key 和实时业务权限校验，失败时可切换兼容 PDF 或下载原文件 | `verify:wopi-viewer`、`verify:wopi-http`、`verify:attachment-file-types`、`verify:attachment-management`、`verify:fullscreen-dialogs`、`verify:sop`、Prisma 全新库迁移、TypeScript、定向 Lint；本地浏览器已验证服务不可用降级和 24 工作表兼容 PDF，真实 Collabora 容器直览待隔离服务部署后验收 | 后续正式发布说明集中整理 |
| v0.1.410 | 2026-08-19 | 产品文档库及公共附件查看器支持按名称切换 XLS/XLSX/ODS 工作表；一个工作表跨多页时只渲染该工作表页范围，目录缺失时降级为逐页选择 | `verify:attachment-file-types`、`verify:attachment-management`、`verify:fullscreen-dialogs`、`verify:sop`、TypeScript、定向 Lint；真实 24 工作表/50 页与 39 工作表/39 页 XLSX 目录映射；桌面与 390px 手机浏览器交互实测 | 后续正式发布说明集中整理 |
| v0.1.408 | 2026-08-18 | 待收货来料单把“保存整单”与“关闭”分离；保存成功后留在当前编辑窗口并可继续修改其他明细，新建成功仍正常退出 | `verify:receiving-module`、TypeScript、定向 Lint、生产页面交互实测 | 后续发布说明与来料编辑 SOP 集中整理 |
| v0.1.407 | 2026-08-18 | 七类业务单据保存与 PDF 打印分离；企业与业务规则增加 A4 紧凑/标准密度及页边距设置，默认紧凑版支持 14 条来料明细单页，打印设置变化后按新格式保留归档版本 | `verify:business-document-print`、`verify:dispatch-module`、TypeScript、PDF 页数与渲染检查 | 后续发布说明与业务单据打印 SOP 集中整理 |
| v0.1.406 | 2026-08-18 | 来料单右侧已加入明细增加编辑操作，可回填数量、辅助实测、计价、批次和库位，保存时按原项替换并支持取消编辑 | `verify:receiving-module`、TypeScript、定向 Lint、生产页面交互实测 | 后续发布说明集中整理 |
| v0.1.405 | 2026-08-18 | 全局成功/错误提示横幅提升到顶层，保留默认磨砂背景；显示设置补充最上层说明 | `verify:page-modules`、TypeScript、定向 Lint；实测 `blur(4px)` 遮罩层 `200`、提示层 `400` | 后续发布说明与显示设置 SOP 集中整理 |
