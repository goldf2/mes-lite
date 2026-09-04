# 运行手册

## 环境要求

- Node.js 20 或项目 CI 固定版本，npm，SQLite/Prisma。
- 本地安装：`npm ci && npm run db:generate`。
- 开发：`npm run dev`，默认访问 `http://127.0.0.1:3000/`。

## 本次相关验证

```bash
npm run verify:material-bom-modules
npx tsc --noEmit
npx next lint --file modules/materials/ui/MaterialPanoramaPage.tsx --file modules/materials/ui/material-panorama/MaterialPanoramaDashboard.tsx --file modules/materials/ui/material-panorama/MaterialPanoramaLayoutDialog.tsx --file modules/materials/model/material-panorama-view.ts --file scripts/verify-material-bom-modules.ts
npm run verify:sop
npm run build
npm run verify:release-notes
git diff --check
```

## 发布

1. 更新 `package.json`、`package-lock.json` 与 `docs/releases/PENDING.md`。
2. 提交并推送 `ci/<version>`。
3. 核对 GitHub Actions 的 head SHA 与候选提交一致，全部通过后才推进 `main`。
4. MES-lite 生产环境由 Con01 的 Coolify 管理；不得访问 AL02。
5. 部署后检查公开健康/版本，并在真实页面完成用户流程验收。

## 回滚

- 代码回滚使用项目既有非破坏性回滚流程或将上一个已验证提交重新发布。
- 本次没有数据库迁移或业务写入；回滚代码不会删除物料、库存、BOM、锯切方案或成本对象。
