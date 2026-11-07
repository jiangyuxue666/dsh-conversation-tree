/**
 * dsh-conversation-tree — client half.
 *
 * Adds a 「对话树」 tab beside the existing conversation views, a
 * 「对话树分支」 action below every completed Turn, a small tree context bar
 * below the composer, and a global overlay for bring-back and subtree
 * archive/delete dialogs.
 *
 * The tree page is a vertical graph: the current path is tinted, every branch
 * point is labelled with its Turn and prompt excerpt, and every node can be
 * opened, brought back, archived, or deleted. Every conversation of the
 * Workspace owns one panel on that same canvas, so the whole Workspace is one
 * surface to pan, zoom and search instead of one conversation at a time.
 */

window.__ModuleLoader__.load({
  id: '@jiangyuxue666/dsh-conversation-tree',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-conversation-tree'
    const BRANCH_ROUTE = '/api/conversation-tree/branch'
    const TREE_ROUTE = '/api/conversation-tree/tree'
    const FOREST_ROUTE = '/api/conversation-tree/forest'
    const SUMMARY_ROUTE = '/api/conversation-tree/summarize'
    const DELETE_ROUTE = '/api/conversation-tree/delete'
    const NOTE_ROUTE = '/api/conversation-tree/note'
    const COMPARE_ROUTE = '/api/conversation-tree/compare'
    const PEEK_ROUTE = '/api/conversation-tree/peek'
    const TREE_SUMMARY_ROUTE = '/api/conversation-tree/tree-summary'
    const STYLE_ID = 'dsh-conversation-tree/ui'
    const TOAST_MS = 4200
    /** Every conversation tree is a panel on the shared canvas. */
    const PANEL_HEADER = 34
    const PANEL_GAP = 36
    const MAX_COLUMNS = 4
    /**
     * How far "fit" may enlarge a small tree.
     *
     * Fit only ever shrank, so three nodes in a 1100px canvas stayed at 100%
     * in a corner and read as thumbnails. Filling the viewport up to here is
     * the difference between a diagram and a sticker.
     */
    const FIT_MAX_SCALE = 1.5

    const ZH = {
      'view.tree': '对话树',
      'head.refresh': '刷新',
      'head.fit': '适应画布',
      'head.zoomIn': '放大',
      'head.zoomOut': '缩小',
      'graph.label': '对话树图',
      'inspector.source': '来源',
      'inspector.root': '根对话',
      'inspector.turn': '第 {turn} 轮后',
      'inspector.depth': '第 {depth} 层',
      'inspector.level': '层级',
      'inspector.branchPoint': '分支点',
      'inspector.lastSaid': '最后说了什么',
      'inspector.lastUser': '你最后问的',
      'inspector.lastAssistant': '它最后答的',
      'inspector.path': '从根对话到这里',
      'inspector.usage': '本对话用量',
      'inspector.uncached': '未缓存输入',
      'inspector.cacheRead': '缓存读取',
      'inspector.cacheWrite': '缓存写入',
      'inspector.output': '输出',
      'inspector.cacheHit': '缓存命中 {percent}%',
      'inspector.external': '原生分支（只读）',
      'inspector.relinked': '原来源对话已删除，此分支已提升到上一级',
      'inspector.detached': '原来源对话已删除，此对话现在是一棵树的根',
      'note.label': '备注',
      'note.placeholder': '备注 · 只在这棵树里显示，不改会话名',
      'note.saved': '备注已保存',
      'compare.action': '对比',
      'compare.title': '对比对话',
      'compare.subtitle': '两边各自做到哪一步、花了多少',
      'compare.pick': '再点一个节点进行对比（Esc 取消）',
      'compare.hint': 'Shift + 点击另一个节点可直接对比',
      'compare.turns': '{turns} 轮 · {steps} 步',
      'compare.tools': '{count} 次工具调用',
      'compare.usage': '用量',
      'compare.model': '模型',
      'compare.last': '最后一条结论',
      'compare.prompts': '各自问过什么',
      'compare.empty': '这条分支还没有自己的回复',
      'compare.close': '关闭',
      'inspector.model': '模型',
      'inspector.provider': '提供方',
      'inspector.reasoning': '推理',
      'inspector.activity': '活动',
      'inspector.conversation': '本对话',
      'inspector.turns': '{turns} 轮 · {steps} 步',
      'inspector.updated': '最近活动',
      'inspector.created': '创建于',
      'inspector.workspace': '工作区',
      'inspector.branches': '{count} 个分支',
      'inspector.open': '打开对话',
      'inspector.goChat': '回到对话',
      'inspector.current': '当前对话',
      'inspector.branch': '分支',
      'inspector.noUsage': '—',
      'node.turnShort': '第 {turn} 轮',
      'node.rootShort': '根对话',
      'node.tokenShort': '{count} tok',
      'empty.branches': '还没有分支',
      'dock.bring': '带回',
      'dock.title': '把这条对话的讨论带回另一条对话',
      'branch.action': '对话树分支',
      'branch.creating': '创建中…',
      'branch.here': '从这里再分一支',
      'branch.hereHint': '把这条对话最后完成的一轮再分出一条新分支',
      'branch.hint': '从这个已完成轮次创建一条会进入对话树的分支',
      'head.titleFallback': '对话树',
      'head.refresh': '刷新',
      'head.retry': '重新加载',
      'head.loading': '正在读取对话树…',
      'head.search': '搜索标题或片段',
      'head.searchCount': '{count} 个匹配',
      'head.showArchived': '显示已归档',
      'head.hideArchived': '隐藏已归档',
      'head.focus': '只看当前这棵树',
      'head.unfocus': '显示同一工作区的其它树',
      'head.export': '导出 Markdown 提纲',
      'notice.exported': '已导出 {count} 棵树',
      'head.summarize': '总结这棵树',
      'summary.title': '这棵树走到哪了',
      'summary.subtitle': '读完这棵树的分支，给一段话：哪条走通了、哪条可以放',
      'summary.loading': '正在读这棵树…',
      'summary.scope': '读了 {branches} 条分支（共 {total} 条）',
      'summary.truncated': '回答被截断了，只保留前半段。',
      'head.orderRecent': '按最近活动排序（点一下改成按创建时间）',
      'head.orderCreated': '按创建时间排序（点一下改回按最近活动）',
      'head.forestCount': '{conversations} 个对话 · {branches} 条分支',
      'head.workspaceCount': '{workspace} · {conversations} 个对话 · {branches} 条分支',
      'forest.empty': '这个工作区还没有对话',
      'forest.noMatch': '没有匹配的对话',
      'forest.archivedOnly': '对话都已归档，点右上角的归档按钮显示',
      'forest.truncated': '对话太多，只显示前 {count} 个',
      'forest.statsPartial': '对话较多，只统计了当前对话附近的用量',
      'forest.showSingles': '另有 {count} 个还没分支的对话',
      'forest.hideSingles': '收起还没分支的对话',
      'panel.expand': '展开这棵对话树',
      'panel.collapse': '收起这棵对话树',
      'panel.collapsed': '已收起',
      'panel.current': '当前对话',
      'panel.branches': '{count} 个分支',
      'node.expand': '展开分支',
      'node.collapse': '折叠分支',
      'node.hiddenCount': '{count} 个分支已折叠',
      'node.untitled': '未命名分支',
      'graph.hint': '方向键切换节点，回车打开，Esc 退出搜索',
      'dialog.close': '关闭',
      'inspector.tokens': 'tok',
      'target.preview': '摘要预览',
      'target.previewHint': '可以修改后再发送；这段文字会作为一条消息进入目标对话。',
      'target.regenerate': '重新压缩',
      'target.send': '发送',
      'target.back': '返回',
      'target.truncated': '摘要被模型截断了，建议检查后再发送。',
      'root.badge': '根对话',
      'node.archived': '已归档',
      'node.pending': '登记中',
      'node.running': '运行中',
      'time.justNow': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.yesterday': '昨天',
      'time.days': '{n} 天前',
      'node.action.archive': '归档',
      'node.action.unarchive': '取消归档',
      'node.action.delete': '删除',
      'node.archivedOpen': '已归档的对话不能直接打开',
      'target.title': '带回到哪个对话？',
      'target.subtitle': '把「{source}」自己的讨论压缩成摘要，送入目标对话。源对话会保留。',
      'target.source': '来源',
      'target.choose': '选择目标对话',
      'target.empty': '这棵树里没有其他可带回的对话。',
      'target.cancel': '取消',
      'target.confirm': '压缩并带回',
      'target.working': '正在压缩…',
      'notice.brought': '已带回「{target}」（{chars} 字）',
      'notice.branchCreated': '已创建对话树分支',
      'notice.archiving': '正在归档 {count} 个对话…',
      'notice.deleting': '正在删除 {count} 个对话…',
      'notice.archived': '已归档 {count} 个对话',
      'notice.deleted': '已删除 {count} 个对话',
      'notice.deletePending': '{count} 个对话将在 10 秒后删除',
      'notice.undo': '撤销',
      'notice.deleteCancelled': '已取消删除，什么都没动',
      'notice.unarchived': '已取消归档',
      'confirm.delete.title': '删除这棵子树？',
      'confirm.delete.body': '「{title}」及其下的所有分支会被永久删除，无法恢复。',
      'confirm.delete.leaf': '「{title}」会被永久删除，无法恢复。',
      'confirm.archive.title': '归档这棵子树？',
      'confirm.archive.body': '「{title}」及其下的所有分支会从默认视图中隐藏；之后可以在「显示已归档」里恢复。',
      'confirm.archive.leaf': '「{title}」会从默认视图中隐藏；之后可以在「显示已归档」里恢复。',
      'confirm.archive.running': '这条对话正在运行，归档会先停止它。',
      'confirm.children': '这个节点下面还有 {count} 个分支，整棵子树共 {total} 个对话，将一起处理。',
      'confirm.list': '将影响：',
      'confirm.target': '当前节点',
      'confirm.more': '还有 {count} 个…',
      'confirm.cancel': '取消',
      'confirm.delete.action': '确认删除',
      'confirm.archive.action': '确认归档',
      'confirm.working': '处理中…',
      'error.network': '连接不上本地服务',
      'error.timeout': '请求超时，请重试',
      'error.unauthorized': '页面需要刷新后才能调用本地服务',
      'error.cross-origin': '这个请求来自其他站点，已被拒绝',
      'error.session-not-loaded': '这条对话还没有加载，请先打开它',
      'error.session-header-unavailable': '读不到这条对话的会话头',
      'error.subagent-not-supported': '暂不支持从子代理会话创建对话树分支',
      'error.cwd-unavailable': '这条对话没有工作目录',
      'error.branch-boundary-invalid': '这条消息不在可分支的轮次末尾，请刷新后重试',
      'error.branch-boundary-inherited': '不能从继承来的轮次再分叉；请在这条分支自己的轮次上创建',
      'error.context-unavailable': '无法安全复制这条对话的上下文：{detail}',
      'error.preset-unavailable': '无法继承这条对话的工具与预设',
      'error.model-unavailable': '找不到可用的模型',
      'error.tree-registry-failed': '无法登记这条分支：{detail}',
      'error.open-failed': '创建分支失败：{detail}',
      'error.creation-unverified': '分支已创建，但归属校验没有通过：{detail}',
      'error.tree-failed': '读取对话树失败：{detail}',
      'error.source-empty': '这条对话还没有可压缩的内容',
      'error.summary-empty': '压缩没有产生内容',
      'error.summary-failed': '压缩失败：{detail}',
      'error.summary-unverified': '无法确认来源对话：{detail}',
      'error.session-not-found': '这条对话已经不在了',
      'error.session-live': '这个对话还在使用中，请先切换到其他对话再试',
      'error.delete-preflight': '删除前检查失败：{detail}',
      'error.delete-partial': '删除没有完全成功：{detail}',
      'error.cannot-delete-root': '根对话不在这里删除；可以归档整棵子树中的分支',
      'error.not-a-tree-node': '这不是对话树里的分支',
      'error.deletion-platform-unsupported': '当前系统暂不支持安全删除对话文件',
      'error.deletion-unsupported': '当前存储方式不支持安全删除',
      'error.prompt-rejected': '目标对话没有接受这条摘要',
      'error.unknown': '操作失败，请重试',
    }

    const EN = {
      'view.tree': 'Tree',
      'head.refresh': 'Refresh',
      'head.fit': 'Fit to canvas',
      'head.zoomIn': 'Zoom in',
      'head.zoomOut': 'Zoom out',
      'graph.label': 'Conversation tree graph',
      'inspector.source': 'Source',
      'inspector.root': 'Root',
      'inspector.turn': 'after Turn {turn}',
      'inspector.depth': 'level {depth}',
      'inspector.level': 'Level',
      'inspector.branchPoint': 'Branch point',
      'inspector.lastSaid': 'Last said',
      'inspector.lastUser': 'Your last question',
      'inspector.lastAssistant': 'Its last answer',
      'inspector.path': 'Path from the root',
      'inspector.usage': 'Own usage',
      'inspector.uncached': 'Uncached input',
      'inspector.cacheRead': 'Cached input',
      'inspector.cacheWrite': 'Cache write',
      'inspector.output': 'Output',
      'inspector.cacheHit': 'Cache hit {percent}%',
      'inspector.external': 'Native fork (read only)',
      'inspector.relinked': 'Its source conversation was deleted; this branch moved up one level',
      'inspector.detached': 'Its source conversation was deleted; this conversation is now a tree root',
      'note.label': 'Note',
      'note.placeholder': 'Note · shown in this tree only, never renames the conversation',
      'note.saved': 'Note saved',
      'compare.action': 'Compare',
      'compare.title': 'Compare conversations',
      'compare.subtitle': 'How far each side got, and what it cost',
      'compare.pick': 'Pick another node to compare (Esc cancels)',
      'compare.hint': 'Shift-click another node to compare',
      'compare.turns': '{turns} turns · {steps} steps',
      'compare.tools': '{count} tool calls',
      'compare.usage': 'Usage',
      'compare.model': 'Model',
      'compare.last': 'Last conclusion',
      'compare.prompts': 'What each side asked',
      'compare.empty': 'This branch has not answered yet',
      'compare.close': 'Close',
      'inspector.model': 'Model',
      'inspector.provider': 'Provider',
      'inspector.reasoning': 'Reasoning',
      'inspector.activity': 'Activity',
      'inspector.conversation': 'This conversation',
      'inspector.turns': '{turns} turns · {steps} steps',
      'inspector.updated': 'Last activity',
      'inspector.created': 'Created',
      'inspector.workspace': 'Workspace',
      'inspector.branches': '{count} branches',
      'inspector.open': 'Open conversation',
      'inspector.goChat': 'Back to chat',
      'inspector.current': 'Current',
      'inspector.branch': 'Branch',
      'inspector.noUsage': '—',
      'node.turnShort': 'Turn {turn}',
      'node.rootShort': 'Root',
      'node.tokenShort': '{count} tok',
      'empty.branches': 'No branches yet',
      'dock.bring': 'Bring back',
      'dock.title': 'Bring this conversation’s discussion back into another',
      'branch.action': 'Tree branch',
      'branch.creating': 'Creating…',
      'branch.here': 'Branch from here',
      'branch.hereHint': 'Fork the newest completed turn of this conversation',
      'branch.hint': 'Create a branch that joins the conversation tree at this completed Turn',
      'head.titleFallback': 'Conversation tree',
      'head.showArchived': 'Show archived',
      'head.refresh': 'Refresh',
      'head.retry': 'Reload',
      'head.loading': 'Reading the conversation tree…',
      'head.search': 'Search titles or excerpts',
      'head.searchCount': '{count} matches',
      'head.hideArchived': 'Hide archived',
      'head.focus': 'Show only this tree',
      'head.unfocus': 'Show the other trees of this Workspace',
      'head.export': 'Export as a Markdown outline',
      'notice.exported': 'Exported {count} tree(s)',
      'head.summarize': 'Summarize this tree',
      'summary.title': 'Where this tree got to',
      'summary.subtitle': 'One page over every branch: which one worked, which can go',
      'summary.loading': 'Reading the tree…',
      'summary.scope': 'Read {branches} of {total} branches',
      'summary.truncated': 'The answer was cut off; only the first part is shown.',
      'head.orderRecent': 'Sorted by recent activity — switch to creation order',
      'head.orderCreated': 'Sorted by creation order — switch back to recent activity',
      'head.forestCount': '{conversations} conversations · {branches} branches',
      'head.workspaceCount': '{workspace} · {conversations} conversations · {branches} branches',
      'forest.empty': 'This workspace has no conversations yet',
      'forest.noMatch': 'No conversation matches',
      'forest.archivedOnly': 'Every conversation is archived — use the archive button above',
      'forest.truncated': 'Too many conversations; showing the first {count}',
      'forest.statsPartial': 'Large Workspace: usage is shown for the conversations near the current one',
      'forest.showSingles': '{count} more conversation(s) with no branches',
      'forest.hideSingles': 'Hide conversations with no branches',
      'panel.expand': 'Expand this conversation tree',
      'panel.collapse': 'Collapse this conversation tree',
      'panel.collapsed': 'Collapsed',
      'panel.current': 'Current',
      'panel.branches': '{count} branches',
      'node.expand': 'Expand branch',
      'node.collapse': 'Collapse branch',
      'node.hiddenCount': '{count} branches collapsed',
      'node.untitled': 'Untitled branch',
      'graph.hint': 'Arrow keys move, Enter opens, Escape clears the search',
      'dialog.close': 'Close',
      'inspector.tokens': 'tokens',
      'target.preview': 'Summary preview',
      'target.previewHint': 'Edit before sending; this text is posted as one message into the target conversation.',
      'target.regenerate': 'Compress again',
      'target.send': 'Send',
      'target.back': 'Back',
      'target.truncated': 'The model cut the summary short; check it before sending.',
      'root.badge': 'Root',
      'node.archived': 'Archived',
      'node.pending': 'Registering',
      'node.running': 'Running',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.yesterday': 'yesterday',
      'time.days': '{n} d ago',
      'node.action.archive': 'Archive',
      'node.action.unarchive': 'Unarchive',
      'node.action.delete': 'Delete',
      'node.archivedOpen': 'Archived conversations cannot be opened',
      'target.title': 'Bring back into which conversation?',
      'target.subtitle': 'Compress 「{source}」’s own discussion into a brief and queue it into the target. The source is kept.',
      'target.source': 'Source',
      'target.choose': 'Choose a target conversation',
      'target.empty': 'There is no other conversation in this tree to bring back into.',
      'target.cancel': 'Cancel',
      'target.confirm': 'Compress and bring back',
      'target.working': 'Compressing…',
      'notice.brought': 'Brought back into 「{target}」 ({chars} chars)',
      'notice.branchCreated': 'Tree branch created',
      'notice.archiving': 'Archiving {count} conversation(s)…',
      'notice.deleting': 'Deleting {count} conversation(s)…',
      'notice.archived': 'Archived {count} conversation(s)',
      'notice.deleted': 'Deleted {count} conversation(s)',
      'notice.deletePending': '{count} conversation(s) will be deleted in 10 seconds',
      'notice.undo': 'Undo',
      'notice.deleteCancelled': 'Deletion cancelled — nothing was removed',
      'notice.unarchived': 'Unarchived',
      'confirm.delete.title': 'Delete this subtree?',
      'confirm.delete.body': '「{title}」 and every branch below it will be permanently deleted. This cannot be undone.',
      'confirm.delete.leaf': '「{title}」 will be permanently deleted. This cannot be undone.',
      'confirm.archive.title': 'Archive this subtree?',
      'confirm.archive.body': '「{title}」 and every branch below it will disappear from the default view; you can restore them with 「Show archived」.',
      'confirm.archive.leaf': '「{title}」 will disappear from the default view; you can restore it with 「Show archived」.',
      'confirm.archive.running': 'This conversation is running; archiving stops it first.',
      'confirm.children': 'This node has {count} branch(es) below it; the whole subtree has {total} conversation(s) and will be processed together.',
      'confirm.list': 'Affected:',
      'confirm.target': 'Selected node',
      'confirm.more': 'and {count} more…',
      'confirm.cancel': 'Cancel',
      'confirm.delete.action': 'Delete',
      'confirm.archive.action': 'Archive',
      'confirm.working': 'Working…',
      'error.network': 'Cannot reach the local host',
      'error.timeout': 'The request timed out; try again',
      'error.unauthorized': 'Refresh the page before calling the local host',
      'error.cross-origin': 'This request came from another site and was rejected',
      'error.session-not-loaded': 'This conversation is not loaded yet — open it first',
      'error.session-header-unavailable': 'The session header is unavailable',
      'error.subagent-not-supported': 'A tree branch cannot be created from a subagent session',
      'error.cwd-unavailable': 'This conversation has no working directory',
      'error.branch-boundary-invalid': 'This message is not at the end of a completed Turn; refresh and try again',
      'error.branch-boundary-inherited': 'A branch cannot fork from an inherited Turn; branch from one of its own Turns',
      'error.context-unavailable': 'Could not safely copy the context: {detail}',
      'error.preset-unavailable': 'Could not inherit this conversation’s preset and tools',
      'error.model-unavailable': 'No model route is available',
      'error.tree-registry-failed': 'Could not register this branch: {detail}',
      'error.open-failed': 'Could not create the branch: {detail}',
      'error.creation-unverified': 'The branch exists, but ownership verification failed: {detail}',
      'error.tree-failed': 'Could not read the conversation tree: {detail}',
      'error.source-empty': 'This conversation has no content to compress yet',
      'error.summary-empty': 'Compression produced nothing',
      'error.summary-failed': 'Compression failed: {detail}',
      'error.summary-unverified': 'Could not verify the source conversation: {detail}',
      'error.session-not-found': 'That conversation is gone',
      'error.session-live': 'That conversation is still in use; switch to another conversation and retry',
      'error.delete-preflight': 'The delete preflight failed: {detail}',
      'error.delete-partial': 'The delete did not fully complete: {detail}',
      'error.cannot-delete-root': 'The root conversation cannot be deleted here; archive branches instead',
      'error.not-a-tree-node': 'This is not a branch in the conversation tree',
      'error.deletion-platform-unsupported': 'This platform does not support safe conversation deletion yet',
      'error.deletion-unsupported': 'This storage backend does not support safe deletion',
      'error.prompt-rejected': 'The target conversation refused the summary',
      'error.unknown': 'The operation failed; try again',
    }

    let translate = null
    const t = (key, params) => {
      let text = translate === null ? (ZH[key] ?? key) : translate(key)
      if (typeof text !== 'string' || text === key) text = ZH[key] ?? key
      if (params !== undefined && params !== null) {
        for (const [name, value] of Object.entries(params)) {
          text = text.split(`{${name}}`).join(String(value))
        }
      }
      return text
    }

    /** The plugin context captured for components. */
    let app = null

    // ---------------------------------------------------------------- icons

    function Svg({ size = 16, viewBox = '0 0 24 24', fill = 'none', children, className }) {
      return h('svg', {
        viewBox,
        width: size,
        height: size,
        className,
        fill,
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
      }, children)
    }

    function IconTree({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M12 4v5.2' }),
        h('path', { d: 'M12 9.2H7.1A2.1 2.1 0 0 0 5 11.3v2.4' }),
        h('path', { d: 'M12 9.2h4.9a2.1 2.1 0 0 1 2.1 2.1v2.4' }),
        h('path', { d: 'M12 9.2v7.1' }),
        h('circle', { cx: 12, cy: 3.6, r: 1.9, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 5, cy: 16.2, r: 1.8, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 19, cy: 16.2, r: 1.8, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 12, cy: 19, r: 1.8, fill: 'currentColor', stroke: 'none' }))
    }

    function IconBranch({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M6 4v5.5A2.5 2.5 0 0 0 8.5 12h7' }),
        h('path', { d: 'M6 9.5A2.5 2.5 0 0 1 8.5 7h7' }),
        h('path', { d: 'M6 14v6' }),
        h('circle', { cx: 6, cy: 4, r: 2, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 18.5, cy: 7, r: 2, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 18.5, cy: 12, r: 2, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 6, cy: 20, r: 2, fill: 'currentColor', stroke: 'none' }))
    }

    function IconBring({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M19 7v4.5a3.5 3.5 0 0 1-3.5 3.5H6' }),
        h('path', { d: 'm9 11-4 4 4 4' }),
        h('path', { d: 'M19 4v3' }))
    }

    function IconArchive({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M4 7.5h16' }),
        h('path', { d: 'M5 7.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5' }),
        h('path', { d: 'M8 4h8l1 3.5H7L8 4Z' }),
        h('path', { d: 'M10 12h4' }))
    }

    function IconUnarchive({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M4 7.5h16' }),
        h('path', { d: 'M5 7.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7.5' }),
        h('path', { d: 'M8 4h8l1 3.5H7L8 4Z' }),
        h('path', { d: 'M12 16v-4' }),
        h('path', { d: 'm9.8 13.8 2.2-2.2 2.2 2.2' }))
    }

    function IconTrash({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }),
        h('path', { d: 'M6.5 7l.8 12a1 1 0 0 0 1 .95h7.4a1 1 0 0 0 1-.95L18.5 7' }),
        h('path', { d: 'M10 11v5M14 11v5' }))
    }

    function IconRefresh({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M20 11a8 8 0 1 0-2.3 6.1' }),
        h('path', { d: 'M20 4v7h-7' }))
    }

    function IconFit({ size = 15, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M9 4H4v5' }),
        h('path', { d: 'M15 20h5v-5' }),
        h('path', { d: 'M20 9V4h-5' }),
        h('path', { d: 'M4 15v5h5' }))
    }

    function IconCheck({ size = 16, className }) {
      return h(Svg, { size, className }, h('path', { d: 'm5 12.5 4.2 4.2L19 7' }))
    }

    function IconSort({ size = 15, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M4 6.5h10' }),
        h('path', { d: 'M4 12h7' }),
        h('path', { d: 'M4 17.5h4' }),
        h('path', { d: 'M18.5 5v13' }),
        h('path', { d: 'm15.5 15 3 3 3-3' }))
    }

    function IconFocus({ size = 15, className }) {
      return h(Svg, { size, className },
        h('circle', { cx: '12', cy: '12', r: '4.2' }),
        h('path', { d: 'M12 4v2.4M12 17.6V20M4 12h2.4M17.6 12H20' }))
    }

    function IconDownload({ size = 15, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M12 4v10' }),
        h('path', { d: 'm8 10.5 4 4 4-4' }),
        h('path', { d: 'M5 19h14' }))
    }

    function IconSummary({ size = 15, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M5 4.5h9l4.5 4.5v10.5H5z' }),
        h('path', { d: 'M13.5 4.5V9H18' }),
        h('path', { d: 'M8 13h8M8 16.5h5' }))
    }

    function IconSearch({ size = 15, className }) {
      return h(Svg, { size, className },
        h('circle', { cx: '11', cy: '11', r: '6.2' }),
        h('path', { d: 'm15.6 15.6 4 4' }))
    }

    function IconChevron({ size = 14, className }) {
      return h(Svg, { size, className }, h('path', { d: 'm8 5 6 5-6 5' }))
    }

    function IconClose({ size = 16, className }) {
      return h(Svg, { size, className }, h('path', { d: 'M6 6l12 12M18 6 6 18' }))
    }

    function IconAlert({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M12 4 3.5 19h17L12 4Z' }),
        h('path', { d: 'M12 9v4.5' }),
        h('path', { d: 'M12 16.8h.01' }))
    }

    function Spinner({ size = 14, className = '' }) {
      return h('span', {
        className: `ct-spinner ${className}`.trim(),
        style: { width: size, height: size },
        'aria-hidden': true,
      })
    }

    // ---------------------------------------------------------------- store

    /** A browsing session must not keep every tree and forest it ever opened. */
    const TREE_CACHE_LIMIT = 12
    const FOREST_CACHE_LIMIT = 3

    /** Keep the newest entries of one cache record, by `fetchedAt`. */
    function trimCache(record, limit) {
      const entries = Object.entries(record)
      if (entries.length <= limit) return record
      entries.sort((left, right) => (right[1]?.fetchedAt ?? 0) - (left[1]?.fetchedAt ?? 0))
      const kept = {}
      for (const [key, value] of entries.slice(0, limit)) kept[key] = value
      return kept
    }

    function createStore() {
      let state = {
        trees: {},
        loading: {},
        errors: {},
        forests: {},
        forestLoading: {},
        forestErrors: {},
        forestEpoch: 0,
        dialog: null,
        toast: null,
        notices: {},
        dialogSeq: 0,
        toastSeq: 0,
        noticeSeq: 0,
      }
      const listeners = new Set()
      const inflight = new Map()
      const inflightForest = new Map()
      // What one node last said, by id. Small and for the page's lifetime: the
      // tree payload deliberately carries no message text.
      const peeks = new Map()
      const noticeTimers = new Map()
      // Every invalidation bumps the epoch; a response that started under an
      // older epoch must not write its tree back over a newer one.
      let treeEpoch = 0
      let toastTimer = 0
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const set = (patch) => {
        state = { ...state, ...patch }
        emit()
      }
      const withoutKey = (record, key) => {
        const next = { ...record }
        delete next[key]
        return next
      }
      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        async loadTree(sessionId, force = false, includeStats = false) {
          if (typeof sessionId !== 'string' || sessionId === '') return undefined
          const requestKey = `${sessionId}:${includeStats ? 'stats' : 'base'}`
          if (!force) {
            const cached = state.trees[sessionId]
            if (cached !== undefined && (includeStats === false || cached.stats === true)
              && Date.now() - cached.fetchedAt < 4000) return cached
            const active = inflight.get(requestKey)
            if (active !== undefined) return active
          }
          const operation = (async () => {
            const epoch = treeEpoch
            set({
              loading: { ...state.loading, [sessionId]: true },
              errors: withoutKey(state.errors, sessionId),
            })
            try {
              const suffix = includeStats ? '&stats=1' : ''
              const data = await requestJson(`${TREE_ROUTE}?sessionId=${encodeURIComponent(sessionId)}${suffix}`, { method: 'GET' })
              const previous = state.trees[sessionId]
              // A base tree never replaces the stats tree of the same epoch (it
              // would drop every usage number), and a pre-invalidation response
              // never replaces a tree refreshed after the change.
              if (epoch !== treeEpoch || (includeStats === false && previous?.stats === true)) {
                set({ loading: withoutKey(state.loading, sessionId) })
                return previous
              }
              const tree = { ...data, stats: includeStats, fetchedAt: Date.now() }
              set({
                trees: trimCache({ ...state.trees, [sessionId]: tree }, TREE_CACHE_LIMIT),
                loading: withoutKey(state.loading, sessionId),
                errors: withoutKey(state.errors, sessionId),
              })
              return tree
            } catch (error) {
              set({
                loading: withoutKey(state.loading, sessionId),
                errors: { ...state.errors, [sessionId]: friendlyError(error) },
              })
              return undefined
            } finally {
              inflight.delete(requestKey)
            }
          })()
          inflight.set(requestKey, operation)
          return operation
        },
        /**
         * Read every tree that touches one Workspace's conversations.
         *
         * The Workspace membership is client knowledge, so the caller names the
         * Sessions and this method reconciles one merged forest. Cached for the
         * same short window as a single tree: a page switch back and forth must
         * not re-read the registry every time.
         */
        async loadForest(key, currentId, options = {}) {
          if (typeof key !== 'string' || key === '') return undefined
          if (typeof currentId !== 'string' || currentId === '') return undefined
          const includeStats = options.stats !== false
          // Two passes: the tree paints as soon as its shape is known, then the
          // per-Session numbers arrive. Reading a workspace of cold logs used to
          // block the first frame on every one of them.
          if (includeStats && options.defer !== false) {
            const base = await this.loadForest(key, currentId, { ...options, stats: false })
            if (base === undefined) return undefined
            return await this.loadForest(key, currentId, { ...options, stats: true, defer: false }) ?? base
          }
          // The workspace membership is the host's: it owns the registry. The
          // id here only names the conversation the page is showing.
          const signature = currentId
          if (options.force !== true) {
            const cached = state.forests[key]
            if (cached !== undefined && cached.signature === signature && cached.stats === includeStats
              && Date.now() - cached.fetchedAt < 4000) return cached
            const active = inflightForest.get(key)
            if (active !== undefined) return active
          }
          const operation = (async () => {
            const epoch = state.forestEpoch
            set({
              forestLoading: { ...state.forestLoading, [key]: true },
              forestErrors: withoutKey(state.forestErrors, key),
            })
            try {
              const data = await requestJson(FOREST_ROUTE, {
                method: 'POST',
                body: JSON.stringify({ sessionId: currentId, stats: includeStats }),
              }, 120000)
              if (epoch !== state.forestEpoch) {
                set({ forestLoading: withoutKey(state.forestLoading, key) })
                return undefined
              }
              const forest = { ...data, stats: includeStats, signature, fetchedAt: Date.now() }
              set({
                forests: trimCache({ ...state.forests, [key]: forest }, FOREST_CACHE_LIMIT),
                forestLoading: withoutKey(state.forestLoading, key),
                forestErrors: withoutKey(state.forestErrors, key),
              })
              return forest
            } catch (error) {
              if (epoch === state.forestEpoch) {
                set({
                  forestLoading: withoutKey(state.forestLoading, key),
                  forestErrors: { ...state.forestErrors, [key]: friendlyError(error) },
                })
              }
              return undefined
            } finally {
              inflightForest.delete(key)
            }
          })()
          inflightForest.set(key, operation)
          return operation
        },
        invalidateTrees(sessionIds) {
          treeEpoch += 1
          // A forest is a view over the same edges; every mutation invalidates
          // all of them, because a deletion can remove a node from a tree the
          // caller did not name.
          if (Array.isArray(sessionIds)) {
            const trees = { ...state.trees }
            const errors = { ...state.errors }
            for (const id of sessionIds) {
              delete trees[id]
              delete errors[id]
            }
            set({
              trees,
              errors,
              forests: {},
              forestLoading: {},
              forestErrors: {},
              forestEpoch: state.forestEpoch + 1,
            })
            return
          }
          set({
            trees: {},
            errors: {},
            forests: {},
            forestLoading: {},
            forestErrors: {},
            forestEpoch: state.forestEpoch + 1,
          })
        },
        toast(kind, text, action = null, ttl = TOAST_MS) {
          state.toastSeq += 1
          window.clearTimeout(toastTimer)
          set({ toast: { kind, text, seq: state.toastSeq, action } })
          toastTimer = window.setTimeout(() => {
            if (state.toast?.seq === state.toastSeq) set({ toast: null })
          }, ttl)
        },
        setNotice(sessionId, notice, ttl = 0) {
          if (typeof sessionId !== 'string' || sessionId === '') return
          const previous = noticeTimers.get(sessionId)
          if (previous !== undefined) window.clearTimeout(previous)
          noticeTimers.delete(sessionId)
          state.noticeSeq += 1
          const seq = state.noticeSeq
          set({ notices: { ...state.notices, [sessionId]: { ...notice, seq } } })
          if (ttl > 0) {
            const timer = window.setTimeout(() => {
              if (state.notices[sessionId]?.seq !== seq) return
              const next = { ...state.notices }
              delete next[sessionId]
              noticeTimers.delete(sessionId)
              set({ notices: next })
            }, ttl)
            noticeTimers.set(sessionId, timer)
          }
        },
        clearNotice(sessionId) {
          const timer = noticeTimers.get(sessionId)
          if (timer !== undefined) window.clearTimeout(timer)
          noticeTimers.delete(sessionId)
          if (state.notices[sessionId] === undefined) return
          const next = { ...state.notices }
          delete next[sessionId]
          set({ notices: next })
        },
        openDialog(dialog) {
          state.dialogSeq += 1
          set({ dialog: { ...dialog, id: state.dialogSeq } })
        },
        closeDialog() {
          set({ dialog: null })
        },
        /**
         * Patch one Session's projection wherever it is cached.
         *
         * A note edit must not refetch a forest: the node exists in whichever
         * tree or component happens to be loaded, and both views read the same
         * field.
         */
        patchNode(sessionId, patch) {
          if (typeof sessionId !== 'string' || sessionId === '') return false
          let touched = false
          const trees = { ...state.trees }
          for (const [key, tree] of Object.entries(trees)) {
            if (!Array.isArray(tree?.nodes) || !tree.nodes.some((node) => node?.id === sessionId)) continue
            trees[key] = {
              ...tree,
              nodes: tree.nodes.map((node) => (node?.id === sessionId ? { ...node, ...patch } : node)),
            }
            touched = true
          }
          const forests = { ...state.forests }
          for (const [key, forest] of Object.entries(forests)) {
            if (!Array.isArray(forest?.components)) continue
            let changed = false
            const components = forest.components.map((component) => {
              if (!Array.isArray(component?.nodes) || !component.nodes.some((node) => node?.id === sessionId)) return component
              changed = true
              return {
                ...component,
                nodes: component.nodes.map((node) => (node?.id === sessionId ? { ...node, ...patch } : node)),
              }
            })
            if (changed) {
              forests[key] = { ...forest, components }
              touched = true
            }
          }
          if (touched) set({ trees, forests })
          return touched
        },
        /** Persist one node's note; the response is the trimmed value. */
        async saveNote(sessionId, note) {
          const body = await requestJson(NOTE_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ sessionId, note }),
          })
          const saved = typeof body?.note === 'string' ? body.note : note
          this.patchNode(sessionId, { note: saved })
          return saved
        },
        /**
         * What this conversation last said.
         *
         * Asked for one selected node at a time and cached by id: the tree
         * payload carries counts and usage, never message text, because one
         * page load must not read every session log in the Workspace.
         */
        async peek(sessionId) {
          if (typeof sessionId !== 'string' || sessionId === '') return undefined
          if (peeks.has(sessionId)) return peeks.get(sessionId)
          const body = await requestJson(PEEK_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ id: sessionId }),
          })
          const side = body?.side
          if (side === undefined || side === null) return undefined
          if (peeks.size > 40) peeks.clear()
          peeks.set(sessionId, side)
          return side
        },
        /** Fetch two sides and open the comparison dialog. */
        async compare(ids) {
          const body = await requestJson(COMPARE_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ ids }),
          })
          const sides = Array.isArray(body?.sides) ? body.sides : []
          if (sides.length < 2) throw new Error(t('compare.empty'))
          this.openDialog({ kind: 'compare', sides })
          return sides
        },
      }
    }

    const store = createStore()

    function useStore() {
      const [snapshot, setSnapshot] = React.useState(store.get())
      React.useEffect(() => store.subscribe(() => setSnapshot(store.get())), [])
      return snapshot
    }

    // ------------------------------------------------------------ data helpers

    function delay(ms) {
      return new Promise((resolvePromise) => window.setTimeout(resolvePromise, ms))
    }

    async function waitForSession(sessionId, timeout = 3000) {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        const list = app?.sessions?.list?.getSnapshot?.()
        if (list?.byId?.[sessionId] !== undefined) return true
        await delay(60)
      }
      return false
    }

    function refreshSessionList() {
      try {
        const sessions = app?.get?.('sessions') ?? app?.sessions
        sessions?.refresh?.()
      } catch {
        /* the next catalog frame reconciles */
      }
    }

    function uuid() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
      } catch {
        /* fall through */
      }
      return `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }

    async function requestJson(path, options = {}, timeoutMs = 60000) {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(path, {
          ...options,
          signal: controller.signal,
          headers: {
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(options.headers ?? {}),
          },
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          const raw = typeof body?.error === 'string' ? body.error : ''
          const code = raw.split(':')[0] || `http-${response.status}`
          const detail = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : ''
          const error = new Error(detail || raw || `HTTP ${response.status}`)
          error.code = code
          error.status = response.status
          error.body = body
          throw error
        }
        return body
      } catch (error) {
        if (error?.name === 'AbortError') {
          const timeout = new Error(t('error.timeout'))
          timeout.code = 'timeout'
          throw timeout
        }
        if (error instanceof TypeError) {
          const network = new Error(t('error.network'))
          network.code = 'network'
          throw network
        }
        throw error
      } finally {
        window.clearTimeout(timer)
      }
    }

    function friendlyError(error) {
      const code = typeof error?.code === 'string' ? error.code : ''
      if (code === 'delete-preflight' && String(error?.message ?? '').includes('session-live')) {
        return t('error.session-live')
      }
      if (code !== '') {
        const key = `error.${code}`
        const text = t(key, { detail: error.message ?? '' })
        if (text !== key) return text
      }
      if (error?.status === 401) return t('error.unauthorized')
      const fallback = t('error.unknown')
      return typeof error?.message === 'string' && error.message !== '' ? error.message : fallback
    }

    function baseName(path) {
      if (typeof path !== 'string' || path === '') return ''
      const parts = path.split(/[\\/]+/).filter(Boolean)
      return parts.length === 0 ? path : parts[parts.length - 1]
    }

    function formatRelative(ms) {
      if (!Number.isFinite(ms)) return ''
      const diff = Date.now() - ms
      if (diff < 0) return t('time.justNow')
      const seconds = Math.floor(diff / 1000)
      if (seconds < 45) return t('time.justNow')
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return t('time.minutes', { n: Math.max(1, minutes) })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hours', { n: hours })
      const days = Math.floor(hours / 24)
      if (days === 1) return t('time.yesterday')
      if (days < 7) return t('time.days', { n: days })
      try {
        return new Date(ms).toLocaleDateString()
      } catch {
        return ''
      }
    }

    function sessionOf(sessions, id) {
      return sessions?.byId?.[id]
    }

    function titleOfNode(sessions, node) {
      const session = sessionOf(sessions, node.id)
      const title = session?.title || session?.displayTitle || node.title
      return typeof title === 'string' && title.trim() !== '' ? title.trim() : t('node.untitled')
    }

    /** The user's own name for one node, or an empty string. */
    function noteOf(node) {
      const note = node?.note
      return typeof note === 'string' ? note.trim() : ''
    }

    /**
     * When each node was last looked at, so a branch that moved on since then
     * can say so. Kept in localStorage: a reload must not resurrect the dots.
     */
    const SEEN_KEY = 'dsh-conversation-tree:seen'
    let seenCache = null

    function readSeen() {
      if (seenCache !== null) return seenCache
      seenCache = {}
      try {
        if (typeof window !== 'undefined') {
          const raw = window.localStorage.getItem(SEEN_KEY)
          const parsed = raw === null ? null : JSON.parse(raw)
          if (parsed !== null && typeof parsed === 'object') seenCache = parsed
        }
      } catch {
        seenCache = {}
      }
      return seenCache
    }

    /** Remember that this node has been read up to now. */
    function markSeen(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      const seen = readSeen()
      const now = Date.now()
      if (typeof seen[sessionId] === 'number' && seen[sessionId] >= now) return
      seen[sessionId] = now
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
      } catch {
        /* a full quota only costs the dots */
      }
    }

    /** The activity time this node shows as unread, or 0. */
    function unreadAt(entry) {
      const seen = readSeen()[entry?.id]
      if (typeof seen !== 'number') return 0
      if (entry?.current === true) return 0
      return Number.isFinite(entry?.updatedAt) && entry.updatedAt > seen ? entry.updatedAt : 0
    }

    /** The shortest title that still distinguishes one branch card from its siblings. */
    function displayTitleOf(sessions, node) {
      const full = titleOfNode(sessions, node)
      if (node.parentId === null || node.parentId === undefined) return full
      const segments = full.split(' · ').map((part) => part.trim()).filter(Boolean)
      const suffix = segments.at(-1)
      if (suffix === undefined || !suffix.startsWith('分支')) return full
      if (suffix === '分支' && segments.length > 2) return `${segments.at(-2)} / ${suffix}`
      return suffix
    }

    function workspaceOf(sessions, node) {
      const session = sessionOf(sessions, node.id)
      return baseName(session?.cwd) || baseName(node.cwd) || ''
    }

    function archivedSetOf(workspaces) {
      const ids = workspaces?.archivedSessionIds
      return new Set(Array.isArray(ids) ? ids : [])
    }

    /**
     * Build the visible tree, its connector guides, and the current path.
     * Archived nodes are hidden unless requested; children of a hidden node
     * are promoted to the nearest visible ancestor so no branch is orphaned.
     */
    function flattenTree(tree, options) {
      if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) return null
      const sessions = options?.sessions
      const archived = options?.archived ?? new Set()
      const showArchived = options?.showArchived === true
      const raw = new Map(tree.nodes.map((node) => [node.id, node]))
      const root = raw.get(tree.rootId)
      if (root === undefined) return null

      const visible = new Map()
      for (const node of tree.nodes) {
        if (node.id === root.id || showArchived || !archived.has(node.id)) visible.set(node.id, node)
      }
      const parentOf = (node) => {
        let parentId = node.parentId
        const seen = new Set()
        while (parentId !== null && parentId !== undefined && !visible.has(parentId) && raw.has(parentId) && !seen.has(parentId)) {
          seen.add(parentId)
          parentId = raw.get(parentId)?.parentId
        }
        return parentId !== null && parentId !== undefined && visible.has(parentId) ? parentId : root.id
      }

      const children = new Map()
      for (const node of visible.values()) {
        if (node.id === root.id) continue
        const parentId = parentOf(node)
        const list = children.get(parentId)
        if (list === undefined) children.set(parentId, [node])
        else list.push(node)
      }
      for (const list of children.values()) {
        list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))
      }

      const pathIds = new Set()
      let cursor = raw.get(tree.currentId) ?? raw.get(tree.rootId)
      const guard = new Set()
      while (cursor !== undefined && !guard.has(cursor.id)) {
        guard.add(cursor.id)
        pathIds.add(cursor.id)
        cursor = cursor.parentId === null || cursor.parentId === undefined ? undefined : raw.get(cursor.parentId)
      }

      const rows = []
      const walk = (node, depth, ancestorLines, hasNextSibling) => {
        const kids = children.get(node.id) ?? []
        const session = sessionOf(sessions, node.id)
        if (node.id !== root.id) {
          rows.push({
            node,
            depth,
            ancestorLines,
            hasNextSibling,
            kids,
            title: titleOfNode(sessions, node),
            workspace: workspaceOf(sessions, node),
            running: session?.running === true,
            updatedAt: session?.updatedAt ?? node.createdAt ?? null,
            archived: archived.has(node.id),
            current: node.id === tree.currentId,
            inPath: pathIds.has(node.id),
          })
        }
        kids.forEach((kid, index) => {
          const childLines = depth === 0 ? [] : [...ancestorLines, hasNextSibling]
          walk(kid, depth + 1, childLines, index < kids.length - 1)
        })
      }
      walk(root, 0, [], false)

      const rootSession = sessionOf(sessions, root.id)
      const model = {
        tree,
        root: {
          node: root,
          title: titleOfNode(sessions, root),
          workspace: workspaceOf(sessions, root),
          running: rootSession?.running === true,
          updatedAt: rootSession?.updatedAt ?? null,
          archived: archived.has(root.id),
          current: root.id === tree.currentId,
          inPath: pathIds.has(root.id),
          childCount: (children.get(root.id) ?? []).length,
        },
        rows,
        path: [...pathIds].map((id) => raw.get(id)).filter((node) => node !== undefined).reverse(),
        current: raw.get(tree.currentId) ?? root,
        currentDepth: (() => {
          let depth = 0
          let node = raw.get(tree.currentId)
          const seen = new Set()
          while (node?.parentId && !seen.has(node.id)) {
            seen.add(node.id)
            node = raw.get(node.parentId)
            depth += 1
          }
          return depth
        })(),
        visibleCount: visible.size,
        branchCount: tree.branchCount,
        hasArchived: tree.nodes.some((node) => archived.has(node.id)),
      }
      return model
    }

    /**
     * Turn one forest component into the tree shape the existing graph and
     * inspector consume. The current conversation only colors a path when it
     * belongs to this component; otherwise the root is the sensible anchor.
     */
    function componentTree(component, preferredCurrentId) {
      const nodes = Array.isArray(component?.nodes) ? component.nodes : []
      const rootId = typeof component?.rootId === 'string'
        ? component.rootId
        : (nodes.find((node) => node?.parentId === null)?.id ?? '')
      const hasPreferred = nodes.some((node) => node?.id === preferredCurrentId)
      return {
        version: 2,
        rootId,
        currentId: hasPreferred ? preferredCurrentId : rootId,
        branchCount: Math.max(0, nodes.length - 1),
        nodes,
      }
    }

    /** The Workspace that owns one session, or a one-session fallback. */
    function workspaceView(workspaces, sessionId) {
      const items = Array.isArray(workspaces?.items) ? workspaces.items : []
      const found = items.find((item) => Array.isArray(item?.sessionIds) && item.sessionIds.includes(sessionId))
      if (found !== undefined) {
        const sessionIds = []
        const seen = new Set()
        for (const id of found.sessionIds) {
          if (typeof id !== 'string' || id === '' || seen.has(id)) continue
          seen.add(id)
          sessionIds.push(id)
        }
        return {
          key: typeof found.workspaceId === 'string' && found.workspaceId !== '' ? found.workspaceId : `workspace:${sessionId}`,
          title: typeof found.title === 'string' ? found.title : '',
          sessionIds,
        }
      }
      return { key: `session:${sessionId}`, title: '', sessionIds: [sessionId] }
    }

    /**
     * Project every component of one forest into a panel model.
     *
     * The Workspace view is not a tree request: it draws every conversation of
     * the Workspace, including the ones that never branched (single-node
     * components). Archived roots leave the default view and archived branches
     * are hidden by flattenTree. Search does not remove panels: the graph dims
     * every node that does not match instead, so typing never reshuffles the
     * canvas under the pointer.
     */
    function forestModels(forest, options) {
      const sessions = options?.sessions
      const archived = options?.archived instanceof Set ? options.archived : new Set()
      const showArchived = options?.showArchived === true
      const currentSessionId = typeof options?.currentSessionId === 'string' ? options.currentSessionId : ''
      const components = Array.isArray(forest?.components) ? forest.components : []
      const hasArchived = components.some((component) => (
        Array.isArray(component?.nodes) && component.nodes.some((node) => archived.has(node.id))
      ))
      const models = []
      for (const component of components) {
        const nodes = Array.isArray(component?.nodes) ? component.nodes : []
        if (nodes.length === 0) continue
        const rootId = typeof component?.rootId === 'string' ? component.rootId : ''
        if (rootId === '') continue
        if (!showArchived && archived.has(rootId)) continue
        const tree = componentTree(component, currentSessionId)
        const model = flattenTree(tree, { sessions, archived, showArchived })
        if (model === null) continue
        const visibleNodes = [model.root.node, ...model.rows.map((row) => row.node)]
        const updatedAt = visibleNodes.reduce((latest, node) => {
          const session = sessionOf(sessions, node.id)
          const stamp = Number.isFinite(session?.updatedAt) ? session.updatedAt : node.createdAt
          return Number.isFinite(stamp) ? Math.max(latest, stamp) : latest
        }, 0)
        models.push({
          id: rootId,
          tree,
          root: model.root,
          rows: model.rows,
          // A root has no card of its own: its note is the panel title.
          title: noteOf(model.root.node) || model.root.title,
          branchCount: model.rows.length,
          current: visibleNodes.some((node) => node.id === currentSessionId),
          running: visibleNodes.some((node) => sessionOf(sessions, node.id)?.running === true),
          rootArchived: archived.has(rootId),
          updatedAt: updatedAt > 0 ? updatedAt : null,
        })
      }
      models.sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.title.localeCompare(b.title)
      })
      return {
        models,
        conversationCount: models.length,
        branchCount: models.reduce((total, model) => total + model.branchCount, 0),
        hasArchived,
      }
    }

    /**
     * The component tree that contains one node, whether it came from a single
     * tree load or from a Workspace forest. Dialogs use this so bring-back and
     * archive/delete keep working no matter which card opened them.
     */
    function treeForNode(state, nodeId) {
      if (typeof nodeId !== 'string' || nodeId === '') return undefined
      for (const tree of Object.values(state?.trees ?? {})) {
        if (Array.isArray(tree?.nodes) && tree.nodes.some((node) => node?.id === nodeId)) return tree
      }
      for (const forest of Object.values(state?.forests ?? {})) {
        for (const component of forest?.components ?? []) {
          if (Array.isArray(component?.nodes) && component.nodes.some((node) => node?.id === nodeId)) {
            return componentTree(component, forest?.currentId)
          }
        }
      }
      return undefined
    }

    /** Every raw node in one node's subtree, including itself. */
    function subtreeOf(tree, nodeId) {
      if (!tree || !Array.isArray(tree.nodes)) return []
      const children = new Map()
      for (const node of tree.nodes) {
        if (node.parentId === null || node.parentId === undefined) continue
        const list = children.get(node.parentId)
        if (list === undefined) children.set(node.parentId, [node])
        else list.push(node)
      }
      const ordered = []
      const visit = (id, seen) => {
        if (seen.has(id)) return
        seen.add(id)
        const node = tree.nodes.find((candidate) => candidate.id === id)
        if (node !== undefined) ordered.push(node)
        for (const child of children.get(id) ?? []) visit(child.id, seen)
      }
      visit(nodeId, new Set())
      return ordered
    }

    function findNode(tree, nodeId) {
      return tree?.nodes?.find((node) => node.id === nodeId)
    }

    function targetNodes(tree, sourceId, archived) {
      if (!tree) return []
      const source = findNode(tree, sourceId)
      const root = findNode(tree, tree.rootId)
      const nodes = []
      if (source === undefined) return []
      if (root !== undefined && root.id !== sourceId && !archived.has(root.id) && !root.pending) nodes.push(root)
      const model = flattenTree(tree, { archived, showArchived: false, sessions: undefined })
      for (const row of model?.rows ?? []) {
        if (row.node.id !== sourceId && !row.archived && !row.node.pending) nodes.push(row.node)
      }
      return nodes
    }

    function defaultTarget(tree, sourceId, archived) {
      const source = findNode(tree, sourceId)
      const candidates = targetNodes(tree, sourceId, archived)
      if (source?.parentId) {
        const parent = candidates.find((node) => node.id === source.parentId)
        if (parent !== undefined) return parent.id
      }
      const root = candidates.find((node) => node.id === tree?.rootId)
      if (root !== undefined) return root.id
      return candidates[0]?.id ?? ''
    }

    /** Sessions that should land on Chat if their remembered view was the tree. */
    const pendingChatSwitch = new Map()

    function openSession(sessionId, options = {}) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      if (options.forceChat === true) {
        const stamp = Date.now()
        pendingChatSwitch.set(sessionId, stamp)
        window.setTimeout(() => {
          if (pendingChatSwitch.get(sessionId) === stamp) pendingChatSwitch.delete(sessionId)
        }, 3500)
      }
      const ui = app?.get?.('uiWorkspace')
      if (ui !== undefined && typeof ui.openSession === 'function') ui.openSession(sessionId)
    }

    async function navigateOutside(tree, ids, currentSessionId, fallbackSessionId = null) {
      if (!ids.has(currentSessionId)) return false
      let node = findNode(tree, currentSessionId)
      let target = node?.parentId ?? null
      const guard = new Set()
      while (target !== null && ids.has(target) && !guard.has(target)) {
        guard.add(target)
        node = findNode(tree, target)
        target = node?.parentId ?? null
      }
      if (target === null || ids.has(target)) {
        target = tree.nodes.find((candidate) => !ids.has(candidate.id))?.id ?? null
      }
      // The whole component can be gone (or the caller is looking at another
      // conversation's tree), so the page hands over a surviving card to land on.
      if ((target === null || ids.has(target))
        && typeof fallbackSessionId === 'string' && fallbackSessionId !== ''
        && !ids.has(fallbackSessionId)) {
        target = fallbackSessionId
      }
      if (target === null) throw new Error(t('error.unknown'))
      openSession(target)
      await delay(650)
      return true
    }

    async function refreshAfterMutation(sessionId, removedIds) {
      store.invalidateTrees()
      refreshSessionList()
      if (typeof sessionId === 'string' && !removedIds?.has(sessionId)) {
        await store.loadTree(sessionId, true, true)
      }
    }

    /** How long a confirmed deletion waits for the undo. */
    const UNDO_DELETE_MS = 10_000

    /**
     * Resolve true when the delay elapses, false when the undo is used.
     *
     * The toast carries the undo, so the window is visible rather than a
     * hidden grace period; closing the page during it simply deletes nothing.
     */
    function deleteWindow(count) {
      return new Promise((resolve) => {
        let settled = false
        const finish = (proceed) => {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          resolve(proceed)
        }
        const timer = window.setTimeout(() => finish(true), UNDO_DELETE_MS)
        store.toast('info', t('notice.deletePending', { count }), {
          label: t('notice.undo'),
          onClick: () => finish(false),
        }, UNDO_DELETE_MS + 1000)
      })
    }

    async function runDelete(tree, nodeId, currentSessionId, fallbackSessionId = null) {
      const subtree = subtreeOf(tree, nodeId)
      const ids = new Set(subtree.map((node) => node.id))
      store.closeDialog()
      // Removing a branch is the only irreversible action on this page, and it
      // touches files on disk. Hold the request behind a ten second undo.
      if (!await deleteWindow(ids.size)) {
        store.toast('info', t('notice.deleteCancelled'))
        return []
      }
      store.setNotice(currentSessionId, {
        kind: 'working',
        text: t('notice.deleting', { count: ids.size }),
      })
      try {
        await navigateOutside(tree, ids, currentSessionId, fallbackSessionId)
        const body = await requestJson(DELETE_ROUTE, {
          method: 'POST',
          body: JSON.stringify({ sessionId: nodeId }),
        })
        const deleted = Array.isArray(body?.deleted) ? body.deleted : [...ids]
        await refreshAfterMutation(currentSessionId, ids)
        store.closeDialog()
        store.setNotice(currentSessionId, {
          kind: 'success',
          text: t('notice.deleted', { count: deleted.length }),
        }, 6000)
        return deleted
      } catch (failure) {
        store.setNotice(currentSessionId, {
          kind: 'error',
          text: friendlyError(failure),
        }, 9000)
        throw failure
      }
    }

    async function runArchive(tree, nodeId, currentSessionId, fallbackSessionId = null) {
      const subtree = subtreeOf(tree, nodeId)
      const ids = new Set(subtree.map((node) => node.id))
      store.setNotice(currentSessionId, {
        kind: 'working',
        text: t('notice.archiving', { count: subtree.length }),
      })
      try {
        await navigateOutside(tree, ids, currentSessionId, fallbackSessionId)
        const ui = app?.get?.('uiWorkspace')
        if (ui === undefined || typeof ui.archiveSession !== 'function') throw new Error(t('error.unknown'))
        for (const node of [...subtree].reverse()) {
          await ui.archiveSession(node.id, { stopActivity: true })
        }
        await refreshAfterMutation(currentSessionId, ids)
        store.closeDialog()
        store.setNotice(currentSessionId, {
          kind: 'success',
          text: t('notice.archived', { count: subtree.length }),
        }, 6000)
        return subtree
      } catch (failure) {
        store.setNotice(currentSessionId, {
          kind: 'error',
          text: friendlyError(failure),
        }, 9000)
        throw failure
      }
    }

    async function runUnarchive(nodeId, currentSessionId) {
      const ui = app?.get?.('uiWorkspace')
      if (ui === undefined || typeof ui.unarchiveSession !== 'function') throw new Error(t('error.unknown'))
      const tree = treeForNode(store.get(), nodeId)
      const nodes = tree === undefined ? [{ id: nodeId }] : subtreeOf(tree, nodeId)
      for (const node of [...nodes].reverse()) {
        await ui.unarchiveSession(node.id)
      }
      await refreshAfterMutation(currentSessionId, new Set())
      store.setNotice(currentSessionId, {
        kind: 'success',
        text: t('notice.unarchived'),
      }, 4000)
    }

    // ------------------------------------------------------------- primitives

    function ActionButton({ tone = 'normal', onClick, disabled = false, children, className = '' }) {
      return h('button', {
        type: 'button',
        className: `ct-btn ct-btn-${tone} ${className}`.trim(),
        onClick,
        disabled,
      }, children)
    }

    // ------------------------------------------------------------- tree view

    const NODE_WIDTH = 176
    const NODE_HEIGHT = 58
    const H_GAP = 20
    const V_GAP = 54
    const GRAPH_PAD = 32
    const COMPACT_NODE_WIDTH = 260
    const COMPACT_NODE_HEIGHT = 52
    const COMPACT_INDENT = 24
    const COMPACT_ROW_GAP = 8

    function numberOrZero(value) {
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
    }

    /** Per-conversation usage from the session-list summary projection. */
    function tokenStatsFromCounts(usage) {
      if (usage === undefined || usage === null) return null
      const uncachedInput = numberOrZero(usage.uncachedInputTokens)
      const cacheRead = numberOrZero(usage.cacheReadTokens)
      const cacheWrite = numberOrZero(usage.cacheWriteTokens)
      const output = numberOrZero(usage.outputTokens)
      const billedInput = uncachedInput + cacheRead + cacheWrite
      return {
        uncachedInput,
        cacheRead,
        cacheWrite,
        output,
        billedInput,
        total: billedInput + output,
        cacheHit: billedInput > 0 ? Math.round((cacheRead / billedInput) * 100) : null,
      }
    }

    function tokenStatsOf(sessions, id) {
      return tokenStatsFromCounts(sessionOf(sessions, id)?.projectionValues?.tokenUsage)
    }

    /** The last model this conversation actually used. */
    function modelStatsOf(sessions, id) {
      const selection = sessionOf(sessions, id)?.projectionValues?.modelSelection
      const value = selection?.lastUsed ?? selection?.next ?? null
      if (value === null || typeof value !== 'object') return null
      return {
        provider: typeof value.provider === 'string' ? value.provider : '',
        model: typeof value.model === 'string' ? value.model : '',
        reasoning: typeof value.reasoningEffort === 'string' ? value.reasoningEffort : '',
      }
    }

    function formatCompact(value) {
      if (!Number.isFinite(value) || value < 0) return '—'
      if (value < 1000) return String(Math.round(value))
      const format = (scaled, suffix) => {
        if (scaled >= 100) return `${Math.round(scaled)}${suffix}`
        const rounded = Math.round(scaled * 10) / 10
        return `${String(rounded).replace(/\.0$/, '')}${suffix}`
      }
      if (value >= 999_500_000) return format(value / 1_000_000_000, 'b')
      if (value >= 999_500) return format(value / 1_000_000, 'm')
      return format(value / 1000, 'k')
    }

    function formatExact(value) {
      if (!Number.isFinite(value) || value < 0) return '—'
      try { return value.toLocaleString('en-US') } catch { return String(value) }
    }

    /**
     * Lay out a top-down tree graph. Leaves take consecutive horizontal slots;
     * a parent sits on the midpoint of its children and one depth below its
     * own row. A wide tree therefore uses the canvas width instead of stacking
     * every sibling in one narrow right-hand column.
     */
    function buildGraph(tree, options) {
      if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) return null
      const sessions = options?.sessions
      const archived = options?.archived ?? new Set()
      const raw = new Map(tree.nodes.map((node) => [node.id, node]))
      const rootNode = raw.get(tree.rootId)
      if (rootNode === undefined) return null

      const children = new Map()
      for (const node of tree.nodes) {
        if (node.id === rootNode.id) continue
        const parentId = node.parentId !== null && node.parentId !== undefined && raw.has(node.parentId)
          ? node.parentId
          : null
        if (parentId === null) continue
        const list = children.get(parentId)
        if (list === undefined) children.set(parentId, [node])
        else list.push(node)
      }
      for (const list of children.values()) {
        list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id))
      }

      // Archived nodes stay out of the default view; descendants of a hidden
      // node go with it, because archiving always covers the subtree. The root
      // is never hidden: the page needs a node to draw.
      const hidden = new Set()
      if (options?.showArchived !== true) {
        const hideUnder = (node) => {
          for (const child of children.get(node.id) ?? []) {
            if (child.id === rootNode.id || hidden.has(child.id)) continue
            if (archived.has(child.id)) hidden.add(child.id)
            hideUnder(child)
          }
        }
        hideUnder(rootNode)
      }
      const collapsed = options?.collapsed instanceof Set ? options.collapsed : new Set()
      const visibleKids = (node) => (children.get(node.id) ?? []).filter((kid) => !hidden.has(kid.id))
      const countDescendants = (nodeId) => {
        let total = 0
        const stack = [...(children.get(nodeId) ?? [])]
        while (stack.length > 0) {
          const next = stack.pop()
          total += 1
          stack.push(...(children.get(next.id) ?? []))
        }
        return total
      }

      const query = typeof options?.query === 'string' ? options.query.trim().toLowerCase() : ''
      const matches = new Set()
      if (query !== '') {
        for (const node of tree.nodes) {
          const haystack = `${titleOfNode(sessions, node)} ${noteOf(node)} ${node.snippet ?? ''}`.toLowerCase()
          if (haystack.includes(query)) matches.add(node.id)
        }
      }

      const currentId = tree.currentId ?? rootNode.id
      const pathIds = new Set()
      let cursor = raw.get(currentId) ?? rootNode
      const seenPath = new Set()
      while (cursor !== undefined && !seenPath.has(cursor.id)) {
        seenPath.add(cursor.id)
        pathIds.add(cursor.id)
        cursor = cursor.parentId === null || cursor.parentId === undefined ? undefined : raw.get(cursor.parentId)
      }

      let nextLeafX = GRAPH_PAD
      let maxX = GRAPH_PAD
      let maxY = GRAPH_PAD
      const byId = new Map()
      const edges = []
      const makeEntry = (node, depth, parent, x, y, width, height, kids) => {
        maxX = Math.max(maxX, x + width)
        maxY = Math.max(maxY, y + height)
        const session = sessionOf(sessions, node.id)
        const entry = {
          id: node.id,
          node,
          parentId: parent?.id ?? null,
          depth,
          x,
          y,
          width,
          height,
          kids: [],
          title: titleOfNode(sessions, node),
          displayTitle: displayTitleOf(sessions, node),
          workspace: workspaceOf(sessions, node),
          running: session?.running === true,
          updatedAt: session?.updatedAt ?? node.createdAt ?? null,
          archived: archived.has(node.id),
          pending: node.pending === true,
          current: node.id === currentId,
          inPath: pathIds.has(node.id),
          usage: node.statsAvailable === true
            ? tokenStatsFromCounts(node.usage)
            : (node.parentId === null ? tokenStatsOf(sessions, node.id) : null),
          model: modelStatsOf(sessions, node.id) ?? modelOfNode(node),
          turns: node.statsAvailable === true && Number.isSafeInteger(node.turns) ? node.turns : null,
          steps: node.statsAvailable === true && Number.isSafeInteger(node.steps) ? node.steps : null,
          childCount: kids.length,
          hasChildren: kids.length > 0,
          collapsed: collapsed.has(node.id),
          hiddenCount: collapsed.has(node.id) ? countDescendants(node.id) : 0,
          matches: matches.size === 0 || matches.has(node.id),
          highlight: matches.size > 0 && matches.has(node.id),
          dimmed: matches.size > 0 && !matches.has(node.id),
        }
        byId.set(node.id, entry)
        if (parent !== null) {
          edges.push({
            id: `${parent.id}:${node.id}`,
            parentId: parent.id,
            childId: node.id,
            current: entry.inPath,
          })
        }
        return entry
      }

      let root
      if (options?.compact === true) {
        // A phone has no room for a wide level; read the hierarchy as an
        // indented stack instead of scaling the desktop graph to 54%.
        let row = 0
        const walk = (node, depth, parent) => {
          const kids = visibleKids(node)
          const entry = makeEntry(
            node,
            depth,
            parent,
            GRAPH_PAD + depth * COMPACT_INDENT,
            GRAPH_PAD + row * (COMPACT_NODE_HEIGHT + COMPACT_ROW_GAP),
            COMPACT_NODE_WIDTH,
            COMPACT_NODE_HEIGHT,
            kids,
          )
          row += 1
          entry.kids = collapsed.has(node.id) ? [] : kids.map((kid) => walk(kid, depth + 1, node))
          return entry
        }
        root = walk(rootNode, 0, null)
      } else {
        const walk = (node, depth, parent) => {
          const kids = visibleKids(node)
          const placedKids = collapsed.has(node.id) ? [] : kids.map((kid) => walk(kid, depth + 1, node))
          let x
          if (placedKids.length === 0) {
            x = nextLeafX
            nextLeafX += NODE_WIDTH + H_GAP
          } else {
            x = (placedKids[0].x + placedKids[placedKids.length - 1].x) / 2
          }
          const y = GRAPH_PAD + depth * (NODE_HEIGHT + V_GAP)
          const entry = makeEntry(node, depth, parent, x, y, NODE_WIDTH, NODE_HEIGHT, kids)
          entry.kids = placedKids
          return entry
        }
        root = walk(rootNode, 0, null)
      }
      const ordered = []
      const collect = (entry) => {
        ordered.push(entry)
        for (const child of entry.kids) collect(child)
      }
      collect(root)

      return {
        tree,
        root,
        current: byId.get(currentId) ?? root,
        byId,
        nodes: ordered,
        edges,
        compact: options?.compact === true,
        bounds: {
          width: maxX + GRAPH_PAD,
          height: maxY + GRAPH_PAD,
        },
        branchCount: tree.branchCount ?? Math.max(0, ordered.length - 1),
        hasArchived: tree.nodes.some((node) => archived.has(node.id)),
        hiddenArchived: hidden.size > 0,
        matchedCount: matches.size,
        query,
      }
    }

    /** The model the host read from this Session's own events, if any. */
    function modelOfNode(node) {
      const selection = node?.model
      if (selection === null || typeof selection !== 'object') return null
      return {
        provider: typeof selection.provider === 'string' ? selection.provider : '',
        model: typeof selection.model === 'string' ? selection.model : '',
        reasoning: typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort : '',
      }
    }

    function edgePath(parent, child) {
      const startX = parent.x + parent.width / 2
      const startY = parent.y + parent.height
      const endX = child.x + child.width / 2
      const endY = child.y
      const midY = startY + V_GAP / 2
      return `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`
    }

    function statusOf(entry) {
      if (entry.archived) return { key: 'archived', label: t('node.archived') }
      if (entry.pending) return { key: 'pending', label: t('node.pending') }
      if (entry.running) return { key: 'running', label: t('node.running') }
      if (entry.current) return { key: 'current', label: t('inspector.current') }
      return { key: 'normal', label: t('inspector.branch') }
    }

    function useCompactLayout() {
      const [compact, setCompact] = React.useState(() => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(max-width: 600px)').matches
      ))
      React.useEffect(() => {
        if (typeof window.matchMedia !== 'function') return undefined
        const media = window.matchMedia('(max-width: 600px)')
        const update = (event) => setCompact(event.matches)
        media.addEventListener?.('change', update)
        return () => media.removeEventListener?.('change', update)
      }, [])
      return compact
    }

    function TreeHeader({
      counts = '',
      matched = null,
      hasArchived = false,
      loading,
      notice,
      onRefresh,
      query = '',
      onQuery,
      showArchived = false,
      onToggleArchived,
      createdOrder = false,
      onToggleOrder,
      canFocus = false,
      focused = false,
      onToggleFocus,
      onExport,
      onSummarize,
    }) {
      const status = notice?.text ?? counts
      return h('header', { className: 'ct-top' },
        h('div', { className: 'ct-top-title' },
          h('h1', { className: 'ct-h1' }, t('view.tree')),
          status !== ''
            ? h('span', {
              className: `ct-top-count${notice === undefined ? '' : ` ct-top-notice ct-top-notice-${notice.kind}`}`,
              role: notice === undefined ? undefined : 'status',
            },
            notice?.kind === 'working' ? h(Spinner, { size: 12 }) : null,
            notice?.kind === 'success' ? h(IconCheck, { size: 13 }) : null,
            notice?.kind === 'error' ? h(IconAlert, { size: 13 }) : null,
            h('span', null, status))
            : null),
        h('div', { className: 'ct-top-actions' },
          typeof onQuery === 'function'
            ? h('div', { className: 'ct-search' },
              h(IconSearch, { size: 14 }),
              h('input', {
                type: 'search',
                className: 'ct-search-input',
                value: query,
                placeholder: t('head.search'),
                'aria-label': t('head.search'),
                onChange: (event) => onQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key !== 'Escape') return
                  event.stopPropagation()
                  onQuery('')
                },
              }),
              matched === null
                ? null
                : h('span', { className: 'ct-search-count' }, t('head.searchCount', { count: matched })))
            : null,
          hasArchived && typeof onToggleArchived === 'function'
            ? h('button', {
              type: 'button',
              className: 'ct-icon-btn',
              'aria-pressed': showArchived,
              onClick: onToggleArchived,
              title: showArchived ? t('head.hideArchived') : t('head.showArchived'),
              'aria-label': showArchived ? t('head.hideArchived') : t('head.showArchived'),
            }, showArchived ? h(IconUnarchive, { size: 15 }) : h(IconArchive, { size: 15 }))
            : null,
          // Dimming the other trees is only meaningful once there is another
          // tree to dim.
          canFocus && typeof onToggleFocus === 'function'
            ? h('button', {
              type: 'button',
              className: 'ct-icon-btn',
              'aria-pressed': focused,
              onClick: onToggleFocus,
              title: focused ? t('head.unfocus') : t('head.focus'),
              'aria-label': focused ? t('head.unfocus') : t('head.focus'),
            }, h(IconFocus, { size: 15 }))
            : null,
          typeof onToggleOrder === 'function'
            ? h('button', {
              type: 'button',
              className: 'ct-icon-btn',
              'aria-pressed': createdOrder,
              onClick: onToggleOrder,
              title: createdOrder ? t('head.orderCreated') : t('head.orderRecent'),
              'aria-label': createdOrder ? t('head.orderCreated') : t('head.orderRecent'),
            }, h(IconSort, { size: 15 }))
            : null,
          typeof onExport === 'function'
            ? h('button', {
              type: 'button',
              className: 'ct-icon-btn',
              onClick: onExport,
              title: t('head.export'),
              'aria-label': t('head.export'),
            }, h(IconDownload, { size: 15 }))
            : null,
          typeof onSummarize === 'function'
            ? h('button', {
              type: 'button',
              className: 'ct-icon-btn',
              onClick: onSummarize,
              title: t('head.summarize'),
              'aria-label': t('head.summarize'),
            }, h(IconSummary, { size: 15 }))
            : null,
          h('button', {
            type: 'button',
            className: 'ct-icon-btn',
            onClick: onRefresh,
            title: t('head.refresh'),
            'aria-label': t('head.refresh'),
          }, loading ? h(Spinner, { size: 14 }) : h(IconRefresh, { size: 15 }))))
    }

    /**
     * One canvas for every conversation tree of the Workspace.
     *
     * A panel is the single-tree graph plus a header. All panels share one
     * coordinate space, so panning, zooming, fitting, keyboard navigation and
     * search work across the whole Workspace instead of per conversation.
     */
    function TreeCanvas({
      sections,
      bounds,
      compact = false,
      selectedId,
      center,
      onSelect,
      onOpen,
      onFocus,
      onEscape,
      onToggleCollapse,
      onTogglePanel,
    }) {
      const viewportRef = React.useRef(null)
      const [view, setView] = React.useState({ x: 0, y: 0, scale: 1 })
      const [dragging, setDragging] = React.useState(false)
      // A compositor layer is smooth while the canvas moves, but it freezes the
      // raster at the scale it had: a zoomed tree would stay a stretched bitmap
      // of its 100% self. Promote the stage only during a gesture and drop the
      // hint afterwards, which repaints it at the final scale.
      const [live, setLive] = React.useState(false)
      const liveTimer = React.useRef(0)
      const markLive = React.useCallback((linger = 240) => {
        setLive(true)
        window.clearTimeout(liveTimer.current)
        liveTimer.current = window.setTimeout(() => setLive(false), linger)
      }, [])
      React.useEffect(() => () => window.clearTimeout(liveTimer.current), [])
      const viewRef = React.useRef(view)
      viewRef.current = view
      const touched = React.useRef(false)
      const pan = React.useRef(null)
      const pointers = React.useRef(new Map())
      const pinch = React.useRef(0)
      const centeredSeq = React.useRef(-1)
      const located = React.useMemo(() => {
        const map = new Map()
        for (const section of sections) {
          for (const entry of section.graph.nodes) map.set(entry.id, { entry, section })
        }
        return map
      }, [sections])
      const locatedRef = React.useRef(located)
      locatedRef.current = located

      const fit = React.useCallback(() => {
        const viewport = viewportRef.current
        if (viewport === null) return
        const width = viewport.clientWidth
        const height = viewport.clientHeight
        if (width <= 0 || height <= 0 || bounds.width <= 0 || bounds.height <= 0) return
        const padding = 20
        const widthScale = (width - padding * 2) / bounds.width
        const heightScale = (height - padding * 2) / bounds.height
        const scale = Math.min(FIT_MAX_SCALE, Math.max(0.2, compact ? widthScale : Math.min(widthScale, heightScale)))
        setView({
          x: (width - bounds.width * scale) / 2,
          y: compact ? padding : (height - bounds.height * scale) / 2,
          scale,
        })
        touched.current = false
        markLive(120)
      }, [bounds, compact, markLive])

      const zoomAt = React.useCallback((clientX, clientY, factor) => {
        const viewport = viewportRef.current
        if (viewport === null) return
        const rect = viewport.getBoundingClientRect()
        const current = viewRef.current
        const nextScale = Math.min(2, Math.max(0.2, current.scale * factor))
        if (nextScale === current.scale) return
        const pointX = (clientX - rect.left - current.x) / current.scale
        const pointY = (clientY - rect.top - current.y) / current.scale
        setView({
          scale: nextScale,
          x: clientX - rect.left - pointX * nextScale,
          y: clientY - rect.top - pointY * nextScale,
        })
        touched.current = true
        markLive()
      }, [markLive])

      function zoomBy(factor) {
        const viewport = viewportRef.current
        if (viewport === null) return
        const rect = viewport.getBoundingClientRect()
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
      }

      // Fit once, then keep the user's pan: only a new conversation joining the
      // canvas (or a viewport resize before the first manual move) may recenter.
      const autoFit = React.useRef({ key: '', count: 0 })
      React.useLayoutEffect(() => {
        const key = `${Math.round(bounds.width)}x${Math.round(bounds.height)}`
        const previous = autoFit.current
        const countChanged = previous.count !== sections.length
        autoFit.current = { key, count: sections.length }
        if (!touched.current || countChanged || previous.key === '') fit()
      }, [bounds.width, bounds.height, sections.length, fit])

      React.useEffect(() => {
        const viewport = viewportRef.current
        if (viewport === null || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => {
          if (!touched.current) fit()
        })
        observer.observe(viewport)
        return () => observer.disconnect()
      }, [fit])

      React.useEffect(() => {
        const viewport = viewportRef.current
        if (viewport === null) return undefined
        function onWheel(event) {
          event.preventDefault()
          zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015))
        }
        viewport.addEventListener('wheel', onWheel, { passive: false })
        return () => viewport.removeEventListener('wheel', onWheel)
      }, [zoomAt])

      // Center the focused node when the selection came from the keyboard or a
      // search, without fighting a manual pan.
      React.useEffect(() => {
        if (center === null || center === undefined || center.seq === centeredSeq.current) return
        const hit = locatedRef.current.get(center.id)
        const viewport = viewportRef.current
        if (hit === undefined || viewport === null) return
        centeredSeq.current = center.seq
        const current = viewRef.current
        const pointX = hit.section.x + hit.entry.x + hit.entry.width / 2
        const pointY = hit.section.y + (hit.section.headerHeight ?? PANEL_HEADER) + hit.entry.y + hit.entry.height / 2
        setView({
          scale: current.scale,
          x: viewport.clientWidth / 2 - pointX * current.scale,
          y: viewport.clientHeight / 2 - pointY * current.scale,
        })
        touched.current = true
      }, [center])

      function onKeyDown(event) {
        if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return
        const ordered = [...located.values()]
          .sort((a, b) => (
            a.section.y + a.entry.y - (b.section.y + b.entry.y)
            || a.section.x + a.entry.x - (b.section.x + b.entry.x)
          ))
          .map((hit) => hit.entry)
        if (ordered.length === 0) return
        const index = ordered.findIndex((entry) => entry.id === selectedId)
        const move = (next) => {
          event.preventDefault()
          const target = ordered[Math.max(0, Math.min(ordered.length - 1, next))]
          if (target !== undefined && typeof onFocus === 'function') onFocus(target.id)
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') return move(index + 1)
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') return move(index - 1)
        if (event.key === 'Home') return move(0)
        if (event.key === 'End') return move(ordered.length - 1)
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          zoomBy(1.15)
          return
        }
        if (event.key === '-') {
          event.preventDefault()
          zoomBy(1 / 1.15)
          return
        }
        if (event.key === 'f') {
          event.preventDefault()
          fit()
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          const hit = located.get(selectedId)
          if (hit === undefined) return
          event.preventDefault()
          onOpen(hit.entry)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          if (typeof onEscape === 'function') onEscape()
        }
      }

      function onPointerDown(event) {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointers.current.size >= 2) {
          pan.current = null
          pinch.current = 0
          setDragging(false)
          return
        }
        if (event.button !== 0) return
        // Header buttons and the zoom pill must receive their own clicks; only
        // the empty canvas and the nodes participate in dragging/selection.
        if (event.target?.closest?.('.ct-panel-head') !== null && event.target?.closest?.('.ct-panel-head') !== undefined) return
        if (event.target?.closest?.('.ct-zoom') !== null && event.target?.closest?.('.ct-zoom') !== undefined) return
        // Clicking the graph should arm the keyboard shortcuts as well.
        event.currentTarget.focus?.({ preventScroll: true })
        if (event.target?.closest?.('.ct-node') !== null && event.target?.closest?.('.ct-node') !== undefined) return
        pan.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          origin: viewRef.current,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setDragging(true)
        markLive(1200)
      }

      function onPointerMove(event) {
        if (pointers.current.has(event.pointerId)) {
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        }
        // Two fingers pinch: scale around their midpoint and ignore panning.
        if (pointers.current.size >= 2) {
          const [first, second] = [...pointers.current.values()]
          const distance = Math.hypot(first.x - second.x, first.y - second.y)
          const previous = pinch.current
          pinch.current = distance
          if (previous > 0 && distance > 0) {
            zoomAt((first.x + second.x) / 2, (first.y + second.y) / 2, distance / previous)
          }
          return
        }
        const current = pan.current
        if (current === null) return
        setView({
          ...current.origin,
          x: current.origin.x + event.clientX - current.x,
          y: current.origin.y + event.clientY - current.y,
        })
        touched.current = true
        markLive(600)
      }

      function endPan(event) {
        pointers.current.delete(event?.pointerId)
        if (pointers.current.size < 2) pinch.current = 0
        if (pan.current === null) return
        pan.current = null
        setDragging(false)
        // Release the compositor layer so the canvas repaints at this scale.
        markLive(120)
      }

      const zoomLabel = `${Math.round(view.scale * 100)}%`

      return h('div', {
        className: 'ct-canvas',
        ref: viewportRef,
        'data-dragging': dragging ? 'true' : 'false',
        role: 'group',
        tabIndex: 0,
        'aria-label': t('graph.label'),
        'aria-description': t('graph.hint'),
        onKeyDown,
        onPointerDown,
        onPointerMove,
        onPointerUp: endPan,
        onPointerCancel: endPan,
      },
        h('div', {
          className: live ? 'ct-stage ct-stage-live' : 'ct-stage',
          // Whole pixels for the pan keep hairline borders off half-pixel
          // boundaries; the scale carries its own precision.
          style: {
            transform: `translate(${Math.round(view.x)}px, ${Math.round(view.y)}px) scale(${Math.round(view.scale * 1000) / 1000})`,
            '--ct-scale': Math.round(view.scale * 1000) / 1000,
          },
        },
          h('svg', {
            className: 'ct-edges',
            width: bounds.width,
            height: bounds.height,
            viewBox: `0 0 ${bounds.width} ${bounds.height}`,
            'aria-hidden': true,
          }, sections.map((section) => (
            section.collapsed
              ? null
              : h('g', {
                key: section.key,
                transform: `translate(${section.x} ${section.y + (section.headerHeight ?? PANEL_HEADER)})`,
              }, section.graph.edges.map((edge) => {
                const parent = section.graph.byId.get(edge.parentId)
                const child = section.graph.byId.get(edge.childId)
                if (parent === undefined || child === undefined) return null
                return h('path', {
                  key: edge.id,
                  className: `ct-edge${edge.current ? ' ct-edge-current' : ''}`,
                  d: edgePath(parent, child),
                })
              }))
          ))),
          sections.map((section) => h(TreePanel, {
            key: section.key,
            section,
            selectedId,
            onSelect,
            onOpen,
            onToggleCollapse,
            onTogglePanel,
          }))),
        h('div', { className: 'ct-zoom', onPointerDown: (event) => event.stopPropagation() },
          h('button', {
            type: 'button',
            onClick: () => zoomBy(1 / 1.15),
            title: t('head.zoomOut'),
            'aria-label': t('head.zoomOut'),
          }, '−'),
          h('span', { className: 'ct-zoom-value' }, zoomLabel),
          h('button', {
            type: 'button',
            onClick: () => zoomBy(1.15),
            title: t('head.zoomIn'),
            'aria-label': t('head.zoomIn'),
          }, '+'),
          h('span', { className: 'ct-zoom-sep', 'aria-hidden': true }),
          h('button', {
            type: 'button',
            onClick: fit,
            title: t('head.fit'),
            'aria-label': t('head.fit'),
          }, h(IconFit, { size: 14 }))))
    }

    /** One conversation's tree, drawn at its place on the shared canvas. */
    function TreePanel({ section, selectedId, onSelect, onOpen, onToggleCollapse, onTogglePanel }) {
      const { model, graph, collapsed } = section
      const bare = (section.headerHeight ?? PANEL_HEADER) === 0
      const className = [
        'ct-panel',
        bare ? 'ct-panel-bare' : '',
        model.current ? 'ct-panel-current' : '',
        collapsed ? 'ct-panel-collapsed' : '',
      ].filter((token) => token !== '').join(' ')
      const toggleLabel = collapsed ? t('panel.expand') : t('panel.collapse')
      return h('section', {
        className,
        'data-root': model.id,
        style: {
          left: `${section.x}px`,
          top: `${section.y}px`,
          width: `${section.width}px`,
          height: `${section.height}px`,
        },
      },
        bare ? null : h('header', { className: 'ct-panel-head' },
          h('button', {
            type: 'button',
            className: 'ct-panel-chevron',
            onClick: onTogglePanel,
            'aria-expanded': !collapsed,
            title: toggleLabel,
            'aria-label': toggleLabel,
          }, h(IconChevron, { size: 13 })),
          h('button', {
            type: 'button',
            className: 'ct-panel-title',
            onClick: () => onSelect(model.id),
            title: model.title,
          }, model.title),
          model.current
            ? h('span', { className: 'ct-panel-badge ct-panel-badge-current' }, t('panel.current'))
            : null,
          model.rootArchived
            ? h('span', { className: 'ct-panel-badge' }, t('node.archived'))
            : null,
          model.branchCount > 0
            ? h('span', { className: 'ct-panel-badge' }, t('panel.branches', { count: model.branchCount }))
            : null,
          collapsed
            ? h('span', { className: 'ct-panel-badge' }, t('panel.collapsed'))
            : null,
          model.running && !collapsed
            ? h('span', { className: 'ct-panel-badge ct-panel-badge-running' }, t('node.running'))
            : null,
          Number.isFinite(model.updatedAt) && section.width >= 360
            ? h('span', { className: 'ct-panel-time' }, formatRelative(model.updatedAt))
            : null),
        collapsed
          ? null
          : h('div', { className: 'ct-panel-body' },
            graph.nodes.map((entry) => h(GraphNode, {
              key: entry.id,
              entry,
              selected: entry.id === selectedId,
              onSelect,
              onOpen,
              onToggleCollapse,
            })),
            graph.nodes.length === 1
              ? h('div', {
                className: 'ct-empty-note',
                style: {
                  left: `${graph.root.x}px`,
                  top: `${graph.root.y + graph.root.height + 12}px`,
                  width: `${graph.root.width}px`,
                },
              }, t('empty.branches'))
              : null))
    }

    function GraphNode({ entry, selected, onSelect, onOpen, onToggleCollapse }) {
      const status = statusOf(entry)
      const meta = []
      if (entry.node.turn !== null && entry.node.turn !== undefined) {
        meta.push(t('node.turnShort', { turn: entry.node.turn }))
      } else if (entry.parentId === null) {
        meta.push(t('node.rootShort'))
      }
      if (entry.archived) meta.push(t('node.archived'))
      else if (entry.pending) meta.push(t('node.pending'))
      if (entry.collapsed && entry.hiddenCount > 0) meta.push(t('node.hiddenCount', { count: entry.hiddenCount }))
      if (entry.usage !== null) meta.push(t('node.tokenShort', { count: formatCompact(entry.usage.total) }))
      const note = noteOf(entry.node)
      // The note is the user's own name for this branch; at a glance on the
      // canvas that is worth more than the turn and token counters, which stay
      // in the tooltip and the inspector.
      const detail = note === '' ? meta.join(' · ') : note
      const label = [entry.title, note, ...meta].filter((part) => part !== '').join(' · ')
      const className = [
        'ct-node',
        selected ? 'ct-node-selected' : '',
        entry.current ? 'ct-node-current' : '',
        entry.archived ? 'ct-node-archived' : '',
        entry.pending ? 'ct-node-pending' : '',
        entry.node?.relinked === true ? 'ct-node-relinked' : '',
        entry.parentId === null ? 'ct-node-root' : '',
        entry.dimmed ? 'ct-node-dimmed' : '',
        entry.highlight ? 'ct-node-match' : '',
      ].filter((token) => token !== '').join(' ')
      return h('div', {
        className,
        style: {
          left: `${entry.x}px`,
          top: `${entry.y}px`,
          width: `${entry.width}px`,
          height: `${entry.height}px`,
        },
        role: 'button',
        tabIndex: -1,
        onClick: (event) => onSelect(entry.id, event),
        onDoubleClick: () => onOpen(entry),
        'aria-pressed': selected,
        'aria-label': label,
        title: label,
      },
        h('span', { className: `ct-node-dot ct-node-dot-${status.key}`, 'aria-hidden': true }),
        h('span', { className: 'ct-node-copy' },
          h('span', { className: 'ct-node-title' }, entry.displayTitle),
          h('span', { className: note === '' ? 'ct-node-meta' : 'ct-node-meta ct-node-note' }, detail)),
        entry.hasChildren
          ? h('span', {
            className: `ct-node-toggle${entry.collapsed ? ' ct-node-toggle-closed' : ''}`,
            role: 'button',
            tabIndex: -1,
            title: entry.collapsed ? t('node.expand') : t('node.collapse'),
            'aria-label': entry.collapsed ? t('node.expand') : t('node.collapse'),
            'aria-expanded': !entry.collapsed,
            onClick: (event) => {
              event.stopPropagation()
              onToggleCollapse(entry.id)
            },
            onDoubleClick: (event) => event.stopPropagation(),
          }, h(IconChevron, { size: 12 }))
          : null,
        unreadAt(entry) > 0
          ? h('span', { className: 'ct-node-unread', 'aria-hidden': true })
          : null)
    }

    function NodeInspector({ entry, graph, onSelect, onOpen, onBring, onArchive, onDelete, onUnarchive, onNote, onCompare, onBranchHere, useSessionAccess }) {
      const [draft, setDraft] = React.useState(() => noteOf(entry.node))
      const [saving, setSaving] = React.useState(false)
      React.useEffect(() => {
        setDraft(noteOf(entry.node))
      }, [entry.id, entry.node.note])
      async function commitNote() {
        if (typeof onNote !== 'function' || saving) return
        const next = draft.trim()
        if (next === noteOf(entry.node)) return
        setSaving(true)
        try {
          await onNote(entry.id, next)
        } finally {
          setSaving(false)
        }
      }
      const canArchive = typeof useSessionAccess === 'function'
        ? useSessionAccess(entry.id, 'workspace/archiveSession')
        : true
      const canUnarchive = typeof useSessionAccess === 'function'
        ? useSessionAccess(entry.id, 'workspace/unarchiveSession')
        : true
      const status = statusOf(entry)
      const parent = entry.parentId === null ? null : graph.byId.get(entry.parentId) ?? null
      const usage = entry.usage
      const model = entry.model
      const isRoot = parent === null
      // A node adopted from a DSH-created fork has no registry edge, so it is
      // readable but not owned here: no archive, no delete, no subtree action.
      const external = entry.node?.external === true
      const canBring = graph.nodes.length > 1 && !entry.pending
      const trail = `${status.label} · ${t('inspector.branches', { count: entry.childCount })}`
      const statusTrail = external ? `${trail} · ${t('inspector.external')}` : trail
      const openLabel = entry.current ? t('inspector.goChat') : t('inspector.open')

      // What this node last said. Fetched for the selected node only, because
      // the forest payload intentionally carries no message text.
      const [peek, setPeek] = React.useState(null)
      React.useEffect(() => {
        let alive = true
        setPeek(null)
        if (entry.pending === true) return undefined
        store.peek(entry.id)
          .then((side) => { if (alive) setPeek(side ?? null) })
          .catch(() => { if (alive) setPeek(null) })
        return () => { alive = false }
      }, [entry.id])

      // The path from the root to this node, so a deep tree can be walked back
      // up without hunting for the parent on the canvas.
      const path = []
      for (let cursor = entry; cursor !== undefined && path.length < 40; cursor = cursor.parentId === null ? undefined : graph.byId.get(cursor.parentId)) {
        path.push(cursor)
      }
      path.reverse()
      const ancestors = path.slice(0, -1)
      const crumbs = ancestors.length <= 3
        ? ancestors
        : [ancestors[0], null, ...ancestors.slice(-2)]

      const usageRows = usage === null
        ? [t('inspector.uncached'), t('inspector.cacheRead'), t('inspector.cacheWrite'), t('inspector.output')].map((label) => (
          h('div', { className: 'ct-kv', key: label },
            h('dt', null, label),
            h('dd', null, t('inspector.noUsage')))
        ))
        : [
          h('div', { className: 'ct-kv', key: 'uncached' },
            h('dt', null, t('inspector.uncached')),
            h('dd', null, formatExact(usage.uncachedInput))),
          h('div', { className: 'ct-kv', key: 'cache-read' },
            h('dt', null, t('inspector.cacheRead')),
            h('dd', null, formatExact(usage.cacheRead))),
          h('div', { className: 'ct-kv', key: 'cache-write' },
            h('dt', null, t('inspector.cacheWrite')),
            h('dd', null, formatExact(usage.cacheWrite))),
          h('div', { className: 'ct-kv', key: 'output' },
            h('dt', null, t('inspector.output')),
            h('dd', null, formatExact(usage.output))),
        ]

      return h('aside', { className: 'ct-side', 'aria-label': entry.title },
        h('div', { className: 'ct-side-scroll' },
          ancestors.length === 0
            ? null
            : h('nav', { className: 'ct-crumbs', 'aria-label': t('inspector.path') },
              crumbs.map((ancestor, index) => (ancestor === null
                ? h('span', { key: `gap-${index}`, className: 'ct-crumb-gap' }, '…')
                : h('button', {
                  key: ancestor.id,
                  type: 'button',
                  className: 'ct-crumb',
                  title: ancestor.title,
                  onClick: () => onSelect(ancestor.id),
                }, ancestor.title)))),
          h('h2', { className: 'ct-side-title', title: entry.title }, entry.title),
          h('div', { className: 'ct-side-status' },
            h('span', { className: `ct-status-dot ct-status-dot-${status.key}`, 'aria-hidden': true }),
            h('span', null, statusTrail)),
          h('div', { className: 'ct-side-actions' },
            h('button', {
              type: 'button',
              className: 'ct-open-btn',
              onClick: () => onOpen(entry),
              disabled: entry.archived,
              title: entry.archived ? t('node.archivedOpen') : undefined,
            }, openLabel),
            h('button', {
              type: 'button',
              className: 'ct-btn-secondary',
              onClick: () => onBring(entry.id),
              disabled: !canBring,
              title: t('dock.title'),
            }, h(IconBring, { size: 14 }), h('span', null, t('dock.bring'))),
            h('button', {
              type: 'button',
              className: 'ct-btn-secondary',
              onClick: () => onCompare(entry.id),
              title: t('compare.hint'),
            }, h('span', null, t('compare.action')))),

          // Only the conversation being read is live in this Host; a closed
          // branch has no agent to fork, so the action is offered where it can
          // actually run instead of failing on click.
          entry.current && typeof onBranchHere === 'function'
            ? h('button', {
              type: 'button',
              className: 'ct-btn-secondary ct-side-wide',
              onClick: () => onBranchHere(entry.id),
              title: t('branch.hereHint'),
            }, h(IconTree, { size: 14 }), h('span', null, t('branch.here')))
            : null,

          h('div', { className: 'ct-note' },
            h('input', {
              className: 'ct-note-input',
              value: draft,
              maxLength: 40,
              placeholder: t('note.placeholder'),
              'aria-label': t('note.label'),
              disabled: saving,
              onChange: (event) => setDraft(event.target.value),
              onBlur: () => { void commitNote() },
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setDraft(noteOf(entry.node))
                }
              },
            })),

          h('section', { className: 'ct-section' },
            h('div', { className: 'ct-section-label' }, t('inspector.source')),
            h('div', { className: 'ct-source-line' },
              parent === null
                ? h('span', { className: 'ct-source-root' }, t('inspector.root'))
                : h('button', {
                  type: 'button',
                  className: 'ct-link',
                  onClick: () => onSelect(parent.id),
                  title: parent.title,
                }, parent.title),
              entry.node.turn !== null && entry.node.turn !== undefined
                ? h('span', { className: 'ct-source-turn' }, t('inspector.turn', { turn: entry.node.turn }))
                : null),
            entry.node.relinked === true
              ? h('p', { className: 'ct-source-note' }, t('inspector.relinked'))
              : entry.node.detached === true
                ? h('p', { className: 'ct-source-note' }, t('inspector.detached'))
                : null,
            isRoot
              ? null
              : h('div', { className: 'ct-kv' },
                h('span', null, t('inspector.level')),
                h('span', null, t('inspector.depth', { depth: entry.depth })))),

          entry.node.snippet !== null && entry.node.snippet !== undefined && entry.node.snippet.trim() !== ''
            ? h('section', { className: 'ct-section' },
              h('div', { className: 'ct-section-label' }, t('inspector.branchPoint')),
              h('p', { className: 'ct-snippet', title: entry.node.snippet }, entry.node.snippet))
            : null,

          peek !== null && (peek.lastUser !== '' || peek.lastAssistant !== '')
            ? h('section', { className: 'ct-section' },
              h('div', { className: 'ct-section-label' }, t('inspector.lastSaid')),
              peek.lastAssistant !== ''
                ? h('div', { className: 'ct-last' },
                  h('div', { className: 'ct-last-label' }, t('inspector.lastAssistant')),
                  h('p', { className: 'ct-last-text' }, peek.lastAssistant))
                : null,
              peek.lastUser !== ''
                ? h('div', { className: 'ct-last' },
                  h('div', { className: 'ct-last-label' }, t('inspector.lastUser')),
                  h('p', { className: 'ct-last-text' }, peek.lastUser))
                : null)
            : null,

          h('section', { className: 'ct-section' },
            h('div', { className: 'ct-section-label' }, t('inspector.model')),
            h('dl', { className: 'ct-kv-list' },
              h('div', { className: 'ct-kv' },
                h('dt', null, t('inspector.provider')),
                h('dd', { title: model?.provider ?? '' }, model?.provider || t('inspector.noUsage'))),
              h('div', { className: 'ct-kv' },
                h('dt', null, t('inspector.model')),
                h('dd', { title: model?.model ?? '' }, model?.model || t('inspector.noUsage'))),
              model?.reasoning
                ? h('div', { className: 'ct-kv' },
                  h('dt', null, t('inspector.reasoning')),
                  h('dd', null, model.reasoning))
                : null)),

          h('section', { className: 'ct-section' },
            h('div', { className: 'ct-section-label' }, t('inspector.activity')),
            h('dl', { className: 'ct-kv-list' },
              entry.turns !== null
                ? h('div', { className: 'ct-kv' },
                  h('dt', null, t('inspector.conversation')),
                  h('dd', null, t('inspector.turns', { turns: entry.turns, steps: entry.steps ?? 0 })))
                : null,
              Number.isFinite(entry.updatedAt)
                ? h('div', { className: 'ct-kv' },
                  h('dt', null, t('inspector.updated')),
                  h('dd', null, formatRelative(entry.updatedAt) || t('inspector.noUsage')))
                : null,
              Number.isFinite(entry.node.createdAt)
                ? h('div', { className: 'ct-kv' },
                  h('dt', null, t('inspector.created')),
                  h('dd', null, formatRelative(entry.node.createdAt) || t('inspector.noUsage')))
                : null,
              entry.workspace !== ''
                ? h('div', { className: 'ct-kv' },
                  h('dt', null, t('inspector.workspace')),
                  h('dd', { title: entry.workspace }, entry.workspace))
                : null)),

          // Usage last: it is a measurement of what happened, not the reason
          // this page exists. It used to open the panel with a 24px number.
          h('section', { className: 'ct-section' },
            h('div', { className: 'ct-section-label' }, t('inspector.usage')),
            h('div', { className: 'ct-usage-total' },
              h('span', { className: 'ct-usage-number' }, usage === null ? t('inspector.noUsage') : formatCompact(usage.total)),
              usage === null ? null : h('span', { className: 'ct-usage-unit' }, t('inspector.tokens')),
              usage !== null && usage.cacheHit !== null
                ? h('span', { className: 'ct-cache' }, t('inspector.cacheHit', { percent: usage.cacheHit }))
                : null),
            h('dl', { className: 'ct-kv-list' }, usageRows))),

        isRoot || external
          ? (isRoot && entry.archived
            ? h('div', { className: 'ct-side-danger' },
              h('button', {
                type: 'button',
                className: 'ct-text-btn',
                onClick: () => onUnarchive(entry.id),
                disabled: !canUnarchive,
              }, t('node.action.unarchive')))
            : null)
          : h('div', { className: 'ct-side-danger' },
            entry.archived
              ? h('button', {
                type: 'button',
                className: 'ct-text-btn',
                onClick: () => onUnarchive(entry.id),
                disabled: !canUnarchive,
              }, t('node.action.unarchive'))
              : h('button', {
                type: 'button',
                className: 'ct-text-btn',
                onClick: () => onArchive(entry.id),
                disabled: !canArchive || entry.pending,
              }, t('node.action.archive')),
            h('button', {
              type: 'button',
              className: 'ct-text-btn ct-text-danger',
              onClick: () => onDelete(entry.id),
              disabled: entry.pending,
              title: entry.pending ? t('node.pending') : undefined,
            }, t('node.action.delete'))))
    }

    function TreeSkeleton() {
      return h('section', { className: 'ct-page' },
        h('header', { className: 'ct-top' },
          h('div', { className: 'ct-top-title' },
            h('h1', { className: 'ct-h1' }, t('view.tree')),
            h('span', { className: 'ct-skeleton ct-skeleton-count' }))),
        h('div', { className: 'ct-body' },
          h('div', { className: 'ct-canvas' },
            h('div', { className: 'ct-skeleton ct-skeleton-node', style: { left: '32px', top: '96px' } }),
            h('div', { className: 'ct-skeleton ct-skeleton-node', style: { left: '32px', top: '208px' } }),
            h('div', { className: 'ct-skeleton ct-skeleton-node', style: { left: '228px', top: '208px' } })),
          h('aside', { className: 'ct-side' },
            h('div', { className: 'ct-side-scroll' },
              h('div', { className: 'ct-skeleton ct-skeleton-title' }),
              h('div', { className: 'ct-skeleton ct-skeleton-line' }),
              h('div', { className: 'ct-skeleton ct-skeleton-line' }),
              h('div', { className: 'ct-skeleton ct-skeleton-block' })))))
    }

    // ------------------------------------------------------------- workspace view

    /**
     * One element's rendered size, measured after layout and on resize.
     *
     * The canvas packer needs both axes: a Workspace of deep trees can trade
     * width for height, and no CSS rule can make that decision for it.
     */
    function useElementSize(ref) {
      const [size, setSize] = React.useState({ width: 0, height: 0 })
      React.useLayoutEffect(() => {
        const element = ref.current
        if (element === null || element === undefined) return undefined
        const measure = () => {
          const width = typeof element.clientWidth === 'number' ? element.clientWidth : 0
          const height = typeof element.clientHeight === 'number' ? element.clientHeight : 0
          setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
      }, [])
      return size
    }

    /**
     * Split ordered panels into columns of roughly equal height.
     *
     * Contiguous groups preserve reading order: the current conversation is the
     * first panel of the first column, and recency still runs down each column.
     * Every column receives at least one panel.
     */
    function splitColumns(panels, columns) {
      const total = panels.reduce((sum, panel) => sum + panel.height, 0) + PANEL_GAP * (panels.length - 1)
      const groups = []
      let start = 0
      let remaining = total
      for (let index = 0; index < columns; index += 1) {
        const columnsLeft = columns - index
        const limit = panels.length - (columnsLeft - 1)
        const share = remaining / columnsLeft
        let end = start
        let used = 0
        while (end < limit && (end === start || used + panels[end].height <= share)) {
          used += panels[end].height + PANEL_GAP
          end += 1
        }
        groups.push(panels.slice(start, end))
        remaining -= used
        start = end
      }
      return groups
    }

    /**
     * Place every conversation tree on one canvas.
     *
     * Panels keep the order the page already has (current conversation first,
     * then recency). One column is the default because a tree reads top to
     * bottom; extra columns are used only when they measurably raise the scale
     * at which the whole Workspace still fits. That matters when one deep tree
     * would otherwise squeeze every label into a smear, and it never rearranges
     * a Workspace that already fits in a single readable column.
     */
    function layoutPanels(items, viewport, collapsed = new Set()) {
      // One tree needs no header: the root node already carries its name, and a
      // heading above a lone tree only repeated it. Headers come back as soon
      // as the canvas holds more than one tree, where they are the only way to
      // tell the panels apart.
      const headerHeight = items.length > 1 ? PANEL_HEADER : 0
      const panels = []
      for (const item of items) {
        const isCollapsed = collapsed instanceof Set && collapsed.has(item.key)
        const graph = item.graph
        const naturalWidth = Math.max(240, graph.bounds.width)
        panels.push({
          key: item.key,
          model: item.model,
          graph,
          collapsed: isCollapsed,
          headerHeight,
          width: isCollapsed ? Math.min(naturalWidth, 360) : naturalWidth,
          height: headerHeight + (isCollapsed ? 0 : graph.bounds.height),
        })
      }
      if (panels.length === 0) return { sections: [], bounds: { width: 0, height: 0 } }

      const viewportWidth = Number.isFinite(viewport?.width) && viewport.width > 0 ? viewport.width : 960
      const viewportHeight = Number.isFinite(viewport?.height) && viewport.height > 0 ? viewport.height : 640
      const fitScale = (width, height) => Math.min(
        1,
        (viewportWidth - 40) / Math.max(1, width),
        (viewportHeight - 40) / Math.max(1, height),
      )

      let best = null
      const maxColumns = Math.min(MAX_COLUMNS, panels.length)
      for (let columns = 1; columns <= maxColumns; columns += 1) {
        const groups = splitColumns(panels, columns)
        const widths = groups.map((group) => Math.max(...group.map((panel) => panel.width)))
        const heights = groups.map((group) => (
          group.reduce((sum, panel) => sum + panel.height, 0) + PANEL_GAP * (group.length - 1)
        ))
        const width = widths.reduce((sum, value) => sum + value, 0) + PANEL_GAP * (columns - 1)
        const height = Math.max(...heights)
        const scale = fitScale(width, height)
        if (best === null || scale > best.scale + 0.02) {
          best = { scale, groups, widths, width, height }
        }
      }

      const sections = []
      let left = 0
      for (let index = 0; index < best.groups.length; index += 1) {
        let top = 0
        for (const panel of best.groups[index]) {
          sections.push({ ...panel, x: left, y: top })
          top += panel.height + PANEL_GAP
        }
        left += best.widths[index] + PANEL_GAP
      }
      return { sections, bounds: { width: best.width, height: best.height } }
    }

    /**
     * The 对话树 view, scoped to the Workspace of the current session.
     *
     * Every conversation of that Workspace — including the ones that never
     * branched — is its own tree panel on one shared canvas. The page keeps the
     * single-tree reading order for the conversation being read, and the whole
     * Workspace stays one surface to pan, zoom, search and inspect.
     */
    /**
     * One conversation tree as an indented Markdown outline.
     *
     * Built from the payload the page already holds: exporting must not cost a
     * request or another read of every session log.
     */
    function treeMarkdown(model, sessions) {
      const nodes = Array.isArray(model?.tree?.nodes) ? model.tree.nodes : []
      if (nodes.length === 0) return ''
      const children = new Map()
      for (const node of nodes) {
        if (node.parentId === null || node.parentId === undefined) continue
        const list = children.get(node.parentId)
        if (list === undefined) children.set(node.parentId, [node])
        else list.push(node)
      }
      const root = nodes.find((node) => node.parentId === null || node.parentId === undefined) ?? nodes[0]
      const lines = []
      const walk = (node, depth) => {
        const suffix = [noteOf(node)]
          .filter((part) => part !== '')
          .join(' · ')
        const title = titleOfNode(sessions, node) || node.id
        lines.push(`${'    '.repeat(depth)}- ${title}${suffix === '' ? '' : ` — ${suffix}`}`)
        for (const child of children.get(node.id) ?? []) walk(child, depth + 1)
      }
      walk(root, 0)
      return lines.join('\n')
    }

    /** Hand a generated text file to the browser. */
    function downloadText(name, text) {
      try {
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = name
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        return true
      } catch {
        return false
      }
    }

    /**
     * When this tree first branched, for the creation-order toggle.
     *
     * A tree that never branched has no edge timestamps at all; it sorts last
     * instead of pretending to be newest.
     */
    function treeCreatedAt(model) {
      let earliest = Number.POSITIVE_INFINITY
      for (const node of model?.tree?.nodes ?? []) {
        if (Number.isFinite(node?.createdAt)) earliest = Math.min(earliest, node.createdAt)
      }
      return Number.isFinite(earliest) ? earliest : Number.MAX_SAFE_INTEGER
    }

    function TreeView({ sessionId, useSessions, useWorkspaces, useSessionAccess, openView }) {
      const state = useStore()
      const sessions = useSessions((value) => value)
      const workspaces = useWorkspaces((value) => value)
      const archived = React.useMemo(() => archivedSetOf(workspaces), [workspaces])
      const workspace = React.useMemo(() => workspaceView(workspaces, sessionId), [workspaces, sessionId])
      // The host resolves membership; this key only decides when to ask again
      // because the client's workspace view saw a conversation appear or leave.
      const membershipKey = workspace.sessionIds.join('|')
      const compact = useCompactLayout()
      const forest = state.forests[workspace.key]
      const loading = state.forestLoading[workspace.key] === true
      const error = state.forestErrors[workspace.key]
      const notice = state.notices[sessionId]
      const [query, setQuery] = React.useState('')
      const [showArchived, setShowArchived] = React.useState(false)
      const [collapsedPanels, setCollapsedPanels] = React.useState(() => new Set())
      const [collapsedNodes, setCollapsedNodes] = React.useState(() => new Set())
      const [selectedId, setSelectedId] = React.useState(null)
      // Armed by the inspector's Compare button: the next node becomes the
      // other side. Shift-click skips the arming step.
      const [comparePick, setComparePick] = React.useState(false)
      // A conversation that never branched still owns a one-node tree. Next to
      // a real tree that card has no edges at all, so it reads as clutter on a
      // canvas whose whole subject is branching. The page's own conversation
      // always stays; the rest is one click away.
      const [showSingles, setShowSingles] = React.useState(false)
      // Newest activity is the useful order while working; creation order is
      // the useful order while reviewing what was tried and when.
      const [createdOrder, setCreatedOrder] = React.useState(false)
      const [focused, setFocused] = React.useState(false)
      const [center, setCenter] = React.useState(null)
      const centerSeq = React.useRef(0)
      const hostRef = React.useRef(null)
      const viewport = useElementSize(hostRef)

      React.useEffect(() => {
        void store.loadForest(workspace.key, sessionId)
      }, [workspace.key, sessionId, membershipKey, state.forestEpoch])

      // Opening a node calls openSession(..., { forceChat: true }); the fresh
      // page must land on Chat even if that conversation last remembered the
      // tree view. The flag is consumed here, by the page that opens next.
      React.useEffect(() => {
        if (typeof openView !== 'function') return
        const pendingSince = pendingChatSwitch.get(sessionId)
        if (pendingSince === undefined) return
        pendingChatSwitch.delete(sessionId)
        if (Date.now() - pendingSince > 3000) return
        openView('chat', 'conversation-tree')
      }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

      React.useEffect(() => {
        setCollapsedPanels(new Set())
        setCollapsedNodes(new Set())
        setSelectedId(null)
        setComparePick(false)
        setCenter(null)
      }, [workspace.key])

      const projection = React.useMemo(() => forestModels(forest, {
        sessions,
        archived,
        showArchived,
        currentSessionId: sessionId,
      }), [forest, sessions, archived, showArchived, sessionId])

      // The page's own conversation is the only node allowed to read as
      // “current”; another panel's root is just that tree's root.
      const panelOrder = React.useRef({ key: '', rank: new Map() })
      const items = React.useMemo(() => {
        // Freeze each panel's place while the page is open. Recency may change
        // under a running conversation, and a tree jumping across the canvas
        // while it is being read is worse than a slightly stale order. New
        // conversations append; a workspace switch starts the ranking over.
        const order = panelOrder.current
        if (order.key !== workspace.key) {
          order.key = workspace.key
          order.rank = new Map()
        }
        const alive = new Set(projection.models.map((model) => model.id))
        for (const id of [...order.rank.keys()]) {
          if (!alive.has(id)) order.rank.delete(id)
        }
        let next = 0
        for (const rank of order.rank.values()) next = Math.max(next, rank + 1)
        for (const model of projection.models) {
          if (!order.rank.has(model.id)) order.rank.set(model.id, next++)
        }
        const models = [...projection.models].sort((a, b) => {
          if (a.current !== b.current) return a.current ? -1 : 1
          if (createdOrder) return treeCreatedAt(a) - treeCreatedAt(b)
          return (order.rank.get(a.id) ?? 0) - (order.rank.get(b.id) ?? 0)
        })
        const out = []
        for (const model of models) {
          const currentId = model.tree.nodes.some((node) => node.id === sessionId) ? sessionId : ''
          const graph = buildGraph({ ...model.tree, currentId }, {
            sessions,
            archived,
            showArchived,
            collapsed: collapsedNodes,
            query,
            compact,
          })
          if (graph !== null) out.push({ key: model.id, model, graph })
        }
        return out
      }, [projection, sessions, archived, showArchived, collapsedNodes, query, compact, sessionId, workspace.key, createdOrder])

      const visibleItems = React.useMemo(() => {
        const base = focused ? items.filter((item) => item.model.current) : items
        if (showSingles || base.length <= 1) return base
        const branched = base.filter((item) => item.model.branchCount > 0 || item.model.current)
        return branched.length === 0 ? base : branched
      }, [items, showSingles, focused])
      const hiddenSingles = focused ? 0 : items.length - visibleItems.length

      const layout = React.useMemo(
        () => layoutPanels(visibleItems, viewport, collapsedPanels),
        [visibleItems, viewport, collapsedPanels],
      )
      const sections = layout.sections
      const located = React.useMemo(() => {
        const map = new Map()
        for (const section of sections) {
          for (const entry of section.graph.nodes) map.set(entry.id, { entry, section })
        }
        return map
      }, [sections])

      const focusNode = React.useCallback((id) => {
        if (typeof id !== 'string' || id === '') return
        centerSeq.current += 1
        setSelectedId(id)
        setCenter({ id, seq: centerSeq.current })
      }, [])

      /** Open the comparison dialog for two nodes. */
      const startCompare = React.useCallback(async (left, right) => {
        setComparePick(false)
        if (typeof left !== 'string' || typeof right !== 'string' || left === '' || left === right) return
        try {
          await store.compare([left, right])
        } catch (failure) {
          store.toast('error', friendlyError(failure))
        }
      }, [])

      /** Select one node; Shift (or an armed pick) turns the click into a compare. */
      const selectNode = React.useCallback((nodeId, event) => {
        if (typeof nodeId !== 'string' || nodeId === '') return
        if (comparePick) {
          void startCompare(selectedId ?? nodeId, nodeId)
          return
        }
        if (event?.shiftKey === true && selectedId !== null && selectedId !== nodeId) {
          void startCompare(selectedId, nodeId)
          return
        }
        markSeen(nodeId)
        setSelectedId(nodeId)
      }, [comparePick, selectedId, startCompare])

      React.useEffect(() => {
        if (located.size === 0) {
          if (selectedId !== null) setSelectedId(null)
          return
        }
        if (selectedId !== null && located.has(selectedId)) return
        if (located.has(sessionId)) {
          markSeen(sessionId)
          setSelectedId(sessionId)
          return
        }
        const preferred = sections.find((section) => section.model.current) ?? sections[0]
        setSelectedId(preferred?.graph.current?.id ?? null)
      }, [located, sections, selectedId, sessionId])

      // A search moves the canvas to the first hit, so a deep Workspace cannot
      // leave the answer outside the viewport.
      React.useEffect(() => {
        if (query.trim() === '') return
        for (const section of sections) {
          const hit = section.graph.nodes.find((entry) => entry.highlight)
          if (hit === undefined) continue
          // A collapsed panel would center on a node nobody can see; unfold it
          // before moving the canvas there.
          if (section.collapsed) {
            setCollapsedPanels((current) => {
              if (!current.has(section.key)) return current
              const next = new Set(current)
              next.delete(section.key)
              return next
            })
          }
          focusNode(hit.id)
          return
        }
        // Runs on a new query (or when the forest first arrives) only;
        // refreshes must not move the page.
      }, [query, sections.length]) // eslint-disable-line react-hooks/exhaustive-deps

      async function refresh() {
        const next = await store.loadForest(workspace.key, sessionId, { force: true })
        if (next === undefined) {
          const failure = store.get().forestErrors[workspace.key]
          if (failure !== undefined) store.toast('error', failure)
        }
      }

      // A conversation deleted from the sidebar leaves the Workspace while this
      // page is still open; the canvas would keep drawing a node nothing can
      // open until the next manual refresh. Revalidate when the page regains
      // focus — the store's short cache keeps that from becoming a request per
      // click, and the Host repairs the edges on the read that follows.
      React.useEffect(() => {
        function onFocus() {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
          void store.loadForest(workspace.key, sessionId)
        }
        window.addEventListener('focus', onFocus)
        document.addEventListener('visibilitychange', onFocus)
        return () => {
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onFocus)
        }
      }, [workspace.key, sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

      function fallbackFor(model, nodeId) {
        const removed = new Set(subtreeOf(model.tree, nodeId).map((node) => node.id))
        for (const other of projection.models) {
          if (other.id === model.id) continue
          const candidate = other.tree.nodes.find((node) => !removed.has(node.id))
          if (candidate !== undefined) return candidate.id
        }
        const inside = model.tree.nodes.find((node) => !removed.has(node.id))
        return inside?.id ?? null
      }

      function openNodeById(nodeId) {
        if (nodeId === sessionId) {
          if (typeof openView === 'function') openView('chat', 'conversation-tree')
          return
        }
        openSession(nodeId, { forceChat: true })
      }

      function openEntry(entry) {
        const id = typeof entry === 'string' ? entry : entry?.node?.id ?? entry?.id
        if (id === undefined) return
        if (archived.has(id)) {
          store.toast('info', t('node.archivedOpen'))
          return
        }
        markSeen(id)
        openNodeById(id)
      }

      function togglePanel(rootId) {
        setCollapsedPanels((current) => {
          const next = new Set(current)
          if (next.has(rootId)) next.delete(rootId)
          else next.add(rootId)
          return next
        })
      }

      function toggleNode(nodeId) {
        setCollapsedNodes((current) => {
          const next = new Set(current)
          if (next.has(nodeId)) next.delete(nodeId)
          else next.add(nodeId)
          return next
        })
      }

      function requestArchive(nodeId) {
        const hit = located.get(nodeId)
        if (hit === undefined || hit.entry?.node?.external === true) return
        const model = hit.section.model
        const subtree = subtreeOf(model.tree, nodeId)
        // Archiving a running conversation stops its activity, so a leaf needs
        // the same confirmation a subtree already gets.
        if (subtree.length > 1 || sessionOf(sessions, nodeId)?.running === true) {
          store.openDialog({
            kind: 'confirm',
            action: 'archive',
            sessionId,
            nodeId,
            fallbackSessionId: fallbackFor(model, nodeId),
          })
          return
        }
        void runArchive(model.tree, nodeId, sessionId, fallbackFor(model, nodeId))
          .catch((failure) => store.toast('error', friendlyError(failure)))
      }

      function requestDelete(nodeId) {
        const hit = located.get(nodeId)
        if (hit === undefined || hit.entry?.node?.external === true) return
        const model = hit.section.model
        store.openDialog({
          kind: 'confirm',
          action: 'delete',
          sessionId,
          nodeId,
          fallbackSessionId: fallbackFor(model, nodeId),
        })
      }

      const matchedCount = sections.reduce((total, section) => total + section.graph.matchedCount, 0)
      const truncated = forest?.truncated === true
      const counts = workspace.title !== ''
        ? t('head.workspaceCount', {
          workspace: workspace.title,
          conversations: projection.conversationCount,
          branches: projection.branchCount,
        })
        : t('head.forestCount', {
          conversations: projection.conversationCount,
          branches: projection.branchCount,
        })

      /** Fork the newest completed turn of this conversation, from the tree page. */
      async function branchFromLatest(nodeId) {
        store.setNotice(sessionId, { kind: 'working', text: t('branch.creating') })
        try {
          const body = await requestJson(BRANCH_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ parentSessionId: nodeId, latest: true }),
          })
          const childId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          if (childId === '') throw new Error(t('error.unknown'))
          store.invalidateTrees()
          refreshSessionList()
          store.toast('success', t('notice.branchCreated'))
          await waitForSession(childId)
          openSession(childId)
        } catch (failure) {
          store.toast('error', friendlyError(failure))
        } finally {
          store.clearNotice(sessionId)
        }
      }

      // A tree worth reading is often a tree worth sending to someone.
      function exportMarkdown() {        const heading = workspace.title === '' ? t('view.tree') : `${t('view.tree')} · ${workspace.title}`
        const parts = [`# ${heading}`, '']
        for (const item of items) parts.push(treeMarkdown(item.model, sessions), '')
        const body = `${parts.join('\n').trimEnd()}\n`
        const suffix = workspace.title === '' ? '' : `-${workspace.title.replace(/[\\/:*?"<>|\s]+/g, '-')}`
        if (!downloadText(`conversation-tree${suffix}.md`, body)) {
          store.toast('error', t('error.unknown'))
          return
        }
        store.toast('success', t('notice.exported', { count: items.length }))
      }

      const header = h(TreeHeader, {
        counts,
        matched: query.trim() === '' ? null : matchedCount,
        hasArchived: projection.hasArchived,
        loading,
        notice,
        onRefresh: refresh,
        query,
        onQuery: setQuery,
        showArchived,
        onToggleArchived: () => setShowArchived((value) => !value),
        createdOrder,
        onToggleOrder: () => setCreatedOrder((value) => !value),
        canFocus: items.length > 1,
        focused,
        onToggleFocus: () => setFocused((value) => !value),
        onExport: exportMarkdown,
        onSummarize: () => store.openDialog({ kind: 'summary', sessionId }),
      })

      if (forest === undefined) {
        if (error !== undefined && loading !== true) {
          return h('section', { className: 'ct-page' },
            header,
            h('div', { className: 'ct-state' },
              h('p', null, error),
              h('button', { type: 'button', className: 'ct-btn', onClick: refresh }, t('head.retry'))))
        }
        return h(TreeSkeleton)
      }

      const fallbackSection = sections.find((section) => section.model.current) ?? sections[0] ?? null
      const selectedHit = (selectedId !== null ? located.get(selectedId) : undefined) ?? null
      const ownHit = located.get(sessionId) ?? null
      const selectedSection = selectedHit?.section ?? ownHit?.section ?? fallbackSection
      const selectedEntry = selectedHit?.entry ?? ownHit?.entry ?? selectedSection?.graph.current ?? null

      const emptyText = projection.hasArchived && !showArchived
        ? t('forest.archivedOnly')
        : t('forest.empty')
      const empty = sections.length === 0
        ? h('div', { className: 'ct-canvas-empty' },
          h(IconTree, { size: 22 }),
          h('p', null, emptyText))
        : null
      const notes = []
      if (comparePick) notes.push(t('compare.pick'))
      if (query.trim() !== '' && matchedCount === 0 && sections.length > 0) notes.push(t('forest.noMatch'))
      if (truncated) notes.push(t('forest.truncated', { count: forest?.memberCount ?? projection.conversationCount }))
      if (forest?.statsTruncated === true) notes.push(t('forest.statsPartial'))

      return h('section', { className: 'ct-page' },
        header,
        h('div', { className: 'ct-body' },
          h('div', { className: 'ct-canvas-host', ref: hostRef },
            empty,
            empty === null
              ? h(TreeCanvas, {
                key: workspace.key,
                sections,
                bounds: layout.bounds,
                compact,
                selectedId: selectedEntry?.id ?? null,
                center,
                onSelect: selectNode,
                onOpen: openEntry,
                onFocus: focusNode,
                onEscape: () => {
                  setQuery('')
                  setComparePick(false)
                },
                onToggleCollapse: toggleNode,
                onTogglePanel: togglePanel,
              })
              : null,
            hiddenSingles > 0 || showSingles || notes.length > 0
              ? h('div', { className: 'ct-canvas-notes' },
                notes.map((text) => h('p', { key: text, className: 'ct-canvas-note' }, text)),
                hiddenSingles > 0 || showSingles
                  ? h('button', {
                    key: 'singles',
                    type: 'button',
                    className: 'ct-canvas-note ct-canvas-toggle',
                    onClick: () => setShowSingles((value) => !value),
                  }, showSingles
                    ? t('forest.hideSingles')
                    : t('forest.showSingles', { count: hiddenSingles }))
                  : null)
              : null),
          selectedEntry === null || selectedSection === null
            ? null
            : h(NodeInspector, {
              entry: selectedEntry,
              graph: selectedSection.graph,
              onSelect: setSelectedId,
              onOpen: openEntry,
              onBring: (nodeId) => store.openDialog({
                kind: 'target',
                sessionId,
                sourceId: nodeId,
                rootId: selectedSection?.model.tree.rootId ?? nodeId,
              }),
              onArchive: requestArchive,
              onDelete: requestDelete,
              onNote: async (nodeId, note) => {
                try {
                  await store.saveNote(nodeId, note)
                  store.toast('success', t('note.saved'))
                } catch (failure) {
                  store.toast('error', friendlyError(failure))
                }
              },
              onCompare: (nodeId) => {
                if (selectedId !== null && selectedId !== nodeId) void startCompare(selectedId, nodeId)
                else setComparePick(true)
              },
              onBranchHere: (nodeId) => { void branchFromLatest(nodeId) },
              onUnarchive: (nodeId) => {
                void runUnarchive(nodeId, sessionId).catch((failure) => store.toast('error', friendlyError(failure)))
              },
              useSessionAccess,
            })))
    }

    // ------------------------------------------------------------ branch action

    function BranchAction({ sessionId, seq, turn, useAccess }) {
      const [busy, setBusy] = React.useState(false)
      const allowed = typeof useAccess === 'function' ? useAccess('session/fork') : true
      // The TurnTail slot's `seq` is the closing Assistant message, while the
      // durable fork boundary is the enclosing Turn's turn/end event.
      const boundary = Number.isSafeInteger(turn?.end?.seq) ? turn.end.seq : seq
      if (!Number.isSafeInteger(boundary)) return null

      async function create() {
        if (busy || !allowed) return
        setBusy(true)
        try {
          const body = await requestJson(BRANCH_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ parentSessionId: sessionId, atSeq: boundary }),
          })
          const childId = typeof body?.sessionId === 'string' ? body.sessionId : ''
          if (childId === '') throw new Error(t('error.unknown'))
          store.invalidateTrees()
          refreshSessionList()
          store.toast('success', t('notice.branchCreated'))
          await waitForSession(childId)
          openSession(childId)
        } catch (error) {
          store.toast('error', friendlyError(error))
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'ct-branch-row' },
        h('button', {
          type: 'button',
          className: 'ct-branch-action',
          onClick: create,
          disabled: busy || !allowed,
          title: allowed ? t('branch.hint') : t('error.subagent-not-supported'),
          'aria-label': t('branch.action'),
        },
          busy ? h(Spinner, { size: 13 }) : h(IconBranch, { size: 14 }),
          h('span', null, busy ? t('branch.creating') : t('branch.action'))))
    }

    // ----------------------------------------------------------- composer dock

    /**
     * A native-sized dock action. The composer dock is a row of quiet stat
     * pills; this mirrors their geometry and hover treatment instead of
     * introducing a second boxed surface beside them.
     */
    function TreeDockAction({ sessionId }) {
      const state = useStore()
      const tree = state.trees[sessionId]
      React.useEffect(() => {
        void store.loadTree(sessionId)
      }, [sessionId])
      if (tree === undefined || !Array.isArray(tree.nodes) || tree.nodes.length <= 1) return null
      const node = tree.nodes.find((candidate) => candidate.id === sessionId)
      if (node === undefined) return null
      return h('button', {
        type: 'button',
        className: 'ct-dock-pill',
        'data-composer-stat': 'tree-bring',
        title: t('dock.title'),
        'aria-label': t('dock.title'),
        onClick: () => store.openDialog({ kind: 'target', sessionId, sourceId: sessionId, rootId: tree.rootId }),
      },
        h(IconBring, { size: 14 }),
        h('span', null, t('dock.bring')))
    }

    // ---------------------------------------------------------------- overlays

    /** One side's column: what it did, what it cost, how it ended. */
    function CompareSide({ side, sessions }) {
      const usage = tokenStatsFromCounts(side.usage)
      const title = titleOfNode(sessions, { id: side.id, title: side.title })
      const model = side.model === null || typeof side.model !== 'object' ? null : side.model
      return h('section', { className: 'ct-compare-col' },
        h('h3', { className: 'ct-compare-title', title }, title),
        h('div', { className: 'ct-compare-facts' },
          h('span', null, t('compare.turns', { turns: side.turns ?? 0, steps: side.steps ?? 0 })),
          h('span', null, t('compare.tools', { count: side.toolCalls ?? 0 })),
          usage !== null ? h('span', null, `${formatCompact(usage.total)} tok`) : null,
          model !== null ? h('span', { className: 'ct-compare-model' }, `${model.provider ?? ''} / ${model.model ?? ''}`) : null),
        h('div', { className: 'ct-compare-label' }, t('compare.prompts')),
        Array.isArray(side.prompts) && side.prompts.length > 0
          ? h('ol', { className: 'ct-compare-prompts' },
            side.prompts.map((prompt, index) => h('li', { key: index }, prompt)))
          : h('p', { className: 'ct-compare-empty' }, t('compare.empty')),
        h('div', { className: 'ct-compare-label' }, t('compare.last')),
        side.lastAssistant !== ''
          ? h('p', { className: 'ct-compare-text' }, side.lastAssistant)
          : h('p', { className: 'ct-compare-empty' }, t('compare.empty')))
    }

    function CompareDialog({ dialog, sessions }) {
      const sides = Array.isArray(dialog.sides) ? dialog.sides : []
      return h(DialogShell, {
        title: t('compare.title'),
        subtitle: t('compare.subtitle'),
        onClose: () => store.closeDialog(),
        wide: true,
        footer: h(ActionButton, { onClick: () => store.closeDialog() }, t('compare.close')),
      },
        h('div', { className: 'ct-compare' },
          sides.map((side) => h(CompareSide, { key: side.id, side, sessions }))))
    }

    function TreeSummaryDialog({ dialog }) {
      const [state, setState] = React.useState({ status: 'loading', text: '', note: '' })
      React.useEffect(() => {
        let alive = true
        requestJson(TREE_SUMMARY_ROUTE, {
          method: 'POST',
          body: JSON.stringify({ sessionId: dialog.sessionId }),
        }).then((body) => {
          if (!alive) return
          setState({
            status: 'done',
            text: typeof body?.summary === 'string' ? body.summary : '',
            note: body?.truncated === true
              ? t('summary.truncated')
              : t('summary.scope', { branches: body?.branches ?? 0, total: body?.total ?? 0 }),
          })
        }).catch((failure) => {
          if (alive) setState({ status: 'error', text: friendlyError(failure), note: '' })
        })
        return () => { alive = false }
      }, [dialog.sessionId])
      return h(DialogShell, {
        title: t('summary.title'),
        subtitle: t('summary.subtitle'),
        onClose: () => store.closeDialog(),
        footer: h(ActionButton, { onClick: () => store.closeDialog() }, t('compare.close')),
      },
        state.status === 'loading'
          ? h('div', { className: 'ct-summary-loading' },
            h(Spinner, { size: 16 }),
            h('span', null, t('summary.loading')))
          : state.status === 'error'
            ? h('p', { className: 'ct-summary-error' }, state.text)
            : h('div', null,
              h('p', { className: 'ct-summary-text' }, state.text),
              state.note === '' ? null : h('p', { className: 'ct-summary-note' }, state.note)))
    }

    function Overlays({ useSessions, useWorkspaces }) {
      const state = useStore()
      const sessions = useSessions((value) => value)
      const workspaces = useWorkspaces((value) => value)
      const archived = React.useMemo(() => archivedSetOf(workspaces), [workspaces])
      return h(React.Fragment, null,
        state.toast !== null ? h(Toast, { key: state.toast.seq, toast: state.toast }) : null,
        state.dialog?.kind === 'target'
          ? h(TargetDialog, {
            key: state.dialog.id,
            dialog: state.dialog,
            sessions,
            archived,
          })
          : null,
        state.dialog?.kind === 'confirm'
          ? h(ConfirmDialog, {
            key: state.dialog.id,
            dialog: state.dialog,
            sessions,
            archived,
          })
          : null,
        state.dialog?.kind === 'compare'
          ? h(CompareDialog, {
            key: state.dialog.id,
            dialog: state.dialog,
            sessions,
          })
          : null,
        state.dialog?.kind === 'summary'
          ? h(TreeSummaryDialog, { key: state.dialog.id, dialog: state.dialog })
          : null)
    }

    function Toast({ toast }) {
      const tone = toast.kind === 'error' ? 'error' : toast.kind === 'success' ? 'success' : 'info'
      return h('div', { className: `ct-toast ct-toast-${tone}`, role: 'status' },
        h('span', { className: 'ct-toast-icon' },
          tone === 'error' ? h(IconAlert, { size: 16 }) : tone === 'success' ? h(IconCheck, { size: 16 }) : h(IconTree, { size: 16 })),
        h('span', { className: 'ct-toast-text' }, toast.text),
        toast.action !== null && toast.action !== undefined
          ? h('button', {
            type: 'button',
            className: 'ct-toast-action',
            onClick: () => toast.action.onClick(),
          }, toast.action.label)
          : null)
    }

    function DialogShell({ title, subtitle, children, footer, onClose, busy = false, wide = false }) {
      const panelRef = React.useRef(null)
      React.useEffect(() => {
        const timer = window.setTimeout(() => panelRef.current?.focus(), 0)
        return () => window.clearTimeout(timer)
      }, [])
      React.useEffect(() => {
        function onKey(event) {
          if (event.key === 'Escape' && !busy) onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [busy, onClose])
      return h('div', {
        className: 'ct-backdrop',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && !busy) onClose()
        },
      },
        h('div', {
          className: `ct-dialog${wide ? ' ct-dialog-wide' : ''}`,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': title,
          tabIndex: -1,
          ref: panelRef,
        },
          h('div', { className: 'ct-dialog-head' },
            h('div', null,
              h('h2', { className: 'ct-dialog-title' }, title),
              subtitle ? h('p', { className: 'ct-dialog-sub' }, subtitle) : null),
            h('button', {
              type: 'button',
              className: 'ct-dialog-close',
              onClick: onClose,
              disabled: busy,
              'aria-label': t('dialog.close'),
            }, h(IconClose, { size: 17 }))),
          h('div', { className: 'ct-dialog-body' }, children),
          footer ? h('div', { className: 'ct-dialog-foot' }, footer) : null))
    }

    function TargetDialog({ dialog, sessions, archived }) {
      const state = useStore()
      const [targetId, setTargetId] = React.useState('')
      const [phase, setPhase] = React.useState('pick')
      const [summary, setSummary] = React.useState('')
      const [truncated, setTruncated] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      // The tree may come from the Workspace forest (the tree page) or from a
      // single-tree load (the composer dock on the chat page).
      const tree = treeForNode(state, dialog.sourceId) ?? state.trees[dialog.sessionId]
      const loading = tree === undefined && state.loading[dialog.sessionId] === true

      React.useEffect(() => {
        if (treeForNode(store.get(), dialog.sourceId) === undefined) void store.loadTree(dialog.sessionId)
      }, [dialog.sessionId, dialog.sourceId])

      const sourceNode = tree?.nodes?.find((node) => node.id === dialog.sourceId)
      const sourceTitle = sourceNode !== undefined ? titleOfNode(sessions, sourceNode) : t('target.source')
      const candidates = tree === undefined ? [] : targetNodes(tree, dialog.sourceId, archived)
      const targetTitle = targetId === '' ? '' : titleOfNode(sessions, { id: targetId, title: '' })

      React.useEffect(() => {
        if (tree === undefined) return
        setTargetId((current) => {
          if (current !== '' && candidates.some((node) => node.id === current)) return current
          return defaultTarget(tree, dialog.sourceId, archived)
        })
      }, [dialog.id, tree?.fetchedAt])

      async function generate() {
        if (busy || targetId === '') return
        setBusy(true)
        setError('')
        try {
          const summaryBody = await requestJson(SUMMARY_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ sessionId: dialog.sourceId }),
          }, 180000)
          const text = typeof summaryBody?.summary === 'string' ? summaryBody.summary : ''
          if (text === '') throw new Error(t('error.summary-empty'))
          setSummary(text)
          setTruncated(summaryBody?.truncated === true)
          setPhase('preview')
        } catch (failure) {
          setError(friendlyError(failure))
        } finally {
          setBusy(false)
        }
      }

      async function send() {
        if (busy || targetId === '') return
        const text = summary.trim()
        if (text === '') {
          setError(t('error.summary-empty'))
          return
        }
        setBusy(true)
        setError('')
        try {
          const remote = app?.remote?.session
          if (remote === undefined || typeof remote.prompt !== 'function') throw new Error(t('error.network'))
          const reply = await remote.prompt({
            requestId: uuid(),
            sessionId: targetId,
            mode: 'queue',
            content: [{
              type: 'text',
              text: `【对话树摘要 · 来自「${sourceTitle}」】\n\n${text}`,
            }],
          }, new AbortController().signal)
          if (reply === undefined || reply === null || reply.ok !== true) {
            const detail = typeof reply?.error?.message === 'string' && reply.error.message !== ''
              ? `: ${reply.error.message}` : ''
            throw new Error(`${t('error.prompt-rejected')}${detail}`)
          }
          store.closeDialog()
          store.toast('success', t('notice.brought', { target: targetTitle, chars: text.length }))
        } catch (failure) {
          // The edited brief stays in the textarea, so a retry does not pay for
          // another compression call.
          setError(friendlyError(failure))
        } finally {
          setBusy(false)
        }
      }

      const previewing = phase === 'preview'
      return h(DialogShell, {
        title: previewing ? t('target.preview') : t('target.title'),
        subtitle: previewing
          ? t('target.previewHint')
          : t('target.subtitle', { source: sourceTitle }),
        onClose: () => { if (!busy) store.closeDialog() },
        busy,
        wide: previewing,
        footer: previewing
          ? h(React.Fragment, null,
            h(ActionButton, { onClick: () => { if (!busy) setPhase('pick') }, disabled: busy }, t('target.back')),
            h(ActionButton, { onClick: generate, disabled: busy }, t('target.regenerate')),
            h(ActionButton, { tone: 'primary', onClick: send, disabled: busy || summary.trim() === '' },
              busy ? h(Spinner, { size: 13 }) : h(IconBring, { size: 14 }),
              h('span', null, busy ? t('target.working') : t('target.send'))))
          : h(React.Fragment, null,
            h(ActionButton, { onClick: () => { if (!busy) store.closeDialog() }, disabled: busy }, t('target.cancel')),
            h(ActionButton, { tone: 'primary', onClick: generate, disabled: busy || targetId === '' },
              busy ? h(Spinner, { size: 13 }) : h(IconBring, { size: 14 }),
              h('span', null, busy ? t('target.working') : t('target.confirm')))),
      },
        h('div', { className: 'ct-source-card' },
          h('span', { className: 'ct-source-label' }, t('target.source')),
          h('strong', null, sourceTitle),
          sourceNode?.turn !== null && sourceNode?.turn !== undefined
            ? h('span', { className: 'ct-source-meta' }, t('inspector.turn', { turn: sourceNode.turn }))
            : null),
        previewing
          ? h('div', { className: 'ct-preview' },
            h('div', { className: 'ct-target-label' }, t('target.choose') + ' · ' + targetTitle),
            truncated ? h('div', { className: 'ct-inline-warn' }, h(IconAlert, { size: 15 }), h('span', null, t('target.truncated'))) : null,
            h('textarea', {
              className: 'ct-preview-text',
              value: summary,
              rows: 12,
              'aria-label': t('target.preview'),
              onChange: (event) => setSummary(event.target.value),
            }))
          : h(React.Fragment, null,
            error !== '' ? h('div', { className: 'ct-inline-error' }, h(IconAlert, { size: 15 }), h('span', null, error)) : null,
            h('div', { className: 'ct-target-label' }, t('target.choose')),
            loading
              ? h('div', { className: 'ct-target-loading' }, h(Spinner, { size: 16 }), h('span', null, t('head.loading')))
              : candidates.length === 0
                ? h('div', { className: 'ct-target-empty' }, t('target.empty'))
                : h('div', { className: 'ct-target-list', role: 'radiogroup', 'aria-label': t('target.choose') },
                  candidates.map((node) => {
                    const selected = node.id === targetId
                    const session = sessionOf(sessions, node.id)
                    const title = titleOfNode(sessions, node)
                    const depth = depthOf(tree, node.id)
                    return h('button', {
                      key: node.id,
                      type: 'button',
                      className: `ct-target-item${selected ? ' ct-target-item-selected' : ''}`,
                      role: 'radio',
                      'aria-checked': selected,
                      onClick: () => setTargetId(node.id),
                      style: { paddingLeft: 12 + Math.min(depth, 8) * 18 },
                    },
                      h('span', { className: 'ct-radio' }, selected ? h('span', { className: 'ct-radio-dot' }) : null),
                      h('span', { className: 'ct-target-glyph' }, node.id === tree?.rootId ? h(IconTree, { size: 15 }) : h(IconBranch, { size: 14 })),
                      h('span', { className: 'ct-target-copy' },
                        h('span', { className: 'ct-target-title' }, title),
                        h('span', { className: 'ct-target-meta' },
                          node.parentId === null || node.parentId === undefined
                            ? t('root.badge')
                            : t('inspector.turn', { turn: node.turn ?? 0 }),
                          session?.running ? ` · ${t('node.running')}` : '')),
                      selected ? h('span', { className: 'ct-target-check' }, h(IconCheck, { size: 15 })) : null)
                  }))),
        previewing && error !== ''
          ? h('div', { className: 'ct-inline-error' }, h(IconAlert, { size: 15 }), h('span', null, error))
          : null)
    }

    function depthOf(tree, nodeId) {
      let depth = 0
      let node = tree?.nodes?.find((candidate) => candidate.id === nodeId)
      const seen = new Set()
      while (node?.parentId && !seen.has(node.id)) {
        seen.add(node.id)
        node = tree.nodes.find((candidate) => candidate.id === node.parentId)
        depth += 1
      }
      return depth
    }

    function ConfirmDialog({ dialog, sessions, archived }) {
      const state = useStore()
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const tree = treeForNode(state, dialog.nodeId) ?? state.trees[dialog.sessionId]
      const loading = tree === undefined && state.loading[dialog.sessionId] === true
      React.useEffect(() => {
        if (treeForNode(store.get(), dialog.nodeId) === undefined) void store.loadTree(dialog.sessionId)
      }, [dialog.sessionId, dialog.nodeId])
      const node = tree?.nodes?.find((candidate) => candidate.id === dialog.nodeId)
      const subtree = tree === undefined ? [] : subtreeOf(tree, dialog.nodeId)
      const isDelete = dialog.action === 'delete'
      const targetSession = sessionOf(sessions, dialog.nodeId)
      const running = !isDelete && targetSession?.running === true
      const title = node !== undefined ? titleOfNode(sessions, node) : t('head.titleFallback')
      const childCount = Math.max(0, subtree.length - 1)

      async function confirm() {
        if (busy || tree === undefined) return
        setBusy(true)
        setError('')
        try {
          if (isDelete) await runDelete(tree, dialog.nodeId, dialog.sessionId, dialog.fallbackSessionId)
          else await runArchive(tree, dialog.nodeId, dialog.sessionId, dialog.fallbackSessionId)
        } catch (failure) {
          setError(friendlyError(failure))
          await refreshAfterMutation(dialog.sessionId, new Set()).catch(() => {})
        } finally {
          setBusy(false)
        }
      }

      return h(DialogShell, {
        title: isDelete ? t('confirm.delete.title') : t('confirm.archive.title'),
        subtitle: subtree.length > 1
          ? (isDelete ? t('confirm.delete.body', { title }) : t('confirm.archive.body', { title }))
          : (isDelete ? t('confirm.delete.leaf', { title }) : t('confirm.archive.leaf', { title })),
        onClose: () => { if (!busy) store.closeDialog() },
        busy,
        wide: false,
        footer: h(React.Fragment, null,
          h(ActionButton, { onClick: () => { if (!busy) store.closeDialog() }, disabled: busy }, t('confirm.cancel')),
          h(ActionButton, {
            tone: isDelete ? 'danger' : 'primary',
            onClick: confirm,
            disabled: busy || loading,
          }, busy ? h(Spinner, { size: 13 }) : (isDelete ? h(IconTrash, { size: 14 }) : h(IconArchive, { size: 14 })),
          h('span', null, busy ? t('confirm.working') : (isDelete ? t('confirm.delete.action') : t('confirm.archive.action'))))),
      },
        childCount > 0
          ? h('div', { className: 'ct-warning' }, h(IconAlert, { size: 16 }), h('span', null, t('confirm.children', { count: childCount, total: subtree.length })))
          : null,
        running
          ? h('div', { className: 'ct-warning' }, h(IconAlert, { size: 16 }), h('span', null, t('confirm.archive.running')))
          : null,
        error !== '' ? h('div', { className: 'ct-inline-error' }, h(IconAlert, { size: 15 }), h('span', null, error)) : null,
        h('div', { className: 'ct-target-label' }, t('confirm.list')),
        loading
          ? h('div', { className: 'ct-target-loading' }, h(Spinner, { size: 16 }), h('span', null, t('head.loading')))
          : h('div', { className: 'ct-confirm-list' },
            subtree.slice(0, 8).map((entry) => h('div', { key: entry.id, className: 'ct-confirm-item' },
              h('span', { className: 'ct-confirm-glyph' }, entry.id === tree?.rootId ? h(IconTree, { size: 14 }) : h(IconBranch, { size: 13 })),
              h('span', { className: 'ct-confirm-title' }, titleOfNode(sessions, entry)),
              entry.id === dialog.nodeId ? h('span', { className: 'ct-confirm-badge' }, t('confirm.target')) : null)),
            subtree.length > 8 ? h('div', { className: 'ct-confirm-more' }, t('confirm.more', { count: subtree.length - 8 })) : null))
    }

    // --------------------------------------------------------------- styling

    const CSS = String.raw`
      .ct-page {
        box-sizing: border-box;
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: auto;
        overflow: hidden;
        background: var(--dsw-alias-bg-base);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family, inherit);
      }
      .ct-page *, .ct-backdrop *, .ct-toast * { box-sizing: border-box; }
      .ct-top {
        flex: none;
        height: 48px;
        padding: 0 14px 0 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-base);
      }
      .ct-top-title { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
      .ct-h1 {
        margin: 0;
        font-size: 16px;
        line-height: 1.2;
        font-weight: 600;
        letter-spacing: -.01em;
        white-space: nowrap;
      }
      .ct-top-count {
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .ct-top-notice {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: min(52vw, 520px);
      }
      .ct-top-notice .ct-spinner { width: 12px; height: 12px; }
      .ct-top-notice-success { color: var(--dsw-alias-state-success-primary); }
      .ct-top-notice-error { color: var(--dsw-alias-state-error-primary); }
      .ct-top-actions { flex: none; display: flex; align-items: center; gap: 6px; }
      .ct-search {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 28px;
        padding: 0 8px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 7px;
        color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-bg-layer-1);
      }
      .ct-search:focus-within { border-color: var(--dsw-alias-border-l2); }
      .ct-search-input {
        width: 132px;
        min-width: 0;
        border: 0;
        outline: 0;
        padding: 0;
        background: transparent;
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 13px;
      }
      .ct-search-input::placeholder { color: var(--dsw-alias-label-secondary); }
      .ct-search-input::-webkit-search-cancel-button { display: none; }
      .ct-search-count { font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .ct-icon-btn {
        width: 28px;
        height: 28px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font: inherit;
        cursor: pointer;
      }
      .ct-icon-btn:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
      }
      .ct-icon-btn:focus-visible, .ct-open-btn:focus-visible, .ct-btn:focus-visible, .ct-btn-primary:focus-visible,
      .ct-btn-secondary:focus-visible, .ct-text-btn:focus-visible, .ct-link:focus-visible,
      .ct-node:focus-visible, .ct-target-item:focus-visible, .ct-dialog-close:focus-visible,
      .ct-zoom button:focus-visible, .ct-dock-pill:focus-visible, .ct-branch-action:focus-visible,
      .ct-panel-title:focus-visible, .ct-panel-chevron:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 2px;
      }

      .ct-body { flex: 1 1 auto; min-height: 0; display: flex; overflow: hidden; }
      .ct-canvas {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
        background: var(--dsw-alias-bg-base);
      }
      .ct-canvas[data-dragging="true"] { cursor: grabbing; }
      .ct-canvas:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
      /*
       * The stage is scaled, not resized. A permanent will-change: transform
       * promoted it to a compositor layer that stayed rasterized at 100%, so
       * every zoom stretched a bitmap: text went soft and 1px lines turned into
       * uneven bands. The hint now lives only on .ct-stage-live, applied while
       * a gesture moves, so the canvas repaints at the final scale afterwards.
       */
      .ct-stage {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        /* One device pixel at any zoom, so lines stay hairlines like the rest
           of the app instead of growing into slabs. */
        --ct-hairline: calc(1px / var(--ct-scale, 1));
      }
      /* Only while a gesture is moving: a persistent hint would keep the
         stretched bitmap around after the zoom stops. */
      .ct-stage-live { will-change: transform; }
      .ct-edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
      .ct-edge {
        fill: none;
        stroke: var(--dsw-alias-border-l2);
        stroke-width: calc(1.25 / var(--ct-scale, 1));
      }
      .ct-edge-current { stroke: var(--dsw-alias-state-business-primary); stroke-opacity: .75; }
      .ct-node {
        position: absolute;
        width: 176px;
        height: 58px;
        padding: 0 6px 0 12px;
        display: flex;
        align-items: center;
        gap: 9px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-width: var(--ct-hairline);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        text-align: left;
        cursor: pointer;
        transition: border-color .12s ease, background-color .12s ease, opacity .12s ease;
      }
      .ct-node:hover {
        border-color: var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2);
      }
      .ct-node-selected {
        border-color: var(--dsw-alias-brand-primary);
        background: color-mix(in srgb, var(--dsw-alias-brand-primary) 4%, var(--dsw-alias-bg-layer-1));
      }
      /* The conversation being read keeps a marker that survives the selection
         colour: a business-colour edge instead of yet another border tint. */
      .ct-node-current {
        border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-border-l2));
        box-shadow: inset 3px 0 0 var(--dsw-alias-state-business-primary);
      }
      .ct-node-root:not(.ct-node-selected):not(.ct-node-current) { border-color: var(--dsw-alias-border-l2); }
      .ct-node-archived { opacity: .58; border-style: dashed; }
      .ct-node-pending { border-style: dashed; }
      .ct-node-relinked { border-style: dotted; }
      .ct-node-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .ct-node-dot-current { background: var(--dsw-alias-state-business-primary); }
      .ct-node-dot-running { background: var(--dsw-alias-state-success-primary); }
      .ct-node-dot-pending { background: var(--dsw-alias-state-warn-primary); }
      .ct-node-dot-archived { background: var(--dsw-alias-label-secondary); }
      .ct-node-unread {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--dsw-alias-brand-primary);
      }
      .ct-node-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
      .ct-node-dimmed { opacity: .34; }
      .ct-node-match { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--dsw-alias-border-l1)); }
      .ct-node-toggle {
        flex: none;
        width: 18px;
        height: 18px;
        display: grid;
        place-items: center;
        border-radius: 4px;
        color: var(--dsw-alias-label-secondary);
        cursor: pointer;
      }
      .ct-node-toggle:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .ct-node-toggle > svg { transform: rotate(90deg); transition: transform .12s ease; }
      .ct-node-toggle-closed > svg { transform: rotate(0deg); }
      .ct-node-title {
        font-size: 14px;
        line-height: 1.3;
        font-weight: 550;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ct-node-meta {
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      /* The user's name for a branch sits where the counters were. */
      .ct-node-note { color: var(--dsw-alias-label-primary); }
      .ct-empty-note {
        position: absolute;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.4;
        white-space: nowrap;
        text-align: center;
        pointer-events: none;
      }
      .ct-zoom {
        position: absolute;
        right: 12px;
        bottom: 12px;
        height: 30px;
        display: flex;
        align-items: center;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
        overflow: hidden;
      }
      .ct-zoom button {
        width: 29px;
        height: 28px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
      }
      .ct-zoom button:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
      }
      .ct-zoom-value {
        min-width: 42px;
        padding: 0 2px;
        color: var(--dsw-alias-label-secondary);
        font-size: 11.5px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .ct-zoom-sep { width: 1px; height: 16px; background: var(--dsw-alias-border-l1); }

      .ct-side {
        width: 320px;
        flex: none;
        min-height: 0;
        display: flex;
        flex-direction: column;
        border-left: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-base);
      }
      .ct-side-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 18px 20px 20px;
        scrollbar-width: thin;
      }
      .ct-side-wide {
        width: 100%;
        justify-content: center;
        margin-top: 8px;
      }
      .ct-crumbs {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
        margin: 0 0 5px;
        font-size: 11.5px;
        line-height: 1.45;
      }
      .ct-crumb {
        max-width: 9em;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font: inherit;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
      }
      .ct-crumb:hover { color: var(--dsw-alias-label-primary); }
      .ct-crumb::after, .ct-crumb-gap::after {
        content: '›';
        margin: 0 4px;
        color: var(--dsw-alias-label-tertiary);
      }
      .ct-crumb-gap { color: var(--dsw-alias-label-tertiary); }
      .ct-last + .ct-last { margin-top: 9px; }
      .ct-last-label {
        margin-bottom: 3px;
        color: var(--dsw-alias-label-tertiary);
        font-size: 11.5px;
        line-height: 1.4;
      }
      .ct-last-text {
        margin: 0;
        max-height: 112px;
        overflow: auto;
        color: var(--dsw-alias-label-primary);
        font-size: 12.5px;
        line-height: 1.6;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .ct-side-title {
        margin: 0;
        font-size: 16px;
        line-height: 1.35;
        font-weight: 600;
        letter-spacing: -.01em;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .ct-side-status {
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.4;
        font-variant-numeric: tabular-nums;
      }
      .ct-status-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .ct-status-dot-current { background: var(--dsw-alias-state-business-primary); }
      .ct-status-dot-running { background: var(--dsw-alias-state-success-primary); }
      .ct-status-dot-pending { background: var(--dsw-alias-state-warn-primary); }
      .ct-status-dot-archived { background: var(--dsw-alias-label-secondary); }
      .ct-side-actions { margin-top: 14px; display: flex; gap: 6px; flex-wrap: wrap; }
      .ct-note { margin-top: 10px; }
      .ct-note-input {
        width: 100%;
        height: 30px;
        padding: 0 9px;
        box-sizing: border-box;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 12.5px;
        line-height: 1.4;
      }
      .ct-note-input::placeholder { color: var(--dsw-alias-label-tertiary); }
      .ct-note-input:focus-visible {
        outline: 2px solid var(--dsw-alias-brand-primary);
        outline-offset: 1px;
        border-color: transparent;
      }
      .ct-open-btn {
        flex: 1 1 auto;
        min-width: 0;
        height: 32px;
        padding: 0 12px;
        border: 1px solid var(--dsw-alias-label-primary);
        border-radius: 6px;
        background: var(--dsw-alias-label-primary);
        color: var(--dsw-alias-bg-base);
        font: inherit;
        font-size: 12.5px;
        font-weight: 550;
        white-space: nowrap;
        cursor: pointer;
      }
      .ct-open-btn:hover { opacity: .88; }
      .ct-open-btn:disabled { opacity: .4; cursor: not-allowed; }
      .ct-btn-secondary {
        flex: none;
        height: 32px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 12.5px;
        white-space: nowrap;
        cursor: pointer;
      }
      .ct-btn-secondary:hover {
        border-color: var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2);
      }
      .ct-btn-secondary:disabled { color: var(--dsw-alias-label-secondary); opacity: .45; cursor: not-allowed; }
      .ct-section { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .ct-section-label {
        margin-bottom: 7px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.3;
      }
      .ct-source-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
      .ct-source-note {
        margin: 6px 0 0;
        color: var(--dsw-alias-state-warn-primary);
        font-size: 12px;
        line-height: 1.5;
      }
      .ct-source-root { font-size: 13px; line-height: 1.5; }
      .ct-source-turn {
        flex: none;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.4;
        font-variant-numeric: tabular-nums;
      }
      .ct-link {
        min-width: 0;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 13px;
        line-height: 1.5;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
      }
      .ct-link:hover { color: var(--dsw-alias-brand-primary); }
      .ct-kv-list { margin: 0; padding: 0; }
      .ct-kv {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
        padding: 2px 0;
        font-size: 13px;
        line-height: 1.55;
      }
      .ct-kv dt, .ct-kv > span:first-child { flex: none; color: var(--dsw-alias-label-secondary); }
      .ct-kv dd, .ct-kv > span:last-child {
        min-width: 0;
        margin: 0;
        text-align: right;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-variant-numeric: tabular-nums;
      }
      .ct-snippet {
        margin: 0;
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
        line-height: 1.55;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .ct-usage-total { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; }
      .ct-usage-number {
        font-size: 17px;
        line-height: 1.2;
        font-weight: 550;
        letter-spacing: -.01em;
        font-variant-numeric: tabular-nums;
      }
      .ct-usage-unit { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.2; }
      .ct-cache {
        margin-left: auto;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
      .ct-side-danger {
        flex: none;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .ct-text-btn {
        padding: 0;
        border: none;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 12px;
        line-height: 1.4;
        cursor: pointer;
      }
      .ct-text-btn:hover { color: var(--dsw-alias-label-primary); }
      .ct-text-btn:disabled { opacity: .4; cursor: not-allowed; }
      .ct-text-danger { color: var(--dsw-alias-state-error-primary); }
      .ct-text-danger:hover { color: var(--dsw-alias-state-error-primary); opacity: .8; }

      .ct-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 12px;
        padding: 24px;
      }
      .ct-state p { margin: 0; max-width: 520px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.55; }
      .ct-skeleton-node {
        position: absolute;
        width: 176px;
        height: 58px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-l1);
      }
      .ct-skeleton-count { display: block; width: 92px; height: 12px; border-radius: 3px; }
      .ct-skeleton-title { width: 58%; height: 18px; border-radius: 4px; }
      .ct-skeleton-line { width: 100%; height: 12px; margin-top: 10px; border-radius: 3px; }
      .ct-skeleton-block { width: 100%; height: 96px; margin-top: 20px; border-radius: 6px; }
      .ct-skeleton { background: var(--dsw-alias-bg-layer-2); }

      .ct-branch-row { display: flex; justify-content: flex-start; margin-top: -2px; }
      .ct-branch-action {
        height: 28px;
        margin-left: -6px;
        padding: 0 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font: inherit;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        transition: background-color .12s ease, color .12s ease;
      }
      .ct-branch-action:hover {
        color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
      }
      .ct-branch-action:disabled { opacity: .4; cursor: not-allowed; }
      .ct-branch-action svg { flex: none; }

      .ct-dock-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        padding: 1px 8px;
        border: none;
        border-radius: var(--dsw-radius-sm, 4px);
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
        font: inherit;
        font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
        line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        cursor: pointer;
      }
      .ct-dock-pill:hover {
        color: var(--dsw-alias-label-secondary);
        background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
      }
      .ct-dock-pill svg { width: 14px; height: 14px; flex: none; }

      /* The tree is a management view, not a chat composer view. The native
         composer seat is a sibling of the active view; remove it only while
         this page is mounted. The selector uses the renderer's stable
         data-conversation-scroll, data-slot and data-composer-seat hooks. */
      [data-conversation-scroll]:has([data-slot="conversation.view"] .ct-page) > [data-composer-seat] {
        display: none;
      }

      .ct-backdrop {
        pointer-events: auto;
        position: fixed;
        inset: 0;
        z-index: 120;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent);
      }
      .ct-dialog {
        width: min(560px, 100%);
        max-height: min(82vh, 720px);
        display: flex;
        flex-direction: column;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 12px;
        background: var(--dsw-alias-bg-overlay);
        box-shadow: 0 24px 64px -32px color-mix(in srgb, var(--dsw-alias-label-primary) 60%, transparent);
        outline: none;
        overflow: hidden;
      }
      .ct-dialog-wide { width: min(680px, 100%); }
      .ct-compare {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .ct-compare-col {
        min-width: 0;
        padding: 12px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
      }
      .ct-compare-title {
        margin: 0 0 8px;
        color: var(--dsw-alias-label-primary);
        font-size: 13.5px;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .ct-compare-facts {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }
      .ct-compare-model { overflow-wrap: anywhere; }
      .ct-compare-label {
        margin: 12px 0 4px;
        color: var(--dsw-alias-label-tertiary);
        font-size: 11.5px;
      }
      .ct-compare-text {
        margin: 0;
        max-height: 220px;
        overflow: auto;
        color: var(--dsw-alias-label-primary);
        font-size: 12.5px;
        line-height: 1.6;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .ct-compare-empty {
        margin: 0;
        color: var(--dsw-alias-label-tertiary);
        font-size: 12.5px;
      }
      .ct-compare-prompts {
        margin: 0;
        padding-left: 18px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.55;
      }
      .ct-compare-prompts > li { overflow-wrap: anywhere; }
      .ct-compare-prompts > li + li { margin-top: 3px; }
      .ct-dialog-head {
        flex: none;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        padding: 18px 20px 10px;
      }
      .ct-dialog-title { margin: 0; font-size: 16px; line-height: 1.35; font-weight: 600; letter-spacing: -.01em; }
      .ct-dialog-sub {
        margin: 5px 0 0;
        max-width: 500px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12.5px;
        line-height: 1.55;
      }
      .ct-dialog-close {
        flex: none;
        width: 28px;
        height: 28px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        cursor: pointer;
      }
      .ct-dialog-close:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .ct-dialog-body { min-height: 0; overflow: auto; padding: 4px 20px 14px; }
      .ct-dialog-foot {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px 16px;
        border-top: 1px solid var(--dsw-alias-border-l1);
      }
      .ct-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 12.5px;
        white-space: nowrap;
        cursor: pointer;
      }
      .ct-btn:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
      .ct-btn:disabled { opacity: .45; cursor: not-allowed; }
      .ct-btn-primary {
        border-color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-label-primary);
        color: var(--dsw-alias-bg-base);
      }
      .ct-btn-primary:hover { border-color: var(--dsw-alias-label-primary); background: var(--dsw-alias-label-primary); opacity: .88; }
      .ct-btn-danger {
        border-color: var(--dsw-alias-state-error-primary);
        background: var(--dsw-alias-state-error-primary);
        color: #fff;
      }
      .ct-btn-danger:hover { border-color: var(--dsw-alias-state-error-primary); background: var(--dsw-alias-state-error-primary); opacity: .88; }

      .ct-source-card {
        display: flex;
        align-items: baseline;
        gap: 8px;
        padding: 2px 0 6px;
        font-size: 13px;
      }
      .ct-source-label { flex: none; color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
      .ct-source-card strong { min-width: 0; font-size: 13px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ct-source-meta { margin-left: auto; flex: none; color: var(--dsw-alias-label-secondary); font-size: 11.5px; font-variant-numeric: tabular-nums; }
      .ct-target-label { margin: 14px 0 7px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 1.3; }
      .ct-target-list {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
      }
      .ct-target-item {
        width: 100%;
        min-height: 40px;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        gap: 9px;
        border: none;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
        background: transparent;
        color: var(--dsw-alias-label-primary);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .ct-target-item:last-child { border-bottom: none; }
      .ct-target-item:hover { background: var(--dsw-alias-bg-layer-2); }
      .ct-target-item-selected { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 5%, var(--dsw-alias-bg-layer-1)); }
      .ct-target-item-selected:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, var(--dsw-alias-bg-layer-1)); }
      .ct-radio {
        flex: none;
        width: 14px;
        height: 14px;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--dsw-alias-bg-base);
      }
      .ct-target-item-selected .ct-radio { border-color: var(--dsw-alias-brand-primary); }
      .ct-radio-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-brand-primary); }
      .ct-target-glyph { flex: none; display: inline-flex; color: var(--dsw-alias-label-secondary); }
      .ct-target-item-selected .ct-target-glyph { color: var(--dsw-alias-brand-primary); }
      .ct-target-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 1px; }
      .ct-target-title { font-size: 12.5px; line-height: 1.4; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ct-target-meta {
        color: var(--dsw-alias-label-secondary);
        font-size: 11.5px;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .ct-target-check { flex: none; display: inline-flex; color: var(--dsw-alias-brand-primary); }
      .ct-target-loading, .ct-target-empty {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px 12px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12.5px;
      }
      .ct-warning {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin: 2px 0 10px;
        padding: 9px 11px;
        border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 28%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 7%, transparent);
        color: var(--dsw-alias-state-warn-primary);
        font-size: 12px;
        line-height: 1.5;
      }
      .ct-inline-error {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        margin: 10px 0;
        padding: 8px 10px;
        border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 26%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent);
        color: var(--dsw-alias-state-error-primary);
        font-size: 12px;
        line-height: 1.5;
      }
      .ct-inline-warn {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        margin: 0 0 8px;
        padding: 7px 10px;
        border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent);
        border-radius: 6px;
        background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 7%, transparent);
        color: var(--dsw-alias-state-warn-primary);
        font-size: 12px;
        line-height: 1.5;
      }
      .ct-preview { display: flex; flex-direction: column; gap: 8px; }
      .ct-preview-text {
        width: 100%;
        min-height: 220px;
        resize: vertical;
        padding: 10px 12px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 13px;
        line-height: 1.6;
      }
      .ct-preview-text:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
      .ct-confirm-list { display: flex; flex-direction: column; }
      .ct-confirm-item {
        min-height: 34px;
        padding: 5px 2px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
        font-size: 12.5px;
      }
      .ct-confirm-item:last-child { border-bottom: none; }
      .ct-confirm-glyph { flex: none; display: inline-flex; color: var(--dsw-alias-label-secondary); }
      .ct-confirm-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ct-confirm-badge {
        margin-left: auto;
        flex: none;
        padding: 1px 6px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 999px;
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        line-height: 1.4;
      }
      .ct-confirm-more { padding: 6px 2px 0; color: var(--dsw-alias-label-secondary); font-size: 11.5px; }

      .ct-canvas-host {
        position: relative;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        background: var(--dsw-alias-bg-base);
      }
      .ct-canvas-host > .ct-canvas { position: absolute; inset: 0; }
      .ct-panel {
        position: absolute;
        border: 0;
        background: transparent;
      }
      .ct-panel-collapsed .ct-panel-title { color: var(--dsw-alias-label-secondary); }
      .ct-panel-current .ct-panel-title { color: var(--dsw-alias-state-business-primary); }
      .ct-panel-head {
        position: absolute;
        left: 0;
        top: 0;
        right: 0;
        height: 34px;
        padding: 0 2px;
        display: flex;
        align-items: center;
        gap: 7px;
        overflow: hidden;
      }
      .ct-panel-chevron {
        flex: none;
        width: 24px;
        height: 24px;
        padding: 0;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 5px;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        cursor: pointer;
      }
      .ct-panel-chevron:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .ct-panel-chevron > svg { transform: rotate(90deg); transition: transform .12s ease; }
      .ct-panel-collapsed .ct-panel-chevron > svg { transform: rotate(0deg); }
      /* Multi-tree only. The root node already carries this name, so the header
         reads as a section label instead of a second title. */
      .ct-panel-title {
        min-width: 0;
        flex: 0 1 auto;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 12.5px;
        font-weight: 600;
        line-height: 1.4;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
      }
      .ct-panel-title:hover { color: var(--dsw-alias-brand-primary); }
      .ct-panel-badge {
        flex: none;
        padding: 1px 7px;
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 999px;
        color: var(--dsw-alias-label-secondary);
        font-size: 11px;
        line-height: 1.5;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .ct-panel-badge-current {
        color: var(--dsw-alias-state-business-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, transparent);
      }
      .ct-panel-badge-running {
        color: var(--dsw-alias-state-success-primary);
        border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 35%, transparent);
      }
      .ct-panel-time {
        flex: none;
        padding-left: 6px;
        color: var(--dsw-alias-label-tertiary);
        font-size: 11.5px;
        line-height: 1.4;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .ct-panel-body { position: absolute; left: 0; top: 34px; right: 0; bottom: 0; }
      .ct-panel-bare .ct-panel-body { top: 0; }
      .ct-canvas-empty {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: var(--dsw-alias-label-secondary);
        text-align: center;
      }
      .ct-canvas-empty p { margin: 0; font-size: 13px; line-height: 1.5; }
      .ct-canvas-notes {
        pointer-events: none;
        position: absolute;
        left: 14px;
        bottom: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-width: min(60%, 420px);
      }
      .ct-canvas-note {
        margin: 0;
        padding: 2px 8px;
        border-radius: 6px;
        background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 84%, transparent);
        color: var(--dsw-alias-label-tertiary);
        font-size: 11.5px;
        line-height: 1.5;
      }
      .ct-canvas-toggle {
        pointer-events: auto;
        border: 1px solid var(--dsw-alias-border-l1);
        background: var(--dsw-alias-bg-layer-1);
        color: var(--dsw-alias-label-secondary);
        font: inherit;
        font-size: 11.5px;
        line-height: 1.5;
        text-align: left;
        cursor: pointer;
      }
      .ct-canvas-toggle:hover {
        border-color: var(--dsw-alias-border-l2);
        color: var(--dsw-alias-label-primary);
      }

      .ct-toast {
        pointer-events: auto;
        position: fixed;
        left: 50%;
        bottom: 24px;
        z-index: 130;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: min(560px, calc(100vw - 40px));
        padding: 8px 12px;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 8px;
        background: var(--dsw-alias-bg-overlay);
        color: var(--dsw-alias-label-primary);
        box-shadow: 0 16px 40px -24px color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent);
        font-size: 12.5px;
        line-height: 1.45;
      }
      .ct-summary-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 22px 0;
        color: var(--dsw-alias-label-secondary);
        font-size: 12.5px;
      }
      .ct-summary-text {
        margin: 0;
        color: var(--dsw-alias-label-primary);
        font-size: 13px;
        line-height: 1.7;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .ct-summary-note {
        margin: 14px 0 0;
        color: var(--dsw-alias-label-tertiary);
        font-size: 11.5px;
        line-height: 1.5;
      }
      .ct-summary-error {
        margin: 0;
        padding: 18px 0;
        color: var(--dsw-alias-state-error-primary);
        font-size: 12.5px;
        line-height: 1.6;
      }
      .ct-toast-icon { flex: none; display: inline-flex; }
      .ct-toast-text { flex: 1 1 auto; min-width: 0; }
      .ct-toast-action {
        flex: none;
        margin-left: 4px;
        padding: 3px 10px;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 6px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        font: inherit;
        font-size: 12px;
        line-height: 1.4;
        cursor: pointer;
      }
      .ct-toast-action:hover { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
      .ct-toast-error { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); }
      .ct-toast-error .ct-toast-icon { color: var(--dsw-alias-state-error-primary); }
      .ct-toast-success .ct-toast-icon { color: var(--dsw-alias-state-success-primary); }
      .ct-toast-info .ct-toast-icon { color: var(--dsw-alias-brand-primary); }

      .ct-spinner {
        display: inline-block;
        flex: none;
        border-radius: 50%;
        border: 2px solid color-mix(in srgb, var(--dsw-alias-label-secondary) 25%, transparent);
        border-top-color: var(--dsw-alias-brand-primary);
        animation: ct-spin .7s linear infinite;
      }
      @keyframes ct-spin { to { transform: rotate(360deg); } }
      .ct-page ::selection { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent); }

      @media (max-width: 960px) {
        .ct-body { flex-direction: column; }
        .ct-canvas-host { min-height: 220px; }
        .ct-side {
          width: auto;
          flex: 0 1 46%;
          border-left: none;
          border-top: 1px solid var(--dsw-alias-border-l1);
        }
        .ct-side-scroll { padding: 14px 16px 16px; }
        .ct-side-danger { padding: 10px 16px 14px; }
      }
      @media (max-width: 600px) {
        .ct-top { height: 44px; padding: 0 8px 0 14px; gap: 10px; }
        .ct-h1 { font-size: 15px; }
        .ct-top-count { font-size: 11px; }
        .ct-canvas-host { min-height: 190px; }
        .ct-side { flex-basis: 50%; }
        .ct-side-title { font-size: 15px; }
        .ct-usage-number { font-size: 16px; }
        .ct-backdrop { padding: 12px; }
        .ct-dialog-head, .ct-dialog-body, .ct-dialog-foot { padding-left: 16px; padding-right: 16px; }
        .ct-toast { bottom: 16px; }
        .ct-panel-time { display: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ct-page *, .ct-backdrop *, .ct-toast * { transition-duration: .001ms !important; animation-duration: .001ms !important; }
      }
    `

    function syncStyle() {
      try {
        if (typeof document === 'undefined') return () => {}
        let tag = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)
        if (tag === null) {
          tag = document.createElement('style')
          tag.dataset.pluginCss = STYLE_ID
          document.head.appendChild(tag)
        }
        tag.textContent = CSS
        return () => {
          try { tag.remove() } catch { /* the page may be unloading */ }
        }
      } catch {
        return () => {}
      }
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.session', 'sessions'],
      __test: {
        flattenTree,
        subtreeOf,
        trimCache,
        targetNodes,
        defaultTarget,
        friendlyError,
        formatRelative,
        buildGraph,
        formatCompact,
        formatExact,
        tokenStatsOf,
        modelStatsOf,
        componentTree,
        workspaceView,
        forestModels,
        treeForNode,
        layoutPanels,
        TreeView,
        TreeHeader,
        TreeCanvas,
        TreePanel,
        GraphNode,
        NodeInspector,
        TreeDockAction,
        BranchAction,
        DialogShell,
        TargetDialog,
        ConfirmDialog,
        CompareSide,
        CompareDialog,
        Overlays,
        store,
      },
      apply(ctx) {
        app = ctx
        ctx.effect(() => syncStyle(), 'conversation-tree: styles')
        for (const [locale, dict] of [['zh', ZH], ['en', EN]]) {
          try {
            ctx.locale.register(NS, locale, dict)
          } catch {
            /* a reloaded namespace keeps its first dictionary */
          }
        }
        try {
          translate = ctx.locale.bind(NS)
        } catch {
          translate = null
        }

        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'tree',
          order: 40,
          label: () => t('view.tree'),
        }, TreeView))

        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'conversation-tree.branch',
          order: 40,
          label: () => t('branch.action'),
        }, BranchAction))

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'conversation-tree.bring',
          order: 20,
          label: () => t('dock.bring'),
        }, TreeDockAction))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'conversation-tree.overlays',
          order: 30,
        }, Overlays))
      },
    }
  },
})
