# ADR 0045：使用 Collabora WOPI 只读直览电子表格

## 状态

已采纳，2026-08-19。

## 背景

产品文档库中的 XLS、XLSX 和 ODS 原先先由 LibreOffice 无界面进程转换为 PDF。该方案适合固定版式文件，但表格的打印区域、分页和缩放会影响预览结果：宽表可能被裁切，多工作表文件也失去原生工作表标签、冻结窗格和连续滚动体验。

企业内部附件不能上传到公网第三方预览服务。MES-lite 仍需保留原文件作为唯一事实源，并继续按当前账号、业务对象和数据范围校验访问。

## 决策

- XLS、XLSX 和 ODS 默认使用自托管 Collabora Online 浏览。Collabora 使用 LibreOffice 核心解析原文件，并通过原生工作表标签、滚动和缩放呈现，不先转换为 PDF。
- MES-lite 实现只读 WOPI Host：短期会话使用加密随机令牌，数据库只保存 SHA-256 摘要；每次 `CheckFileInfo` 和 `GetFile` 都重新校验令牌、有效账号、附件归属权限和数据范围。
- WOPI 回调必须验证 Collabora discovery 发布的当前或旧 proof key。浏览器 Cookie 不参与 WOPI 回调鉴权，WOPI URL 也不直接暴露原附件存储路径。
- 第一阶段只提供 `CheckFileInfo` 与 `GetFile`，明确声明只读，不实现 `PutFile`、锁、重命名、另存为或协同编辑。
- Collabora 独立部署在受控 HTTPS 域名；MES-lite 仅信任配置的 discovery 与公共 Origin。禁止使用公网演示站处理企业文件。
- 既有 LibreOffice→PDF 预览保留为用户主动选择的“兼容 PDF”降级路径，也继续用于缩略图。Word、PowerPoint 等非表格 Office 文件仍沿用 ADR 0023 的 PDF 预览。

## 影响

- 生产需要独立 Collabora 服务、反向代理 WebSocket、TLS 和受信任 WOPI Host 配置；应用 readiness 将未配置或不可用标为警告，而不触发 MES 容器重启循环。
- 新增 `WopiViewSession` 作为短期安全会话，不保存文档正文或业务事实；过期、撤销或权限失效后不可继续取文件。
- 表格首次打开不再等待 PDF 转换，并保留原生多工作表浏览；Collabora 不可用时用户仍可手动进入兼容 PDF 或下载原文件。
- 本 ADR 对 XLS、XLSX、ODS 的默认预览方式部分取代 ADR 0023；其他格式不变。
