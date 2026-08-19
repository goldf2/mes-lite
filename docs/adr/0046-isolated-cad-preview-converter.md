# ADR 0046：使用隔离转换服务提供 DWG/DXF 只读预览

## 状态

已采纳，2026-08-20。

## 背景

产品文档和业务附件允许上传任意常见文件，但 DWG/DXF 不能由浏览器、pdf.js 或 LibreOffice 稳定解析。把 CAD SDK 直接装进 MES-lite 主容器会把专有格式解析、许可、原生依赖和高资源转换带入 Web 请求进程，也会显著扩大安全与部署边界。

企业图纸可能包含商业秘密，不能默认上传到公网转换站。原始文件必须继续作为唯一事实源，派生预览只用于阅读和缩略展示。

## 决策

- DWG/DXF 继续使用现有 `DocumentAttachment`、对象权限和下载路由，不新增 CAD 专用数据库表或业务页面。
- MES-lite 通过稳定内部 HTTP 契约调用隔离转换服务：`GET /health`；`POST /v1/convert/pdf` 接收 `file` 与 `output=pdf`，返回 PDF。服务可使用 Bearer 令牌。
- 首次查看时按需转换，生成 `.preview-cad-v1.pdf` 并与原文件一起保存在附件持久卷；同一文件的并发请求合并，后续查看和缩略图复用缓存。
- 返回内容必须以 `%PDF-` 开头且不超过 100 MB；写入先进入随机临时文件，再原子重命名，转换失败不得留下半成品。
- 生产优先使用具备正式授权、可自托管的 ODA Drawings SDK 转换引擎。ODA 官方说明 Drawings SDK 支持 DWG/DXF，并可导出 PDF。Autodesk APS Model Derivative 可作为经审批的云端替代，但不作为企业内部图纸的默认数据路径。
- 未配置或服务离线时 readiness 只警告，不让 MES 主容器重启；查看器显示明确降级提示并保留下载原文件。

## 影响

- MES 页面、附件权限、全屏层级、PDF 渲染和缩略图不新增分叉，后续替换转换引擎不需要修改业务页面。
- 生产部署需要额外的 CAD 转换容器、厂商授权、字体/打印样式资源、资源限制和真实图纸验收；仓库不包含 ODA 二进制或许可文件。
- 第一阶段只提供 2D 只读 PDF，不提供图层开关、对象属性查询、测量、批注或 DWG 编辑。若这些需求成立，再单独评审 Web CAD 查看器，而不是扩张本次转换契约。
- 相关官方能力依据：[ODA Drawings SDK](https://www.opendesign.com/products/drawings)、[ODA DWG/DXF-PDF 示例](https://www.opendesign.com/oda_online_converter)、[Autodesk Model Derivative API](https://aps.autodesk.com/model-derivative-api-2d-3d-conversions)。
