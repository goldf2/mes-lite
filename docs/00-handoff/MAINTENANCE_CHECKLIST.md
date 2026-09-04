# 维护检查清单

每次阶段性开发结束后，用这个清单快速检查交接资料是否还可信。

## 会话结束前

- [ ] 已按 `RECORDING_PROTOCOL.md` 区分当前状态、历史过程和专项证据
- [ ] `CURRENT_STATE.md` 已更新最近改动
- [ ] `SESSION_LOG.md` 已追加本次会话摘要
- [ ] `NEXT_ACTIONS.md` 已更新下一步任务
- [ ] 新的问题调查已写入 `DEBUG_LOG.md`，并区分假设和已验证根因
- [ ] 有后续影响的方案讨论已写入 `DISCUSSIONS.md`
- [ ] 发布、失败部署或回滚已写入 `RELEASE_LOG.md`
- [ ] `WORKFLOW.md` 仍然符合当前团队协作方式
- [ ] `PROMPT_LIBRARY.md` 已补充新沉淀的高频提示词
- [ ] `RUNBOOK.md` 中的启动和测试命令仍然有效
- [ ] `MODEL_AND_EVAL.md` 中的模型、提示词、评测和成本边界仍然准确
- [ ] `QUALITY_GATE.md` 中的检查项仍然能覆盖当前交付风险
- [ ] `SECURITY_AND_PRIVACY.md` 中的环境变量和外部服务边界仍然准确
- [ ] `RISK_REGISTER.md` 中的新增风险已记录或关闭
- [ ] `CONTEXT_INDEX.md` 包含新增加的重要文件
- [ ] `DECISIONS.md` 记录了新的关键决策
- [ ] 没有把密钥、令牌、账户信息写入文档
- [ ] 已运行相关测试或写明无法测试的原因

## 迁移到其它 AI 前

- [ ] 新 AI 能看到完整项目文件
- [ ] 新 AI 已被要求先读 `AGENTS.md`
- [ ] 新 AI 已被要求复述理解后再修改
- [ ] 当前任务已在 `NEXT_ACTIONS.md` 里写清楚
- [ ] 已知风险已在 `CURRENT_STATE.md` 里写清楚
- [ ] 长期风险已在 `RISK_REGISTER.md` 里写清楚
- [ ] AI 能力、质量门禁和安全边界已写清楚

## 建议节奏

- 小改动：只更新 `SESSION_LOG.md`
- 功能完成：更新 `SESSION_LOG.md`、`CURRENT_STATE.md`、`NEXT_ACTIONS.md`，并确认 `QUALITY_GATE.md`
- 问题调查：更新 `DEBUG_LOG.md`；研发日志只引用 BUG 编号
- 重要方案讨论：更新 `DISCUSSIONS.md`；确认后同步 `DECISIONS.md` 或 ADR
- 发布、失败部署或回滚：更新 `RELEASE_LOG.md` 和 `CURRENT_STATE.md`
- 工作方式变化：额外更新 `WORKFLOW.md`
- 技术方向变化：额外更新 `DECISIONS.md`
- 启动、测试、部署变化：额外更新 `RUNBOOK.md`
- 模型、提示词、评测集或 AI 服务调用变化：额外更新 `MODEL_AND_EVAL.md`
- 长期风险出现、缓解或接受：额外更新 `RISK_REGISTER.md`
- 外部服务、环境变量或敏感数据边界变化：额外更新 `SECURITY_AND_PRIVACY.md`
