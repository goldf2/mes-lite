# MES-lite SOP 生成与发布策略

事实基线：`v0.1.383`。

## 1. 结论

开发过程中只维护 `sop/manifest.json`、`sop/change-impact.json`、受影响截图和当前版本 Markdown。DOCX、PDF 与离线 Web 只在阶段或商业交付版本冻结后一次性生成、一次性完整验收；发现缺陷时只重查受影响页面。

生成成品保存在本地 `output/`，不进入 Git、GitHub Actions checkout 或 Docker 构建上下文。批准提交可以随时从同源清单和截图重新生成完全对应的交付包。

## 2. 开发期

```bash
npm run sop:build:source
npm run verify:sop
```

- `sop:build:source` 只生成当前版本 Markdown，不渲染 DOCX/PDF/Web。
- `verify:sop` 校验 181 个流程、页面注册、权限资源、截图、影响声明和 Markdown 版本。
- `impact=updated` 时只复核 `workflowIds` 指定流程；`impact=none` 不重复截图。

## 3. 最终交付期

版本、业务代码和截图冻结后执行：

```bash
npm run sop:release
```

该命令依次生成 Markdown、DOCX、PDF 和离线 Web，执行成品校验，并把 PDF/DOCX 准备到 `output/sop-release/`。它不连接云服务，也不读取上传密钥。

随后只做一次人工成品验收：

1. DOCX 与 PDF 全页渲染，检查空白页、截断、重叠、页码和版本。
2. 离线 Web 检查搜索、章节导航、181 个流程和图片加载。
3. 对本次受影响流程做内容与截图核对。
4. 记录交付路径、文件大小和 SHA-256；通过独立交付介质、对象存储或发布附件交付，不复制进应用仓库。

## 4. 单一 OSS 外部下载点

外部下载只需要一个 Bucket 前缀和一个公开 HTTPS 地址。MES-lite 只配置公开地址，不保存 Access Key、Secret Key，也不从浏览器访问 OSS 管理接口：

```text
SOP_PUBLIC_BASE_URL=https://downloads.example.com/mes-lite/sop
```

最终发布目录固定为：

```text
output/sop-release/
├── v0.1.383/
│   ├── MES-lite全流程作业指导书-v0.1.383.pdf
│   ├── MES-lite全流程作业指导书-v0.1.383.docx
│   └── manifest.json
└── latest/
    └── manifest.json
```

发布人员或独立 CI 使用云厂商 CLI 将 `output/sop-release/` 同步到对应 Bucket 前缀，不启用删除旧对象。上传账号只授予该前缀写权限；公开域名只读。上传后按 `latest/manifest.json` 逐个下载文件并复核 SHA-256，再在 Coolify 配置 `SOP_PUBLIC_BASE_URL` 并重新部署。

帮助中心不读取 `latest`，而是根据当前应用版本生成精确版本链接。应用回滚时会自动请求旧版本文档；未配置地址、地址不是 HTTPS 或地址包含凭据时，下载按钮隐藏，在线帮助保持可用。开发环境仅允许 `localhost`、`127.0.0.1` 的 HTTP 地址用于本地联调。

MES-lite 产品文档库可继续建立“不关联物料”的“系统教学 / SOP”文档，并把最终 PDF/DOCX 作为受控附件保存。当前外部发布命令不自动写生产数据库；内部文档登记必须在一致备份后由文控账号执行并验收，避免部署脚本越权修改业务数据。

## 5. 发布树门禁

`verify:release-tree` 强制执行：

- Git 不跟踪 `output/`。
- Docker 构建上下文排除 `output/`。
- 当前 Git 发布树不超过 128 MiB。
- GitHub Actions 只获取验证所需的浅历史。
- 开发期与最终成品校验命令保持分离。

`v0.1.380` 发布树曾包含 2,803 个生成文件、约 2,106.3 MiB。真实 Coolify 对该树执行浅克隆时，上一部署在约 58 分钟后以 `git clone` 退出码 255 失败，尚未进入 Next.js 构建。`v0.1.381` 将生成物移出当前发布树，目标树约 58.5 MiB；历史二进制仍保留在旧提交中，后续如需彻底缩小仓库，必须单独安排历史重写维护窗口。

## 6. 回滚

本策略不修改数据库。回滚应用功能时使用对应代码提交；需要旧版文档时，可从旧提交的 `sop/manifest.json`、截图和 Markdown 重新生成到新的本地目录。旧版本对象目录应保留，不能因更新 `latest` 而删除。只需隐藏下载入口时，可删除 `SOP_PUBLIC_BASE_URL` 并重新部署；不要为回滚生产应用而把历史二进制重新加入当前 Git 树。
