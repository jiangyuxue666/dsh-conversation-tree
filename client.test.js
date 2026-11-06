import test from 'node:test'
import assert from 'node:assert/strict'

let captured
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) {
    return setTimeout(callback, 0)
  },
  cancelAnimationFrame(timer) {
    clearTimeout(timer)
  },
}

let hookContext = null

const ReactStub = {
  Fragment: 'Fragment',
  createElement(type, props, ...children) {
    const next = props === null || props === undefined ? {} : { ...props }
    if (children.length === 1) next.children = children[0]
    else if (children.length > 1) next.children = children
    return { type, props: next, key: next.key }
  },
  useState(initial) {
    const index = hookContext.index++
    if (!(index in hookContext.states)) {
      hookContext.states[index] = typeof initial === 'function' ? initial() : initial
    }
    const setter = (value) => {
      hookContext.states[index] = typeof value === 'function' ? value(hookContext.states[index]) : value
    }
    return [hookContext.states[index], setter]
  },
  useEffect() {
    hookContext.index++
  },
  useMemo(factory) {
    hookContext.index++
    return factory()
  },
  useRef(initial) {
    const index = hookContext.index++
    if (!(index in hookContext.refs)) hookContext.refs[index] = { current: initial }
    return hookContext.refs[index]
  },
  useCallback(callback) {
    hookContext.index++
    return callback
  },
  useLayoutEffect() {
    hookContext.index++
  },
}

function withHooks(component, props) {
  const previous = hookContext
  hookContext = { states: [], refs: [], index: 0 }
  try {
    return component(props)
  } finally {
    hookContext = previous
  }
}

function render(element) {
  if (element === null || element === undefined || element === false || element === true) return ''
  if (Array.isArray(element)) return element.map((child) => render(child)).join('')
  if (typeof element !== 'object') return String(element)
  if (element.type === ReactStub.Fragment) return render(element.props.children)
  if (typeof element.type === 'function') return render(withHooks(element.type, element.props))
  return render(element.props?.children)
}

await import('./client.js')
assert.equal(captured.id, 'dsh-conversation-tree')
const plugin = captured.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error(`unexpected require: ${name}`)
})
const {
  flattenTree,
  subtreeOf,
  targetNodes,
  defaultTarget,
  friendlyError,
  formatRelative,
  buildGraph,
  formatCompact,
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
  Overlays,
  store,
} = plugin.__test

function node(id, parentId, extra = {}) {
  return {
    id,
    parentId,
    atSeq: 7,
    turn: 2,
    snippet: `snippet-${id}`,
    title: `title-${id}`,
    createdAt: 100,
    pending: false,
    depth: 0,
    childCount: 0,
    ...extra,
  }
}

const tree = {
  version: 1,
  rootId: 'r',
  currentId: 'b',
  branchCount: 3,
  nodes: [
    node('r', null, { atSeq: null, turn: null, snippet: '', title: '' }),
    node('a', 'r', { createdAt: 100 }),
    node('b', 'a', { createdAt: 200 }),
    node('c', 'r', { createdAt: 300 }),
  ],
}

const sessions = {
  byId: {
    r: {
      id: 'r',
      title: '主对话',
      displayTitle: '主对话',
      running: false,
      updatedAt: 1_000,
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 1200, outputTokens: 800, cacheReadTokens: 6000, cacheWriteTokens: 0 },
        modelSelection: { lastUsed: { provider: 'deepseek', model: 'deepseek-v4-flash', reasoningEffort: 'high' }, next: null },
      },
    },
    a: {
      id: 'a',
      title: '分支 A',
      displayTitle: '分支 A',
      running: true,
      updatedAt: 2_000,
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 300, outputTokens: 200, cacheReadTokens: 1500, cacheWriteTokens: 100 },
      },
    },
    b: { id: 'b', title: '分支 B', displayTitle: '分支 B', running: false, updatedAt: 3_000 },
    c: { id: 'c', title: '分支 C', displayTitle: '分支 C', running: false, updatedAt: 4_000 },
  },
}

