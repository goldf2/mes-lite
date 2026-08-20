# 待整理版本记录

本页保留尚未整理成独立发布说明的小版本变更。阶段收口时再按主题合并、校对并转入正式发布文档；在此之前不得删除未迁移的记录。

| 版本 | 日期 | 变更记录 | 验证证据 | 待整理文档 |
| --- | --- | --- | --- | --- |
| v0.1.418 | 2026-08-20 | CAD 转换器在图纸引用的 SHX 或大字体缺失时改用内置 Noto 中文字体，避免 DWG/DXF 中文显示为方框；CAD PDF 与缩略图缓存升级为 v2，使既有图纸在首次重开时自动生成修复后的预览 | `verify:cad-preview`、`verify:libredwg-cad-preview`、Python 编译检查；使用生产真实 `7122.dwg` 临时转换，中文标题栏、材料、倒角和公司名称均可见，原图仍需在新镜像部署后复验 | 后续正式发布说明集中整理 |
| v0.1.417 | 2026-08-20 | 来料单编辑保存发生网络响应中断时，停止展示浏览器原始 `Failed to fetch`；只读回查同一单据并逐项核对头部与明细，一致时按保存成功恢复，不一致时保留草稿并提示稍后重试，且不自动重发写请求 | `verify:receiving-module`（含响应丢失恢复、内容不一致和只读不重发断言）、TypeScript、定向 Lint；本地真实浏览器已验证正常保存停留编辑窗口，以及断网提示中文、草稿保留且不泄漏原始英文异常，生产环境待部署后复验 | 后续正式发布说明集中整理 |
| v0.1.413 | 2026-08-20 | 产品文档列表将重复的“在线阅读”改为“全屏预览”并与“详情”拆分；全屏预览优先打开在线正文，无正文时打开首个附件，并支持在正文和全部附件间连续切换 | `verify:document-server`、`verify:fullscreen-dialogs`、`verify:sop`、TypeScript、定向 Lint | 后续正式发布说明集中整理 |
| v0.1.412 | 2026-08-20 | DWG/DXF 接入统一附件查看器；首次打开经隔离内部 CAD 服务生成只读 PDF 和缩略图，原文件永久保留并缓存派生结果；未配置或离线时降级为下载且不影响主业务 readiness | `verify:cad-preview`、`verify:attachment-file-types`、`verify:attachment-management`、`verify:fullscreen-dialogs`、TypeScript、定向 Lint；内部协议使用模拟转换服务验证，真实 ODA 授权服务与真实图纸版式待部署后验收 | 后续正式发布说明集中整理 |
| v0.1.411 | 2026-08-19 | XLS/XLSX/ODS 默认通过自托管 Collabora（LibreOffice 核心）和只读 WOPI 直接浏览，保留原生工作表标签与滚动；会话使用摘要令牌、proof key 和实时业务权限校验，失败时可切换兼容 PDF 或下载原文件 | `verify:wopi-viewer`、`verify:wopi-http`、`verify:attachment-file-types`、`verify:attachment-management`、`verify:fullscreen-dialogs`、`verify:sop`、Prisma 全新库迁移、TypeScript、定向 Lint；本地浏览器已验证服务不可用降级和 24 工作表兼容 PDF，真实 Collabora 容器直览待隔离服务部署后验收 | 后续正式发布说明集中整理 |
| v0.1.410 | 2026-08-19 | 产品文档库及公共附件查看器支持按名称切换 XLS/XLSX/ODS 工作表；一个工作表跨多页时只渲染该工作表页范围，目录缺失时降级为逐页选择 | `verify:attachment-file-types`、`verify:attachment-management`、`verify:fullscreen-dialogs`、`verify:sop`、TypeScript、定向 Lint；真实 24 工作表/50 页与 39 工作表/39 页 XLSX 目录映射；桌面与 390px 手机浏览器交互实测 | 后续正式发布说明集中整理 |
| v0.1.408 | 2026-08-18 | 待收货来料单把“保存整单”与“关闭”分离；保存成功后留在当前编辑窗口并可继续修改其他明细，新建成功仍正常退出 | `verify:receiving-module`、TypeScript、定向 Lint、生产页面交互实测 | 后续发布说明与来料编辑 SOP 集中整理 |
| v0.1.407 | 2026-08-18 | 七类业务单据保存与 PDF 打印分离；企业与业务规则增加 A4 紧凑/标准密度及页边距设置，默认紧凑版支持 14 条来料明细单页，打印设置变化后按新格式保留归档版本 | `verify:business-document-print`、`verify:dispatch-module`、TypeScript、PDF 页数与渲染检查 | 后续发布说明与业务单据打印 SOP 集中整理 |
| v0.1.406 | 2026-08-18 | 来料单右侧已加入明细增加编辑操作，可回填数量、辅助实测、计价、批次和库位，保存时按原项替换并支持取消编辑 | `verify:receiving-module`、TypeScript、定向 Lint、生产页面交互实测 | 后续发布说明集中整理 |
| v0.1.405 | 2026-08-18 | 全局成功/错误提示横幅提升到顶层，保留默认磨砂背景；显示设置补充最上层说明 | `verify:page-modules`、TypeScript、定向 Lint；实测 `blur(4px)` 遮罩层 `200`、提示层 `400` | 后续发布说明与显示设置 SOP 集中整理 |
