# dsh-conversation-tree

[English](README.en.md) | 中文

[![CI](https://github.com/jiangyuxue666/dsh-conversation-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/jiangyuxue666/dsh-conversation-tree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A workspace-wide conversation-tree view for DeepSeek Harness.

DeepSeek Harness 的 Web 插件。将工作区内的对话及其派生分支绘制在同一块画布上，用于查看分支血缘与单个会话的用量，并完成分叉、带回、归档与删除。分支即普通 DSH 会话，模型、工具与斜杠命令均可正常使用。

## 功能

- **工作区画布**：每条对话呈现为一棵树，全部排列在同一块可平移、缩放的画布上；当前对话固定排在首位并高亮显示。
- **分叉**：在任意已完成轮次的底部执行「对话树分支」，新会话继承该轮之前的上下文，同时记录来源对话、轮次与分支点摘要。
- **节点详情**：显示来源、分支轮次、层级、当前会话的轮次与步数、token 明细、缓存命中率与模型。
- **带回**：将来源会话自身产生的轮次压缩为摘要（跳过 fork 继承的前缀），经预览确认后以排队消息发送至目标会话。
- **归档与删除**：位于侧栏；删除范围仅限本插件创建的分支。
- **搜索与键盘操作**：跨树匹配标题与分支点片段并居中显示；支持方向键、`Enter`、`Home`/`End`、`+`/`-`、`f`。

## 安装

要求 DSH `>=0.2.2-rc.1 <0.3.0`。

```bash
dsh plugin --profile web add github:jiangyuxue666/dsh-conversation-tree
```

也可以通过 DSH 的「设置 → 插件 → 添加插件」填写仓库地址：

```
https://github.com/jiangyuxue666/dsh-conversation-tree
```

安装会将该插件写入 profile 的 `dsh.profile.bundles`，重启 DSH 后生效。

### 从压缩包安装

```bash
npm pack
dsh plugin --profile web add ./jiangyuxue666-dsh-conversation-tree-0.7.1.tgz
```

### 本地开发

```bash
dsh plugin --profile web add /path/to/dsh-conversation-tree
```

以链接方式挂载源码目录；修改后重启 DSH 即可生效，无需重新安装。

宿主包 `@deepseek-ai/dsh-session` 以 peerDependency 声明，由 DSH 提供；本地运行测试前需执行 `npm install`。

## 使用

1. 打开目标对话，定位到需要分叉的轮次。
2. 点击消息底部的「对话树分支」。
3. 点击顶部的「对话树」标签，查看整个工作区的树。
4. 单击节点查看详情，双击打开会话。
5. 拖拽空白处平移，滚轮缩放；右下角按钮适应画布，标题行箭头收起单棵树。
6. 在侧栏「带回」中选择目标对话并确认摘要。
7. 在侧栏底部归档或删除子树。

## 注意事项

- 树仅管理通过「对话树分支」创建的会话；DSH 原生分支按钮创建的会话不在此视图中。
- 分支同时出现在普通会话列表，树为额外的管理视图。
- 在侧边栏或其它插件里删除会话后，对话树会在下一次读取时自动校正：被删节点的子分支提升到上一级并标注「原来源对话已删除」；若整条祖先链都已删除，分支会成为独立的树根，而不是留下一个打不开的节点。
- 工作区视图的会话范围由 Host 依据工作区注册表解析；单次超过 2000 个会话时仅显示前 2000 个并给出提示。
- 删除仅支持 macOS 与 Windows 上已验证的 JSONL 会话后端；其他平台仍可创建、查看与带回。
- 根对话不可删除；分支归档使用 DSH 原生归档，可撤销。
- 树关系存放在 `$DSH_HOME/conversation-tree.json`，每个分支的会话日志中另有一条边记录；注册表丢失时可由日志恢复祖先链。
- 写操作路由校验同源（`Origin` 与 `Host` 一致）。

## 开发

```bash
npm install
npm test
```

代码结构：

- `index.js` — 入口：路由常量、`inject`、`apply` 与测试导出
- `lib/base.js` — 同源校验、JSON 读取、失败响应等公共件
- `lib/registry.js` — 分支边注册表与跨进程锁
- `lib/liveness.js` — 会话存活集采样（侧边栏删除后的自愈依据）
- `lib/reconcile.js` — 幽灵边修复：删除被删节点、子分支提升或独立成根
- `lib/tree.js` — `/tree` 与 `/forest` 的读取与投影
- `lib/session.js` — 会话日志访问、pending 推进、祖先链恢复
- `lib/branch.js` — 创建分支
- `lib/summarize.js` — 带回摘要
- `lib/delete.js` — 删除子树（含平台分支）
- `lib/stats.js` — token / 轮次统计与持久化缓存
- `lib/models.js` — 模型路由与预设
- `lib/transcript.js` — 事件转文字
- `lib/handles.js` — 活动 agent 句柄表
- `client.js` — Web 客户端。DSH 的客户端模块系统每个 bundle 只注册一个 factory，因此保持单文件

Host 路由：

- `POST /api/conversation-tree/branch`
- `GET  /api/conversation-tree/tree?sessionId=...`
- `POST /api/conversation-tree/forest`
- `POST /api/conversation-tree/summarize`
- `POST /api/conversation-tree/delete`

## 兼容性

- DSH `>=0.2.2-rc.1 <0.3.0`
- 删除：macOS / Windows

## 版本

变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

MIT
