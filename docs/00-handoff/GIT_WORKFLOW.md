# Git 工作流建议

本文件定义适合 AI 协作的轻量 Git 规则。

## 基本原则

1. 每个可理解的小功能单独提交。
2. 提交信息说明“为什么”和“做了什么”。
3. 不提交密钥、缓存、大体积生成物和本地环境文件。
4. AI 修改前先查看当前工作区状态。
5. 发现未知改动时，不擅自回退，先判断是否和当前任务相关。

## 推荐提交粒度

好的提交：

```text
feat: add data quality summary api
test: cover handoff template validation
docs: add ai handoff current state
fix: handle empty quality report directory
```

不好的提交：

```text
update
misc
final changes
```

## 分支建议

个人项目可以简单使用：

```text
main
feature/<short-task-name>
fix/<short-bug-name>
```

多人项目建议每个任务单独分支，合并前跑测试。

## AI 会话提交建议

每次 AI 会话结束，如果有文件改动，建议提交一次：

```bash
git status
git add <changed-files>
git commit -m "docs: update ai handoff state"
```

如果一次会话包含多个不相关改动，应拆分提交。
