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
- 第一阶段采用仓库内可构建的开源试用引擎：GNU LibreDWG 负责 DWG→DXF，ezdxf/PyMuPDF 负责 DXF→只读 PDF。DXF 直接进入渲染器，DWG 与 DXF 共用同一后半段和应用协议。
- 转换引擎固定在 `services/cad-preview/` 独立容器中，使用非 root 用户、受限上传尺寸和命令超时，只写自动清理的临时目录；容器构建必须同时完成 DXF 与 DWG 真实转换冒烟。
- LibreDWG 仍标记为 beta，ezdxf 也明确不覆盖全部 DXF 实体和像素级复现。因此该引擎只能在真实企业图纸验收通过后启用；失败图纸继续允许下载原文件或上传配套 PDF，不得把转换结果当作设计事实源。
- 若试用引擎对当前企业图纸的兼容率不足，可在保持内部 HTTP 契约不变的前提下替换为具备正式授权、可自托管的 ODA Drawings SDK。Autodesk APS Model Derivative 仅作为经审批的云端替代，不是企业内部图纸的默认数据路径。
- 未配置或服务离线时 readiness 只警告，不让 MES 主容器重启；查看器显示明确降级提示并保留下载原文件。

## 影响

- MES 页面、附件权限、全屏层级、PDF 渲染和缩略图不新增分叉，后续替换转换引擎不需要修改业务页面。
- 生产部署需要额外的 CAD 转换容器、字体资源、资源限制和真实图纸验收；仓库不包含 ODA 二进制或许可文件。
- LibreDWG 为 GPL-3.0-or-later，ezdxf 为 MIT，PyMuPDF 为 AGPL-3.0-or-later/商业双许可。转换服务源码、镜像交付和替换生命周期与 MES-lite Web 应用分离；对外分发镜像前必须复核并履行相应许可证义务。
- 第一阶段只提供 2D 只读 PDF，不提供图层开关、对象属性查询、测量、批注或 DWG 编辑。若这些需求成立，再单独评审 Web CAD 查看器，而不是扩张本次转换契约。
- 相关依据：[GNU LibreDWG](https://www.gnu.org/software/libredwg/)、[LibreDWG 命令行程序](https://www.gnu.org/software/libredwg/manual/html_node/Programs.html)、[ezdxf Drawing 插件](https://ezdxf.readthedocs.io/en/stable/addons/drawing.html)、[ODA Drawings SDK](https://www.opendesign.com/products/drawings)、[Autodesk Model Derivative API](https://aps.autodesk.com/model-derivative-api-2d-3d-conversions)。