test('flattenTree hides archived nodes while keeping the path connected', () => {
  const model = flattenTree(tree, { sessions, archived: new Set(['c']), showArchived: false })
  assert.equal(model.root.title, '主对话')
  assert.equal(model.current.id, 'b')
  assert.equal(model.currentDepth, 2)
  assert.deepEqual(model.path.map((entry) => entry.id), ['r', 'a', 'b'])
  assert.deepEqual(model.rows.map((row) => row.node.id), ['a', 'b'])
  assert.equal(model.root.childCount, 1)
  assert.deepEqual(model.rows[0].ancestorLines, [])
  assert.deepEqual(model.rows[1].ancestorLines, [false])
  assert.equal(model.rows[0].running, true)
  assert.equal(model.rows[1].running, false)
})

test('flattenTree shows archived nodes and draws sibling guides', () => {
  const model = flattenTree(tree, { sessions, archived: new Set(['c']), showArchived: true })
  assert.deepEqual(model.rows.map((row) => row.node.id), ['a', 'b', 'c'])
  assert.equal(model.rows.find((row) => row.node.id === 'a').hasNextSibling, true)
  assert.deepEqual(model.rows.find((row) => row.node.id === 'b').ancestorLines, [true])
  assert.equal(model.rows.find((row) => row.node.id === 'c').archived, true)
  assert.equal(model.hasArchived, true)
})

test('flattenTree keeps a hidden archived parent connected to its visible child', () => {
  const nested = {
    version: 1,
    rootId: 'r',
    currentId: 'b',
    branchCount: 2,
    nodes: [
      node('r', null, { atSeq: null, turn: null }),
      node('a', 'r'),
      node('b', 'a'),
    ],
  }
  const model = flattenTree(nested, { sessions, archived: new Set(['a']), showArchived: false })
  assert.deepEqual(model.rows.map((row) => row.node.id), ['b'])
  assert.equal(model.rows[0].depth, 1)
})

test('subtreeOf returns the selected branch and all descendants', () => {
  assert.deepEqual(subtreeOf(tree, 'a').map((entry) => entry.id), ['a', 'b'])
  assert.deepEqual(subtreeOf(tree, 'b').map((entry) => entry.id), ['b'])
})

test('targetNodes excludes the source, archived targets, and pending edges', () => {
  const withPending = {
    ...tree,
    nodes: [...tree.nodes, node('d', 'r', { pending: true })],
  }
  assert.deepEqual(targetNodes(withPending, 'b', new Set(['c'])).map((entry) => entry.id), ['r', 'a'])
  assert.equal(defaultTarget(withPending, 'b', new Set()), 'a')
  assert.equal(defaultTarget(withPending, 'a', new Set()), 'r')
})

test('friendlyError localizes stable server codes', () => {
  assert.equal(friendlyError({ code: 'session-not-loaded', message: 'session not loaded' }), '这条对话还没有加载，请先打开它')
  assert.equal(friendlyError({ code: 'delete-preflight', message: 'session-live:abc' }), '这个对话还在使用中，请先切换到其他对话再试')
  assert.equal(friendlyError({ code: 'unknown-code', message: 'raw failure' }), 'raw failure')
})

test('formatRelative produces localized relative time', () => {
  assert.equal(formatRelative(Date.now() - 2 * 60 * 1000), '2 分钟前')
  assert.equal(formatRelative(Date.now() - 2 * 60 * 60 * 1000), '2 小时前')
  assert.equal(formatRelative(Date.now() - 26 * 60 * 60 * 1000), '昨天')
})

test('buildGraph lays the tree out top down and keeps every node', () => {
  const graph = buildGraph(tree, { sessions, archived: new Set(['c']), showArchived: true })
  assert.equal(graph.nodes.length, 4)
  assert.equal(graph.root.id, 'r')
  assert.equal(graph.current.id, 'b')
  assert.equal(graph.byId.get('a').depth, 1)
  assert.equal(graph.byId.get('b').depth, 2)
  assert.equal(graph.byId.get('r').x, (graph.byId.get('a').x + graph.byId.get('c').x) / 2)
  assert.equal(graph.byId.get('a').x, graph.byId.get('b').x)
  assert.ok(graph.byId.get('r').y < graph.byId.get('a').y)
  assert.equal(graph.byId.get('a').y, graph.byId.get('c').y)
  assert.ok(graph.byId.get('b').y > graph.byId.get('a').y)
  assert.ok(graph.byId.get('a').x < graph.byId.get('c').x)
  assert.equal(graph.edges.length, 3)
  assert.equal(graph.edges.find((edge) => edge.childId === 'b').current, true)
  assert.equal(graph.edges.find((edge) => edge.childId === 'c').current, false)
  assert.equal(graph.byId.get('c').archived, true)
  assert.equal(graph.bounds.width > graph.byId.get('c').x + 100, true)
  assert.equal(graph.bounds.height > graph.byId.get('b').y + 50, true)
  assert.match(graph.edges.find((edge) => edge.childId === 'b')?.id ?? '', /^a:b$/)
})

