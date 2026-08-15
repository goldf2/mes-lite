# MES-lite SOP 生成与发布策略

事实基线：`v0.1.387`。

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
├── v0.1.387/
│   ├── MES-lite全流程作业指导书-v0.1.387.pdf
│   ├── MES-lite全流程作业指导书-v0.1.387.docx
│   └── manifest.json
└── latest/
    └── manifest.json
```

发布人员或独立 CI 使用云厂商 CLI 将 `output/sop-release/` 同步到对应 Bucket 前缀，不启用删除旧对象。上传账号只授予该前缀写权限；公开域名只读。上传后按 `latest/manifest.json` 逐个下载文件并复核 SHA-256，再在 Coolify 配置 `SOP_PUBLIC_BASE_URL` 并重新部署。

帮助中心不读取 `latest`，而是根据当前应用版本生成精确版本链接。应用回滚时会自动请求旧版本文档；未配置地址、地址不是 HTTPS 或地址包含凭据时，下载按钮隐藏，在线帮助保持可用。开发环境仅允许 `localhost`、`127.0.0.1` 的 HTTP 地址用于本地联调。

## 5. 受控登记到站内产品文档库

站内副本与 OSS 使用同一份版本清单。发布命令默认只读预检，不属于自动部署步骤；它不会因为代码推送、容器启动或数据库迁移而自动写业务数据。

本地冻结成品预检：

```bash
npm run sop:publish:library -- \
  --operator <文控账号> \
  --manifest output/sop-release/latest/manifest.json
```

Coolify 生产镜像可直接从唯一 OSS 地址读取当前应用的精确版本，不读取 `latest`：

```bash
node scripts/sop-library-publication.mjs \
  --operator <文控账号> \
  --from-oss
```

预检通过后，先执行并验证一致备份，再显式应用：

```bash
node scripts/runtime-backup.mjs create

node scripts/sop-library-publication.mjs \
  --operator <文控账号> \
  --from-oss \
  --apply \
  --backup-reference <备份清单路径或备份编号>
```

也可以用 `--public-base-url https://downloads.example.com/mes-lite/sop` 覆盖当前进程的 `SOP_PUBLIC_BASE_URL`。生产来源必须为 HTTPS，不能包含账号、密钥、查询签名或跨域重定向。

命令执行以下门禁：

1. 操作账号必须启用，并明确拥有文档类别新增、产品文档新增/修改和附件新增权限；只读预检不会补写默认权限。
2. 清单版本必须与应用版本完全一致，且只能包含精确版本路径下的 PDF、DOCX 各一份。
3. 下载或本地文件的名称、大小和 SHA-256 必须与清单一致，单文件不得超过站内附件 50MB 限制。
4. 首次执行先建立“不关联物料”的“系统教学 / SOP”草稿，附件中断后可按同一版本和成品指纹重试。
5. 两份附件再次复核通过后，才在同一数据库事务中启用当前版本、归档旧受控版本并写发布审计；人工同名文档、额外附件、重复记录或内容漂移都会阻断。

重复执行同一版本、同一成品指纹不会新增文档、附件或审计记录。旧版只改为 `ARCHIVED`，不删除文件；回滚时由文控人员在产品文档页重新启用上一版并归档当前版，同时记录原因。中途失败的当前版保持 `DRAFT`，修复文件或权限后重新执行即可。

## 6. 发布树门禁

`verify:release-tree` 强制执行：

- Git 不跟踪 `output/`。
- Docker 构建上下文排除 `output/`。
- 当前 Git 发布树不超过 128 MiB。
- GitHub Actions 只获取验证所需的浅历史。
- 开发期与最终成品校验命令保持分离。

`v0.1.380` 发布树曾包含 2,803 个生成文件、约 2,106.3 MiB。真实 Coolify 对该树执行浅克隆时，上一部署在约 58 分钟后以 `git clone` 退出码 255 失败，尚未进入 Next.js 构建。`v0.1.381` 将生成物移出当前发布树，目标树约 58.5 MiB；历史二进制仍保留在旧提交中，后续如需彻底缩小仓库，必须单独安排历史重写维护窗口。

## 7. 回滚

OSS 发布本身不修改数据库；只有带 `--apply` 和备份引用的站内登记命令会新增类别/草稿/附件、启用当前版并归档旧受控版本。回滚应用功能时使用对应代码提交；需要旧版文档时，可从旧提交的 `sop/manifest.json`、截图和 Markdown 重新生成到新的本地目录。旧版本对象目录应保留，不能因更新 `latest` 而删除。只需隐藏下载入口时，可删除 `SOP_PUBLIC_BASE_URL` 并重新部署；不要为回滚生产应用而把历史二进制重新加入当前 Git 树。
