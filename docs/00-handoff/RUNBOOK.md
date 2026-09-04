# 运行手册

## 环境要求

- Node.js 20 或项目 CI 固定版本，npm，SQLite/Prisma。
- 本地安装：`npm ci && npm run db:generate`。
- 开发：`npm run dev`，默认访问 `http://127.0.0.1:3000/`。

## 本次相关验证

```bash
npm run verify:cost-domain-services
npm run verify:sawing-cost-module
npm run verify:material-bom-modules
npx tsc --noEmit
npx next lint --file modules/materials/server/material-panorama-query-service.ts --file modules/operations-tools/ui/SawingCostCalculatorPageModule.tsx --file modules/operations-tools/ui/SaveSawingCostPanel.tsx --file modules/materials/ui/material-panorama/MaterialPanoramaOperationsModules.tsx --file scripts/verify-cost-domain-services.ts --file scripts/verify-sawing-cost-module.ts
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
- 本次没有数据库迁移；回滚代码不会删除已保存的锯切方案或成本对象。
- 若新版本产生了测试业务数据，应通过系统允许的归档/作废流程处理，不直接改生产数据库。