test('buildGraph hides archived subtrees unless the view asks for them', () => {
  const hidden = buildGraph(tree, { sessions, archived: new Set(['c']) })
  assert.deepEqual(hidden.nodes.map((entry) => entry.id), ['r', 'a', 'b'])
  assert.equal(hidden.byId.has('c'), false)
  assert.equal(hidden.hasArchived, true)
  assert.equal(hidden.hiddenArchived, true)

  const shown = buildGraph(tree, { sessions, archived: new Set(['c']), showArchived: true })
  assert.equal(shown.nodes.length, 4)
  assert.equal(shown.hiddenArchived, false)
})

test('buildGraph collapses a subtree and reports how many nodes it hides', () => {
  const graph = buildGraph(tree, { sessions, collapsed: new Set(['a']) })
  assert.deepEqual(graph.nodes.map((entry) => entry.id), ['r', 'a', 'c'])
  const parent = graph.byId.get('a')
  assert.equal(parent.collapsed, true)
  assert.equal(parent.hasChildren, true)
  assert.equal(parent.hiddenCount, 1)
  assert.equal(graph.byId.get('b'), undefined)
  assert.equal(graph.byId.get('r').hasChildren, true)
  assert.equal(graph.byId.get('r').collapsed, false)
})

test('buildGraph marks search hits and dims everything else', () => {
  const graph = buildGraph(tree, { sessions, query: '分支 B' })
  assert.equal(graph.query, '分支 b')
  assert.equal(graph.matchedCount, 1)
  assert.equal(graph.byId.get('b').highlight, true)
  assert.equal(graph.byId.get('b').dimmed, false)
  assert.equal(graph.byId.get('a').dimmed, true)
  assert.equal(buildGraph(tree, { sessions, query: 'missing' }).matchedCount, 0)
})

test('compact layout indents a vertical stack and keeps the branch suffix readable', () => {
  const compactTree = {
    ...tree,
    nodes: [
      node('r', null, { atSeq: null, turn: null, title: '主对话' }),
      node('a', 'r', { title: '主对话 · 分支 2' }),
      node('b', 'a', { title: '主对话 · 分支 2 · 分支' }),
      node('c', 'r', { title: '主对话 · 分支 3' }),
    ],
  }
  const compactSessions = {
    byId: {
      r: { id: 'r', title: '主对话', displayTitle: '主对话' },
      a: { id: 'a', title: '主对话 · 分支 2', displayTitle: '主对话 · 分支 2' },
      b: { id: 'b', title: '主对话 · 分支 2 · 分支', displayTitle: '主对话 · 分支 2 · 分支' },
      c: { id: 'c', title: '主对话 · 分支 3', displayTitle: '主对话 · 分支 3' },
    },
  }
  const compact = buildGraph(compactTree, { sessions: compactSessions, archived: new Set(), compact: true })
  assert.equal(compact.compact, true)
  assert.equal(compact.byId.get('r').width, 260)
  assert.equal(compact.byId.get('r').height, 52)
  assert.equal(compact.byId.get('r').y, 32)
  assert.equal(compact.byId.get('a').y, 32 + 52 + 8)
  assert.equal(compact.byId.get('a').x, 32 + 24)
  assert.equal(compact.byId.get('b').x, 32 + 48)
  assert.equal(compact.byId.get('a').displayTitle, '分支 2')
  assert.equal(compact.byId.get('b').displayTitle, '分支 2 / 分支')
  assert.equal(compact.byId.get('r').displayTitle, '主对话')
})

