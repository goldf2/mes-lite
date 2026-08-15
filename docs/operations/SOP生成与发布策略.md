# MES-lite SOP 生成与发布策略

事实基线：`v0.1.381`。

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
npm run sop:build
npm run verify:sop:artifacts
```

随后只做一次人工成品验收：

1. DOCX 与 PDF 全页渲染，检查空白页、截断、重叠、页码和版本。
2. 离线 Web 检查搜索、章节导航、181 个流程和图片加载。
3. 对本次受影响流程做内容与截图核对。
4. 记录交付路径、文件大小和 SHA-256；通过独立交付介质、对象存储或发布附件交付，不复制进应用仓库。

## 4. 发布树门禁

`verify:release-tree` 强制执行：

- Git 不跟踪 `output/`。
- Docker 构建上下文排除 `output/`。
- 当前 Git 发布树不超过 128 MiB。
- GitHub Actions 只获取验证所需的浅历史。
- 开发期与最终成品校验命令保持分离。

`v0.1.380` 发布树曾包含 2,803 个生成文件、约 2,106.3 MiB。真实 Coolify 对该树执行浅克隆时，上一部署在约 58 分钟后以 `git clone` 退出码 255 失败，尚未进入 Next.js 构建。`v0.1.381` 将生成物移出当前发布树，目标树约 58.5 MiB；历史二进制仍保留在旧提交中，后续如需彻底缩小仓库，必须单独安排历史重写维护窗口。

## 5. 回滚

本策略不修改数据库、业务接口或页面。回滚应用功能时使用对应代码提交；需要旧版文档时，可从旧提交的 `sop/manifest.json`、截图和 Markdown 重新生成到新的本地目录。不要为回滚生产应用而把历史二进制重新加入当前 Git 树。
