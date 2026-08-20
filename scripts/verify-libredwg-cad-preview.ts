import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const server = readFileSync('services/cad-preview/server.py', 'utf8')
const dockerfile = readFileSync('services/cad-preview/Dockerfile', 'utf8')
const smokeTest = readFileSync('services/cad-preview/smoke_test.py', 'utf8')
const requirements = readFileSync('services/cad-preview/requirements.txt', 'utf8')
const readme = readFileSync('services/cad-preview/README.md', 'utf8')
const adr = readFileSync('docs/adr/0046-isolated-cad-preview-converter.md', 'utf8')
const deployment = readFileSync('docs/deployment/coolify.md', 'utf8')

assert.match(server, /self\.path != "\/health"/, '服务必须实现健康检查')
assert.match(server, /self\.path != "\/v1\/convert\/pdf"/, '服务必须实现既有 PDF 转换契约')
assert.match(server, /hmac\.compare_digest/, 'Bearer 令牌必须使用恒定时间比较')
assert.match(server, /MAX_UPLOAD_BYTES/, '上传必须有尺寸上限')
assert.match(server, /TemporaryDirectory/, '转换必须使用自动清理的隔离临时目录')
assert.match(server, /startswith\(b"%PDF-"\)/, '服务必须校验 PDF 响应签名')
assert.match(server, /extension not in \{"\.dwg", "\.dxf"\}/, '服务只能接受 DWG/DXF')
assert.match(server, /command = \["dwg2dxf"\]/, 'DWG 必须先经 LibreDWG 转为 DXF')
assert.match(server, /for minimal in \(False, True\)/, '完整 DXF 无法解析时必须降级到 LibreDWG 最小模式')
assert.match(server, /apply_cad_font_fallbacks\(document\)/, 'DXF 渲染前必须应用 CAD 字体回退')
assert.match(server, /NotoSansCJKsc-Regular\.otf/, '缺失 SHX 与大字体必须回退到内置中文字体')

assert.match(dockerfile, /ARG LIBREDWG_VERSION=0\.14/, 'LibreDWG 必须固定到已审查版本')
assert.match(dockerfile, /ARG LIBREDWG_SHA256=[0-9a-f]{64}/, 'LibreDWG 源码必须校验 SHA-256')
assert.match(dockerfile, /--max-time 600/, '源码下载必须有有限超时')
assert.match(dockerfile, /--disable-bindings/, 'LibreDWG 编译阶段不得引入未使用的语言绑定')
assert.match(dockerfile, /--disable-python/, 'LibreDWG 编译阶段不得引入未使用的 Python 绑定')
assert.match(dockerfile, /--disable-json/, 'CAD 预览服务不得编译未使用且耗时的 JSON 转换模块')
assert.match(dockerfile, /--disable-docs/, 'CAD 预览服务不得编译未使用的 LibreDWG 文档')
assert.match(dockerfile, /make -C src/, 'LibreDWG 构建必须限定在核心库目录')
assert.match(dockerfile, /make -C programs/, 'LibreDWG 构建必须限定在命令行工具目录并跳过无关示例')
assert.match(dockerfile, /USER cadpreview/, '运行容器必须使用非 root 用户')
assert.match(dockerfile, /HEALTHCHECK/, '运行镜像必须提供容器健康检查')
assert.match(dockerfile, /RUN python smoke_test\.py/, '镜像构建必须执行真实转换冒烟测试')

assert.match(smokeTest, /convert_source_to_pdf\(source_dxf, dxf_pdf\)/, '镜像冒烟必须覆盖 DXF 直转')
assert.match(smokeTest, /\["dxf2dwg", "-y", "-o"/, '镜像冒烟必须生成真实 DWG 测试夹具')
assert.match(smokeTest, /convert_source_to_pdf\(source_dwg, dwg_pdf\)/, '镜像冒烟必须覆盖 DWG 转换')
assert.match(smokeTest, /document\.styles\.add\("HZ", font="txt\.shx"\)/, '镜像冒烟必须覆盖缺失 SHX 中文字体回退')
assert.match(requirements, /^ezdxf==/m, 'DXF 渲染依赖必须固定版本')
assert.match(requirements, /^PyMuPDF==/m, 'PDF 渲染依赖必须固定版本')

for (const source of [readme, adr, deployment]) {
  assert.match(source, /LibreDWG/, '服务说明、架构决策和部署文档必须写明 LibreDWG')
}
assert.match(readme, /GPL-3\.0-or-later/, '交付说明必须写明 LibreDWG 许可证')
assert.match(readme, /AGPL-3\.0-or-later/, '交付说明必须写明 PyMuPDF 许可证')
assert.match(deployment, /services\/cad-preview\/Dockerfile/, 'Coolify 文档必须给出独立服务 Dockerfile')
assert.match(deployment, /不(?:得)?暴露公网/, 'Coolify 文档必须锁定私网边界')

console.log('LibreDWG CAD 预览服务结构、协议、安全边界与发布说明验证通过')