test('token and model stats come from the session summary projection', () => {
  const stats = tokenStatsOf(sessions, 'r')
  assert.deepEqual(stats, {
    uncachedInput: 1200,
    cacheRead: 6000,
    cacheWrite: 0,
    output: 800,
    billedInput: 7200,
    total: 8000,
    cacheHit: 83,
  })
  assert.equal(formatCompact(stats.total), '8k')
  assert.equal(formatCompact(12_450), '12.5k')
  assert.equal(formatCompact(999_999), '1m')
  assert.equal(formatCompact(1_200_000), '1.2m')
  assert.equal(formatCompact(999_999_999), '1b')
  const model = modelStatsOf(sessions, 'r')
  assert.equal(model.provider, 'deepseek')
  assert.equal(model.model, 'deepseek-v4-flash')
  assert.equal(model.reasoning, 'high')
  assert.equal(tokenStatsOf(sessions, 'b'), null)
  assert.equal(modelStatsOf(sessions, 'b'), null)
})

test('full tree, target picker, and confirm dialog render with live data', async () => {
  const h = ReactStub.createElement
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/api/conversation-tree/tree'))
    return { ok: true, json: async () => tree }
  }
  try {
    const loaded = await store.loadTree('b', true)
    assert.equal(loaded.rootId, 'r')
  } finally {
    globalThis.fetch = originalFetch
  }
  const noop = () => {}
  assert.doesNotThrow(() => render(h(TreeView, {
    sessionId: 'b',
    useSessions: () => sessions,
    useWorkspaces: () => ({ archivedSessionIds: ['c'] }),
    useSessionAccess: () => true,
  })))
  assert.doesNotThrow(() => render(h(TreeDockAction, {
    sessionId: 'b',
    useSessions: () => sessions,
  })))
  assert.doesNotThrow(() => render(h(plugin.__test.TargetDialog, {
    dialog: { id: 1, kind: 'target', sessionId: 'b', sourceId: 'b', rootId: 'r' },
    sessions,
    archived: new Set(['c']),
  })))
  assert.doesNotThrow(() => render(h(plugin.__test.ConfirmDialog, {
    dialog: { id: 2, kind: 'confirm', action: 'delete', sessionId: 'b', nodeId: 'a' },
    sessions,
    archived: new Set(['c']),
  })))
})

test('tree UI components render without throwing', () => {
  const h = ReactStub.createElement
  const graph = buildGraph(tree, { sessions, archived: new Set(['c']) })
  const noop = () => {}
  assert.doesNotThrow(() => render(h(TreeHeader, {
    graph,
    loading: false,
    onRefresh: noop,
  })))
  assert.doesNotThrow(() => render(h(TreeCanvas, {
    graph,
    selectedId: 'b',
    onSelect: noop,
    onOpen: noop,
  })))
  assert.doesNotThrow(() => render(h(GraphNode, {
    entry: graph.byId.get('a'),
    selected: false,
    onSelect: noop,
    onOpen: noop,
  })))
  assert.doesNotThrow(() => render(h(NodeInspector, {
    entry: graph.byId.get('a'),
    graph,
    onSelect: noop,
    onOpen: noop,
    onBring: noop,
    onArchive: noop,
    onDelete: noop,
    onUnarchive: noop,
    useSessionAccess: () => true,
  })))
  assert.doesNotThrow(() => render(h(BranchAction, {
    sessionId: 'b',
    seq: 7,
    turn: { end: { seq: 9 } },
    useAccess: () => true,
  })))
  assert.doesNotThrow(() => render(h(DialogShell, {
    title: 'Title',
    subtitle: 'Subtitle',
    onClose: noop,
    busy: false,
    footer: h('button', null, 'ok'),
    children: h('div', null, 'body'),
  })))
  assert.doesNotThrow(() => render(h(TreeView, {
    sessionId: 'b',
    useSessions: () => sessions,
    useWorkspaces: () => ({ archivedSessionIds: [] }),
    useSessionAccess: () => true,
  })))
  assert.doesNotThrow(() => render(h(Overlays, {
    useSessions: () => sessions,
    useWorkspaces: () => ({ archivedSessionIds: [] }),
  })))
})
