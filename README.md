# dsh-conversation-tree

> A workspace-wide conversation-tree view for DeepSeek Harness.

DSH Web 插件。把工作区里的所有对话和它们派生出的分支放在同一块画布上，看清血缘与用量，并就地分叉、带回、归档或删除。分支本身就是普通的 DSH 会话，模型、工具和斜杠命令都完整可用。

## 功能

- **工作区画布**：每条对话一棵树，全部平铺在同一块可拖拽、缩放的画布上；当前对话排在首位并高亮。
- **一键分叉**：在任意已完成轮次点「对话树分支」，新会话继承该轮之前的上下文，并记录来源对话、轮次与分支点摘要。
- **节点详情**：来源、分支轮次、层级、本会话轮次与步数、token 明细、缓存命中率、模型。
- **带回**：把一条对话自己产生的轮次压缩成摘要（跳过继承的前缀），预览确认后作为排队消息送回目标会话。
- **归档与删除**：侧栏操作；删除只针对本插件创建的分支。
- **搜索与键盘**：跨树按标题和分支点片段搜索并自动居中；方向键、`Enter`、`Home`/`End`、`+`/`-`、`f` 可用。

## 安装

要求 DSH `>=0.2.2-rc.1 <0.3.0`。

**从 npm 安装**

```bash
dsh plugin --profile web add @jiangyuxue666/dsh-conversation-tree
```

**从 GitHub 安装**（暂无 npm 版本时可用）

```bash
dsh plugin --profile web add github:jiangyuxue666/dsh-conversation-tree
```

也可以在 DSH 的「设置 → 插件 → 添加插件」里粘贴仓库地址
`https://github.com/jiangyuxue666/dsh-conversation-tree`。

命令会把插件加进该 profile 的 `dsh.profile.bundles`，装完重启 DSH 并刷新页面。

**从压缩包安装**

```bash
npm pack
dsh plugin --profile web add ./dsh-conversation-tree-0.6.3.tgz
```

**本地开发**

```bash
dsh plugin --profile web add /path/to/dsh-conversation-tree
```

这条只用于改代码：源码目录通过链接挂进 profile，改完重启 DSH 即可生效，不用重新安装。

宿主包 `@deepseek-ai/dsh-session` 声明为 peerDependency，由 DSH 自身提供，安装时不需要额外处理；想在本地跑测试时才需要 `npm install`。

## 使用

1. 打开一条对话，滚动到要分叉的那一轮。
2. 点消息底部的「对话树分支」。
3. 点顶部的「对话树」标签，查看整个工作区的树。
4. 单击节点看详情，双击打开该会话。
5. 拖拽空白处平移、滚轮缩放，右下角按钮适应画布；标题行箭头收起单棵树。
6. 侧栏「带回」把来源摘要送到目标对话。
7. 侧栏底部归档或删除子树。

## 注意事项

- 树只管理通过「对话树分支」创建的会话；DSH 原生分支按钮创建的分支不在树里。
- 分支也会出现在普通会话列表中，树是额外的管理视图。
- 工作区视图的会话范围由 Host 按工作区注册表解析；单次超过 2000 个会话时只显示前 2000 个并提示。
- 删除仅支持 macOS 与 Windows 上已验证的 JSONL 会话后端；其他平台仍可创建、查看和带回。
- 根对话不能删除；分支归档使用 DSH 原生归档，可撤销。
- 树关系存放在 `$DSH_HOME/conversation-tree.json`，每个分支的会话日志里也留有一条边记录；注册表丢失时可从日志恢复祖先链。
- 写操作的路由会校验同源（`Origin` 与 `Host` 一致）。

## 开发

```bash
npm install
npm test
```

代码结构：

- `index.js` — 入口：路由常量、`inject`、`apply` 与测试导出
- `lib/base.js` — 同源校验、JSON 读取、失败响应等公共件
- `lib/registry.js` — 分支边注册表与跨进程锁
- `lib/tree.js` — `/tree` 与 `/forest` 的读取与投影
- `lib/session.js` — 会话日志访问、pending 推进、祖先链恢复
- `lib/branch.js` — 创建分支
- `lib/summarize.js` — 带回摘要
- `lib/delete.js` — 删除子树（含平台分支）
- `lib/stats.js` — token / 轮次统计与持久化缓存
- `lib/models.js` — 模型路由与预设
- `lib/transcript.js` — 事件转文字
- `lib/handles.js` — 活动 agent 句柄表
- `client.js` — Web 客户端。DSH 的客户端模块系统每个 bundle 只注册一个 factory，所以这里保持单文件

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

当前 0.6.3，历史记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

MIT
