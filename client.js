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
 * opened, brought back, archived, or deleted.
 */

window.__ModuleLoader__.load({
  id: 'dsh-conversation-tree',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-conversation-tree'
    const BRANCH_ROUTE = '/api/conversation-tree/branch'
    const TREE_ROUTE = '/api/conversation-tree/tree'
    const SUMMARY_ROUTE = '/api/conversation-tree/summarize'
    const DELETE_ROUTE = '/api/conversation-tree/delete'
    const STYLE_ID = 'dsh-conversation-tree/ui'
    const TOAST_MS = 4200

    const ZH = {
      'view.tree': '对话树',
      'head.count': '{branches} 条分支 · {nodes} 个对话',
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
      'inspector.usage': '本对话用量',
      'inspector.uncached': '未缓存输入',
      'inspector.cacheRead': '缓存读取',
      'inspector.cacheWrite': '缓存写入',
      'inspector.output': '输出',
      'inspector.cacheHit': '缓存命中 {percent}%',
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
      'branch.hint': '从这个已完成轮次创建一条会进入对话树的分支',
      'head.titleFallback': '对话树',
      'head.refresh': '刷新',
      'head.retry': '重新加载',
      'head.loading': '正在读取对话树…',
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
      'notice.unarchived': '已取消归档',
      'confirm.delete.title': '删除这棵子树？',
      'confirm.delete.body': '「{title}」及其下的所有分支会被永久删除，无法恢复。',
      'confirm.delete.leaf': '「{title}」会被永久删除，无法恢复。',
      'confirm.archive.title': '归档这棵子树？',
      'confirm.archive.body': '「{title}」及其下的所有分支会从默认视图中隐藏；之后可以在「显示已归档」里恢复。',
      'confirm.archive.leaf': '「{title}」会从默认视图中隐藏；之后可以在「显示已归档」里恢复。',
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
      'head.count': '{branches} branches · {nodes} conversations',
      'head.refresh': 'Refresh',
      'head.fit': 'Fit to canvas',
      'head.zoomIn': 'Zoom in',
      'head.zoomOut': 'Zoom out',
      'head.zoomReset': 'Reset zoom',
      'graph.label': 'Conversation tree graph',
      'inspector.source': 'Source',
      'inspector.root': 'Root',
      'inspector.turn': 'after Turn {turn}',
      'inspector.depth': 'level {depth}',
      'inspector.level': 'Level',
      'inspector.branchPoint': 'Branch point',
      'inspector.usage': 'Own usage',
      'inspector.total': 'Total',
      'inspector.uncached': 'Uncached input',
      'inspector.cacheRead': 'Cached input',
      'inspector.cacheWrite': 'Cache write',
      'inspector.output': 'Output',
      'inspector.cacheHit': 'Cache hit {percent}%',
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
      'branch.hint': 'Create a branch that joins the conversation tree at this completed Turn',
      'branch.created': 'Tree branch created',
      'dock.label': 'Conversation tree',
      'dock.root': 'Root · {count} branches',
      'dock.branch': 'Branch at Turn {turn} · {count} branches',
      'head.eyebrow': 'CONVERSATION TREE',
      'head.titleFallback': 'Conversation tree',
      'head.subtitle': 'See the whole line from the root conversation to its deepest branch. Click any node to open it.',
      'head.branchCount': '{count} branches',
      'head.branchUnit': 'branches',
      'head.level': 'level',
      'head.currentDepth': 'Current · level {depth}',
      'head.showArchived': 'Show archived',
      'head.enterChat': 'Open chat',
      'head.refresh': 'Refresh',
      'head.retry': 'Reload',
      'head.loading': 'Reading the conversation tree…',
      'head.errorTitle': 'The conversation tree could not be read',
      'path.current': 'Current position',
      'path.root': 'Root',
      'root.badge': 'Root',
      'root.note': 'This tree starts here; every branch shares the same workspace.',
      'node.current': 'Current',
      'node.archived': 'Archived',
      'node.pending': 'Registering',
      'node.running': 'Running',
      'node.open': 'Open conversation',
      'node.branchPoint': 'Branched after Turn {turn}',
      'node.childCount': '{count} branches',
      'time.justNow': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.yesterday': 'yesterday',
      'time.days': '{n} d ago',
      'node.action.bring': 'Bring back…',
      'node.action.archive': 'Archive',
      'node.action.unarchive': 'Unarchive',
      'node.action.delete': 'Delete',
      'node.action.open': 'Open',
      'node.archivedOpen': 'Archived conversations cannot be opened',
      'empty.title': 'No branches here yet',
      'empty.body': 'Below any completed message, choose 「Tree branch」. The branch inherits the context up to that moment and appears here.',
      'empty.step1': 'Find the Turn to branch from',
      'empty.step2': 'Choose 「Tree branch」 below the message',
      'empty.step3': 'Open, bring back, or archive it here',
      'empty.archivedTitle': 'All branches are archived',
      'empty.archivedBody': 'Turn on 「Show archived」 to see them, or restore the branches you need.',
      'legend.current': 'Current',
      'legend.running': 'Running',
      'legend.archived': 'Archived',
      'legend.hint': 'Click a card to open it; branches and the root share one workspace.',
      'target.title': 'Bring back into which conversation?',
      'target.subtitle': 'Compress 「{source}」’s own discussion into a brief and queue it into the target. The source is kept.',
      'target.source': 'Source',
      'target.choose': 'Choose a target conversation',
      'target.empty': 'There is no other conversation in this tree to bring back into.',
      'target.cancel': 'Cancel',
      'target.confirm': 'Compress and bring back',
      'target.working': 'Compressing…',
      'target.sending': 'Sending…',
      'notice.brought': 'Brought back into 「{target}」 ({chars} chars)',
      'notice.branchCreated': 'Tree branch created',
      'notice.archiving': 'Archiving {count} conversation(s)…',
      'notice.deleting': 'Deleting {count} conversation(s)…',
      'notice.archived': 'Archived {count} conversation(s)',
      'notice.deleted': 'Deleted {count} conversation(s)',
      'notice.unarchived': 'Unarchived',
      'notice.refreshed': 'Conversation tree refreshed',
      'confirm.delete.title': 'Delete this subtree?',
      'confirm.delete.body': '「{title}」 and every branch below it will be permanently deleted. This cannot be undone.',
      'confirm.delete.leaf': '「{title}」 will be permanently deleted. This cannot be undone.',
      'confirm.archive.title': 'Archive this subtree?',
      'confirm.archive.body': '「{title}」 and every branch below it will disappear from the default view; you can restore them with 「Show archived」.',
      'confirm.archive.leaf': '「{title}」 will disappear from the default view; you can restore it with 「Show archived」.',
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

    function IconOpen({ size = 16, className }) {
      return h(Svg, { size, className },
        h('path', { d: 'M14 4h6v6' }),
        h('path', { d: 'm20 4-8.5 8.5' }),
        h('path', { d: 'M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5' }))
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

    function createStore() {
      let state = {
        trees: {},
        loading: {},
        errors: {},
        dialog: null,
        toast: null,
        notices: {},
        dialogSeq: 0,
        toastSeq: 0,
        noticeSeq: 0,
      }
      const listeners = new Set()
      const inflight = new Map()
      const noticeTimers = new Map()
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
            set({
              loading: { ...state.loading, [sessionId]: true },
              errors: withoutKey(state.errors, sessionId),
            })
            try {
              const suffix = includeStats ? '&stats=1' : ''
              const data = await requestJson(`${TREE_ROUTE}?sessionId=${encodeURIComponent(sessionId)}${suffix}`, { method: 'GET' })
              const tree = { ...data, stats: includeStats, fetchedAt: Date.now() }
              set({
                trees: { ...state.trees, [sessionId]: tree },
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
        invalidateTrees() {
          set({ trees: {}, errors: {} })
        },
        toast(kind, text) {
          state.toastSeq += 1
          window.clearTimeout(toastTimer)
          set({ toast: { kind, text, seq: state.toastSeq } })
          toastTimer = window.setTimeout(() => {
            if (state.toast?.seq === state.toastSeq) set({ toast: null })
          }, TOAST_MS)
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

    async function requestJson(path, options = {}) {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 60000)
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
      return typeof title === 'string' && title.trim() !== '' ? title.trim() : '未命名分支'
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

    async function navigateOutside(tree, ids, currentSessionId) {
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

    async function runDelete(tree, nodeId, currentSessionId) {
      const subtree = subtreeOf(tree, nodeId)
      const ids = new Set(subtree.map((node) => node.id))
      store.setNotice(currentSessionId, {
        kind: 'working',
        text: t('notice.deleting', { count: ids.size }),
      })
      try {
        await navigateOutside(tree, ids, currentSessionId)
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

    async function runArchive(tree, nodeId, currentSessionId) {
      const subtree = subtreeOf(tree, nodeId)
      const ids = new Set(subtree.map((node) => node.id))
      store.setNotice(currentSessionId, {
        kind: 'working',
        text: t('notice.archiving', { count: subtree.length }),
      })
      try {
        await navigateOutside(tree, ids, currentSessionId)
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
      const tree = store.get().trees[currentSessionId]
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
          model: modelStatsOf(sessions, node.id),
          turns: node.statsAvailable === true && Number.isSafeInteger(node.turns) ? node.turns : null,
          steps: node.statsAvailable === true && Number.isSafeInteger(node.steps) ? node.steps : null,
          childCount: kids.length,
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
          const kids = children.get(node.id) ?? []
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
          entry.kids = kids.map((kid) => walk(kid, depth + 1, node))
          return entry
        }
        root = walk(rootNode, 0, null)
      } else {
        const walk = (node, depth, parent) => {
          const kids = children.get(node.id) ?? []
          const placedKids = kids.map((kid) => walk(kid, depth + 1, node))
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
        hasArchived: ordered.some((entry) => entry.archived),
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

    function TreeView({ sessionId, useSessions, useWorkspaces, useSessionAccess, openView }) {
      const state = useStore()
      const sessions = useSessions((value) => value)
      const workspaces = useWorkspaces((value) => value)
      const [selectedId, setSelectedId] = React.useState(null)
      const compact = useCompactLayout()
      const tree = state.trees[sessionId]
      const loading = state.loading[sessionId] === true
      const error = state.errors[sessionId]
      const notice = state.notices[sessionId]
      const archived = React.useMemo(() => archivedSetOf(workspaces), [workspaces])
      const graph = React.useMemo(
        () => buildGraph(tree, { sessions, archived, compact }),
        [tree, sessions, archived, compact],
      )

      React.useEffect(() => {
        void store.loadTree(sessionId, false, true)
        const pendingSince = pendingChatSwitch.get(sessionId)
        if (pendingSince === undefined) return
        pendingChatSwitch.delete(sessionId)
        if (Date.now() - pendingSince > 3000) return
        if (typeof openView === 'function') openView('chat', 'conversation-tree')
      }, [sessionId])

      React.useEffect(() => {
        if (graph === null) return
        if (selectedId !== null && graph.byId.has(selectedId)) return
        setSelectedId(graph.current.id)
      }, [graph, selectedId])

      async function refresh() {
        const next = await store.loadTree(sessionId, true, true)
        if (next === undefined) {
          const failure = store.get().errors[sessionId]
          if (failure !== undefined) store.toast('error', failure)
        }
      }

      function bringBack(sourceId) {
        store.openDialog({
          kind: 'target',
          sessionId,
          sourceId,
          rootId: tree?.rootId,
        })
      }

      function requestArchive(nodeId) {
        const subtree = subtreeOf(tree, nodeId)
        if (subtree.length > 1) {
          store.openDialog({ kind: 'confirm', action: 'archive', sessionId, nodeId })
          return
        }
        void runArchive(tree, nodeId, sessionId).catch((failure) => store.toast('error', friendlyError(failure)))
      }

      function requestDelete(nodeId) {
        store.openDialog({ kind: 'confirm', action: 'delete', sessionId, nodeId })
      }

      function openNode(entry) {
        const target = entry?.node ?? entry
        if (entry?.archived === true || target?.archived === true) {
          store.toast('info', t('node.archivedOpen'))
          return
        }
        if (target?.id === sessionId) {
          if (typeof openView === 'function') openView('chat', 'conversation-tree')
          return
        }
        openSession(target?.id, { forceChat: true })
      }

      if (error !== undefined && tree === undefined) {
        return h('section', { className: 'ct-page' },
          h(TreeHeader, { graph: null, loading, notice, onRefresh: refresh }),
          h('div', { className: 'ct-state' },
            h('p', null, error),
            h('button', { type: 'button', className: 'ct-btn', onClick: refresh }, t('head.retry'))))
      }

      if (tree === undefined || graph === null) return h(TreeSkeleton)

      const selected = selectedId === null
        ? graph.current
        : graph.byId.get(selectedId) ?? graph.current

      return h('section', { className: 'ct-page' },
        h(TreeHeader, { graph, loading, notice, onRefresh: refresh }),
        h('div', { className: 'ct-body' },
          h(TreeCanvas, {
            graph,
            selectedId: selected.id,
            onSelect: setSelectedId,
            onOpen: openNode,
          }),
          h(NodeInspector, {
            entry: selected,
            graph,
            onSelect: setSelectedId,
            onOpen: openNode,
            onBring: bringBack,
            onArchive: requestArchive,
            onDelete: requestDelete,
            onUnarchive: (nodeId) => {
              void runUnarchive(nodeId, sessionId).catch((failure) => store.toast('error', friendlyError(failure)))
            },
            useSessionAccess,
          })))
    }

    function TreeHeader({ graph, loading, notice, onRefresh }) {
      const count = graph === null
        ? ''
        : t('head.count', { branches: graph.branchCount, nodes: graph.nodes.length })
      const status = notice?.text ?? count
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
          h('button', {
            type: 'button',
            className: 'ct-icon-btn',
            onClick: onRefresh,
            title: t('head.refresh'),
            'aria-label': t('head.refresh'),
          }, loading ? h(Spinner, { size: 14 }) : h(IconRefresh, { size: 15 }))))
    }

    function TreeCanvas({ graph, selectedId, onSelect, onOpen }) {
      const viewportRef = React.useRef(null)
      const [view, setView] = React.useState({ x: 0, y: 0, scale: 1 })
      const [dragging, setDragging] = React.useState(false)
      const viewRef = React.useRef(view)
      viewRef.current = view
      const touched = React.useRef(false)
      const pan = React.useRef(null)

      const fit = React.useCallback(() => {
        const viewport = viewportRef.current
        if (viewport === null) return
        const width = viewport.clientWidth
        const height = viewport.clientHeight
        if (width <= 0 || height <= 0) return
        const padding = 20
        const widthScale = (width - padding * 2) / graph.bounds.width
        const heightScale = (height - padding * 2) / graph.bounds.height
        const scale = Math.min(1, Math.max(0.2, graph.compact ? widthScale : Math.min(widthScale, heightScale)))
        setView({
          x: (width - graph.bounds.width * scale) / 2,
          y: graph.compact ? padding : (height - graph.bounds.height * scale) / 2,
          scale,
        })
        touched.current = false
      }, [graph])

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
      }, [])

      function zoomBy(factor) {
        const viewport = viewportRef.current
        if (viewport === null) return
        const rect = viewport.getBoundingClientRect()
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
      }

      React.useLayoutEffect(() => {
        fit()
      }, [fit])

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

      function onPointerDown(event) {
        if (event.button !== 0) return
        if (event.target?.closest?.('.ct-node') !== null && event.target?.closest?.('.ct-node') !== undefined) return
        if (event.target?.closest?.('.ct-zoom') !== null && event.target?.closest?.('.ct-zoom') !== undefined) return
        pan.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          origin: viewRef.current,
        }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setDragging(true)
      }

      function onPointerMove(event) {
        const current = pan.current
        if (current === null) return
        setView({
          ...current.origin,
          x: current.origin.x + event.clientX - current.x,
          y: current.origin.y + event.clientY - current.y,
        })
        touched.current = true
      }

      function endPan() {
        if (pan.current === null) return
        pan.current = null
        setDragging(false)
      }

      const zoomLabel = `${Math.round(view.scale * 100)}%`

      return h('div', {
        className: 'ct-canvas',
        ref: viewportRef,
        'data-dragging': dragging ? 'true' : 'false',
        role: 'group',
        'aria-label': t('graph.label'),
        onPointerDown,
        onPointerMove,
        onPointerUp: endPan,
        onPointerCancel: endPan,
      },
        h('div', {
          className: 'ct-stage',
          style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` },
        },
          h('svg', {
            className: 'ct-edges',
            width: graph.bounds.width,
            height: graph.bounds.height,
            viewBox: `0 0 ${graph.bounds.width} ${graph.bounds.height}`,
            'aria-hidden': true,
          }, graph.edges.map((edge) => {
            const parent = graph.byId.get(edge.parentId)
            const child = graph.byId.get(edge.childId)
            if (parent === undefined || child === undefined) return null
            return h('path', {
              key: edge.id,
              className: `ct-edge${edge.current ? ' ct-edge-current' : ''}`,
              d: edgePath(parent, child),
            })
          })),
          graph.nodes.map((entry) => h(GraphNode, {
            key: entry.id,
            entry,
            selected: entry.id === selectedId,
            onSelect,
            onOpen,
          })),
          graph.nodes.length === 1
            ? h('div', {
              className: 'ct-empty-note',
              style: {
                left: `${graph.root.x}px`,
                top: `${graph.root.y + graph.root.height + 16}px`,
                width: `${graph.root.width}px`,
              },
            }, t('empty.branches'))
            : null),
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

    function GraphNode({ entry, selected, onSelect, onOpen }) {
      const status = statusOf(entry)
      const meta = []
      if (entry.node.turn !== null && entry.node.turn !== undefined) {
        meta.push(t('node.turnShort', { turn: entry.node.turn }))
      } else if (entry.parentId === null) {
        meta.push(t('node.rootShort'))
      }
      if (entry.archived) meta.push(t('node.archived'))
      else if (entry.pending) meta.push(t('node.pending'))
      if (entry.usage !== null) meta.push(t('node.tokenShort', { count: formatCompact(entry.usage.total) }))
      const label = meta.length === 0 ? entry.title : `${entry.title} · ${meta.join(' · ')}`
      return h('button', {
        type: 'button',
        className: `ct-node${selected ? ' ct-node-selected' : ''}${entry.current ? ' ct-node-current' : ''}${entry.archived ? ' ct-node-archived' : ''}${entry.pending ? ' ct-node-pending' : ''}${entry.parentId === null ? ' ct-node-root' : ''}`,
        style: {
          left: `${entry.x}px`,
          top: `${entry.y}px`,
          width: `${entry.width}px`,
          height: `${entry.height}px`,
        },
        onClick: () => onSelect(entry.id),
        onDoubleClick: () => onOpen(entry),
        'aria-pressed': selected,
        'aria-label': label,
        title: label,
      },
        h('span', { className: `ct-node-dot ct-node-dot-${status.key}`, 'aria-hidden': true }),
        h('span', { className: 'ct-node-copy' },
          h('span', { className: 'ct-node-title' }, entry.displayTitle),
          h('span', { className: 'ct-node-meta' }, meta.join(' · '))))
    }

    function NodeInspector({ entry, graph, onSelect, onOpen, onBring, onArchive, onDelete, onUnarchive, useSessionAccess }) {
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
      const canBring = graph.nodes.length > 1 && !entry.pending
      const statusTrail = `${status.label} · ${t('inspector.branches', { count: entry.childCount })}`
      const openLabel = entry.current ? t('inspector.goChat') : t('inspector.open')

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
            }, h(IconBring, { size: 14 }), h('span', null, t('dock.bring')))),

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

          h('section', { className: 'ct-section' },
            h('div', { className: 'ct-section-label' }, t('inspector.usage')),
            h('div', { className: 'ct-usage-total' },
              h('span', { className: 'ct-usage-number' }, usage === null ? t('inspector.noUsage') : formatCompact(usage.total)),
              usage === null ? null : h('span', { className: 'ct-usage-unit' }, 'tokens'),
              usage !== null && usage.cacheHit !== null
                ? h('span', { className: 'ct-cache' }, t('inspector.cacheHit', { percent: usage.cacheHit }))
                : null),
            h('dl', { className: 'ct-kv-list' }, usageRows)),

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
                : null))),

        isRoot
          ? null
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
          : null)
    }

    function Toast({ toast }) {
      const tone = toast.kind === 'error' ? 'error' : toast.kind === 'success' ? 'success' : 'info'
      return h('div', { className: `ct-toast ct-toast-${tone}`, role: 'status' },
        h('span', { className: 'ct-toast-icon' },
          tone === 'error' ? h(IconAlert, { size: 16 }) : tone === 'success' ? h(IconCheck, { size: 16 }) : h(IconTree, { size: 16 })),
        h('span', null, toast.text))
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
              'aria-label': 'Close',
            }, h(IconClose, { size: 17 }))),
          h('div', { className: 'ct-dialog-body' }, children),
          footer ? h('div', { className: 'ct-dialog-foot' }, footer) : null))
    }

    function TargetDialog({ dialog, sessions, archived }) {
      const state = useStore()
      const [targetId, setTargetId] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const tree = state.trees[dialog.sessionId]
      const loading = state.loading[dialog.sessionId] === true

      React.useEffect(() => {
        void store.loadTree(dialog.sessionId)
      }, [dialog.sessionId])

      const sourceNode = tree?.nodes?.find((node) => node.id === dialog.sourceId)
      const sourceTitle = sourceNode !== undefined ? titleOfNode(sessions, sourceNode) : t('target.source')
      const candidates = tree === undefined ? [] : targetNodes(tree, dialog.sourceId, archived)

      React.useEffect(() => {
        if (tree === undefined) return
        setTargetId((current) => {
          if (current !== '' && candidates.some((node) => node.id === current)) return current
          return defaultTarget(tree, dialog.sourceId, archived)
        })
      }, [dialog.id, tree?.fetchedAt])

      async function submit() {
        if (busy || targetId === '') return
        setBusy(true)
        setError('')
        try {
          const summaryBody = await requestJson(SUMMARY_ROUTE, {
            method: 'POST',
            body: JSON.stringify({ sessionId: dialog.sourceId }),
          })
          const summary = typeof summaryBody?.summary === 'string' ? summaryBody.summary : ''
          if (summary === '') throw new Error(t('error.summary-empty'))
          const remote = app?.remote?.session
          if (remote === undefined || typeof remote.prompt !== 'function') throw new Error(t('error.network'))
          const targetTitle = titleOfNode(sessions, { id: targetId, title: '' })
          const reply = await remote.prompt({
            requestId: uuid(),
            sessionId: targetId,
            mode: 'queue',
            content: [{
              type: 'text',
              text: `【对话树摘要 · 来自「${sourceTitle}」】\n\n${summary}`,
            }],
          }, new AbortController().signal)
          if (reply === undefined || reply === null || reply.ok !== true) {
            const detail = typeof reply?.error?.message === 'string' && reply.error.message !== ''
              ? `: ${reply.error.message}` : ''
            throw new Error(`${t('error.prompt-rejected')}${detail}`)
          }
          store.closeDialog()
          store.toast('success', t('notice.brought', { target: targetTitle, chars: summary.length }))
        } catch (failure) {
          setError(friendlyError(failure))
        } finally {
          setBusy(false)
        }
      }

      return h(DialogShell, {
        title: t('target.title'),
        subtitle: t('target.subtitle', { source: sourceTitle }),
        onClose: () => { if (!busy) store.closeDialog() },
        busy,
        wide: false,
        footer: h(React.Fragment, null,
          h(ActionButton, { onClick: () => { if (!busy) store.closeDialog() }, disabled: busy }, t('target.cancel')),
          h(ActionButton, { tone: 'primary', onClick: submit, disabled: busy || targetId === '' },
            busy ? h(Spinner, { size: 13 }) : h(IconBring, { size: 14 }),
            h('span', null, busy ? t('target.working') : t('target.confirm')))),
      },
        h('div', { className: 'ct-source-card' },
          h('span', { className: 'ct-source-label' }, t('target.source')),
          h('strong', null, sourceTitle),
          sourceNode?.turn !== null && sourceNode?.turn !== undefined
            ? h('span', { className: 'ct-source-meta' }, t('inspector.turn', { turn: sourceNode.turn }))
            : null),
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
              })))
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
      const tree = state.trees[dialog.sessionId]
      const loading = state.loading[dialog.sessionId] === true
      React.useEffect(() => {
        void store.loadTree(dialog.sessionId)
      }, [dialog.sessionId])
      const node = tree?.nodes?.find((candidate) => candidate.id === dialog.nodeId)
      const subtree = tree === undefined ? [] : subtreeOf(tree, dialog.nodeId)
      const isDelete = dialog.action === 'delete'
      const title = node !== undefined ? titleOfNode(sessions, node) : t('head.titleFallback')
      const childCount = Math.max(0, subtree.length - 1)

      async function confirm() {
        if (busy || tree === undefined) return
        setBusy(true)
        setError('')
        try {
          if (isDelete) await runDelete(tree, dialog.nodeId, dialog.sessionId)
          else await runArchive(tree, dialog.nodeId, dialog.sessionId)
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
      .ct-top-actions { flex: none; display: flex; align-items: center; gap: 2px; }
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
      .ct-zoom button:focus-visible, .ct-dock-pill:focus-visible, .ct-branch-action:focus-visible {
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
      .ct-stage {
        position: absolute;
        left: 0;
        top: 0;
        transform-origin: 0 0;
        will-change: transform;
      }
      .ct-edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
      .ct-edge {
        fill: none;
        stroke: var(--dsw-alias-border-l2);
        stroke-width: 1.25;
        vector-effect: non-scaling-stroke;
      }
      .ct-edge-current { stroke: var(--dsw-alias-state-business-primary); stroke-opacity: .75; }
      .ct-node {
        position: absolute;
        width: 176px;
        height: 58px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 9px;
        border: 1px solid var(--dsw-alias-border-l1);
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
      .ct-node-current { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-border-l2)); }
      .ct-node-root:not(.ct-node-selected):not(.ct-node-current) { border-color: var(--dsw-alias-border-l2); }
      .ct-node-archived { opacity: .58; border-style: dashed; }
      .ct-node-pending { border-style: dashed; }
      .ct-node-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
      .ct-node-dot-current { background: var(--dsw-alias-state-business-primary); }
      .ct-node-dot-running { background: var(--dsw-alias-state-success-primary); }
      .ct-node-dot-pending { background: var(--dsw-alias-state-warn-primary); }
      .ct-node-dot-archived { background: var(--dsw-alias-label-secondary); }
      .ct-node-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
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
      .ct-side-actions { margin-top: 14px; display: flex; gap: 6px; }
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
      .ct-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
      .ct-section-label {
        margin-bottom: 7px;
        color: var(--dsw-alias-label-secondary);
        font-size: 12px;
        line-height: 1.3;
      }
      .ct-source-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
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
      .ct-usage-total { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
      .ct-usage-number {
        font-size: 24px;
        line-height: 1.1;
        font-weight: 550;
        letter-spacing: -.02em;
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
      .ct-toast-icon { flex: none; display: inline-flex; }
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
        .ct-canvas { min-height: 220px; }
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
        .ct-canvas { min-height: 190px; }
        .ct-side { flex-basis: 50%; }
        .ct-side-title { font-size: 15px; }
        .ct-usage-number { font-size: 22px; }
        .ct-backdrop { padding: 12px; }
        .ct-dialog-head, .ct-dialog-body, .ct-dialog-foot { padding-left: 16px; padding-right: 16px; }
        .ct-toast { bottom: 16px; }
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
        targetNodes,
        defaultTarget,
        friendlyError,
        formatRelative,
        buildGraph,
        formatCompact,
        formatExact,
        tokenStatsOf,
        modelStatsOf,
        TreeView,
        TreeHeader,
        TreeCanvas,
        GraphNode,
        NodeInspector,
        TreeDockAction,
        BranchAction,
        DialogShell,
        TargetDialog,
        ConfirmDialog,
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
