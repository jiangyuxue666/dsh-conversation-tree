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
    const context = hookContext
    const index = context.index++
    if (!(index in context.states)) {
      context.states[index] = typeof initial === 'function' ? initial() : initial
    }
    const setter = (value) => {
      context.states[index] = typeof value === 'function' ? value(context.states[index]) : value
    }
    return [context.states[index], setter]
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
assert.equal(captured.id, '@jiangyuxue666/dsh-conversation-tree')
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
  componentTree,
  workspaceView,
  forestModels,
  layoutPanels,
  treeForNode,
  trimCache,
  TreeView,
  TreeHeader,
  TreeCanvas,
  TreePanel,
  GraphNode,
  NodeInspector,
  TreeDockAction,
  BranchAction,
  DialogShell,
  Overlays,
  CompareSide,
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

test('bring-back uses the current model and only sends the edited preview', async () => {
  // A fresh factory keeps this test's app and store separate from other tests.
  const isolated = captured.factory((name) => {
    if (name === 'react') return ReactStub
    throw new Error(`unexpected require: ${name}`)
  })
  const prompts = []
  isolated.apply({
    effect() {},
    locale: { register() {}, bind: () => (key) => key },
    slots: { inject() {} },
    remote: { session: { prompt: async (...args) => { prompts.push(args); return { ok: true } } } },
  })

  const originalFetch = globalThis.fetch
  const requests = []
  let generation = 0
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/api/conversation-tree/tree')) return { ok: true, json: async () => tree }
    assert.equal(url, '/api/conversation-tree/summarize')
    requests.push(JSON.parse(options.body))
    generation += 1
    return { ok: true, json: async () => ({ summary: generation === 1 ? '旧摘要' : '新摘要' }) }
  }

  // Unlike the one-shot render helper, retain the hook state between renders.
  const context = { states: [], refs: [], index: 0 }
  const props = {
    dialog: { id: 101, kind: 'target', sessionId: 'b', sourceId: 'b' },
    sessions,
    archived: new Set(['c']),
  }
  function renderDialog() {
    const previous = hookContext
    hookContext = context
    context.index = 0
    try { return isolated.__test.TargetDialog(props) } finally { hookContext = previous }
  }
  function findElement(element, predicate) {
    if (Array.isArray(element)) {
      for (const child of element) {
        const found = findElement(child, predicate)
        if (found !== undefined) return found
      }
      return undefined
    }
    if (element === null || element === undefined || typeof element !== 'object') return undefined
    if (predicate(element)) return element
    return findElement(element.props?.children, predicate)
  }
  function footerButton(dialog, label) {
    return findElement(dialog.props.footer, (element) =>
      typeof element.props?.onClick === 'function' && render(element.props.children).includes(label))
  }

  try {
    await isolated.__test.store.loadTree('b', true)
    let dialog = renderDialog()
    const target = findElement(dialog.props.children, (element) =>
      element.props?.role === 'radio' && render(element.props.children).includes('分支 A'))
    assert.ok(target, 'the target can be selected through the picker')
    target.props.onClick()
    dialog = renderDialog()
    await footerButton(dialog, '生成摘要预览').props.onClick()
    dialog = renderDialog()
    assert.deepEqual(requests, [{ sessionId: 'b' }])
    assert.equal(findElement(dialog.props.children, (element) => element.type === 'textarea').props.value, '旧摘要')
    assert.ok(footerButton(dialog, '发送'))
    assert.deepEqual(prompts, [])

    // A conversation that already switched models regenerates directly, with
    // no extra provider confirmation standing between it and its current model.
    await footerButton(dialog, '重新生成').props.onClick()
    dialog = renderDialog()
    assert.deepEqual(requests, [{ sessionId: 'b' }, { sessionId: 'b' }])
    assert.equal(findElement(dialog.props.children, (element) => element.type === 'textarea').props.value, '新摘要')
    assert.equal(render(dialog.props.children).includes('target.providerChange'), false)
    assert.equal(footerButton(dialog, '确认并生成摘要'), undefined)
    assert.deepEqual(prompts, [])

    // Sending is a separate action and targets only the chosen conversation.
    await footerButton(dialog, '发送').props.onClick()
    assert.equal(prompts.length, 1)
    const [body] = prompts[0]
    assert.equal(body.sessionId, 'a')
    assert.equal(body.mode, 'queue')
    assert.ok(body.content[0].text.includes('新摘要'))
    assert.ok(body.content[0].text.includes('分支 B'))
  } finally {
    globalThis.fetch = originalFetch
  }
})

const forestSolo = node('solo', null, { atSeq: null, turn: null, snippet: '', title: '' })
const forestBranch = node('n1', 'solo', { title: '分支甲' })
const forestOld = node('old', null, { atSeq: null, turn: null, snippet: '', title: '' })
const forest = {
  version: 2,
  components: [
    { rootId: 'r', nodes: tree.nodes.map((entry) => ({ ...entry })) },
    { rootId: 'solo', nodes: [forestSolo, forestBranch] },
    { rootId: 'old', nodes: [forestOld] },
  ],
  conversationCount: 3,
  branchCount: 4,
}

const forestSessions = {
  byId: {
    ...sessions.byId,
    solo: { id: 'solo', title: '单独对话', displayTitle: '单独对话', running: false, updatedAt: 5_000 },
    n1: { id: 'n1', title: '分支甲', displayTitle: '分支甲', running: false, updatedAt: 6_000 },
    old: { id: 'old', title: '旧对话', displayTitle: '旧对话', running: false, updatedAt: 700 },
  },
}

test('componentTree turns one forest component into the graph tree shape', () => {
  const shape = componentTree({ rootId: 'r', nodes: tree.nodes }, 'c')
  assert.equal(shape.rootId, 'r')
  assert.equal(shape.currentId, 'c')
  assert.equal(shape.branchCount, 3)
  assert.equal(shape.nodes.length, 4)
  assert.equal(componentTree({ rootId: 'r', nodes: tree.nodes }, 'missing').currentId, 'r')
  assert.equal(componentTree({ rootId: 'r', nodes: tree.nodes }).currentId, 'r')
})

test('workspaceView resolves the owning workspace and falls back to one session', () => {
  const view = workspaceView({
    items: [{ workspaceId: 'w1', title: '工作区 A', sessionIds: ['b', 'x', 'b'] }],
  }, 'b')
  assert.equal(view.key, 'w1')
  assert.equal(view.title, '工作区 A')
  assert.deepEqual(view.sessionIds, ['b', 'x'])

  const fallback = workspaceView({ archivedSessionIds: [] }, 'b')
  assert.equal(fallback.key, 'session:b')
  assert.deepEqual(fallback.sessionIds, ['b'])
})

test('forestModels lists every workspace conversation, with the current one first', () => {
  const projection = forestModels(forest, {
    sessions: forestSessions,
    archived: new Set(['old']),
    showArchived: false,
    query: '',
    currentSessionId: 'b',
  })
  assert.equal(projection.conversationCount, 2)
  assert.equal(projection.branchCount, 4)
  assert.equal(projection.hasArchived, true)
  assert.deepEqual(projection.models.map((model) => model.id), ['r', 'solo'])
  assert.equal(projection.models[0].current, true)
  assert.equal(projection.models[0].branchCount, 3)
  assert.equal(projection.models[0].tree.currentId, 'b')
  // The newest conversation is not first; the one being read is.
  assert.equal(projection.models[1].updatedAt, 6_000)
})

test('forestModels hides archived roots until asked', () => {
  const shown = forestModels(forest, {
    sessions: forestSessions,
    archived: new Set(['old']),
    showArchived: true,
    currentSessionId: 'b',
  })
  assert.equal(shown.conversationCount, 3)
  assert.equal(shown.models.some((model) => model.id === 'old'), true)
})

function forestItems(archived = new Set(['old'])) {
  const projection = forestModels(forest, { sessions: forestSessions, archived, currentSessionId: 'b' })
  return projection.models.map((model) => ({
    key: model.id,
    model,
    graph: buildGraph(model.tree, { sessions: forestSessions, archived }),
  }))
}

test('layoutPanels packs every conversation on one canvas without overlap', () => {
  const items = forestItems()
  const layout = layoutPanels(items, { width: 1200, height: 900 })
  assert.equal(layout.sections.length, 2)
  for (const section of layout.sections) {
    assert.ok(section.width >= 240)
    assert.ok(section.x >= 0 && section.y >= 0)
    assert.ok(section.x + section.width <= layout.bounds.width + 0.001)
    assert.ok(section.y + section.height <= layout.bounds.height + 0.001)
  }
  const [first, second] = layout.sections
  const overlap = first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.height && second.y < first.y + first.height
  assert.equal(overlap, false)

  const collapsed = layoutPanels(items, { width: 1200, height: 900 }, new Set(['r']))
  const folded = collapsed.sections.find((section) => section.key === 'r')
  assert.equal(folded.collapsed, true)
  assert.equal(folded.height, 34)
  assert.ok(folded.width <= 360)
})

test('layoutPanels adds a column only when that makes the Workspace readable', () => {
  const item = (key, height = 900) => ({
    key,
    model: { id: key, title: key, branchCount: 0, current: false, rootArchived: false, running: false, updatedAt: null },
    graph: { bounds: { width: 480, height }, nodes: [], edges: [], byId: new Map(), current: null },
  })
  const wide = layoutPanels([item('a'), item('b'), item('c'), item('d')], { width: 1000, height: 640 })
  assert.equal(wide.sections.length, 4)
  assert.ok(new Set(wide.sections.map((section) => section.x)).size > 1)

  const short = layoutPanels([item('a', 200), item('b', 200)], { width: 1000, height: 640 })
  assert.equal(new Set(short.sections.map((section) => section.x)).size, 1)
})

test('treeForNode finds a component in either a forest or a loaded tree', () => {
  const fromForest = treeForNode({ trees: {}, forests: { w1: forest } }, 'n1')
  assert.equal(fromForest.rootId, 'solo')
  assert.equal(fromForest.nodes.length, 2)
  const fromTree = treeForNode({ trees: { b: tree }, forests: {} }, 'a')
  assert.equal(fromTree.rootId, 'r')
  assert.equal(treeForNode({ trees: {}, forests: {} }, 'n1'), undefined)
})

test('workspace overview renders every conversation on one shared canvas', async () => {
  const h = ReactStub.createElement
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    assert.ok(String(url).includes('/api/conversation-tree/forest'))
    return { ok: true, json: async () => forest }
  }
  try {
    const loaded = await store.loadForest('w1', 'b')
    assert.equal(loaded.components.length, 3)
  } finally {
    globalThis.fetch = originalFetch
  }
  const workspaces = {
    items: [{ workspaceId: 'w1', title: '工作区 A', sessionIds: ['r', 'solo', 'old'] }],
    archivedSessionIds: ['old'],
  }
  const noop = () => {}
  assert.doesNotThrow(() => render(h(TreeView, {
    sessionId: 'b',
    useSessions: () => forestSessions,
    useWorkspaces: () => workspaces,
    useSessionAccess: () => true,
  })))

  const layout = layoutPanels(forestItems(), { width: 1200, height: 900 })
  const canvasProps = {
    sections: layout.sections,
    bounds: layout.bounds,
    selectedId: 'b',
    center: null,
    onSelect: noop,
    onOpen: noop,
    onFocus: noop,
    onEscape: noop,
    onToggleCollapse: noop,
    onTogglePanel: noop,
  }
  assert.doesNotThrow(() => render(h(TreeCanvas, canvasProps)))
  assert.doesNotThrow(() => render(h(TreePanel, {
    section: layout.sections[0],
    selectedId: 'b',
    onSelect: noop,
    onOpen: noop,
    onToggleCollapse: noop,
    onTogglePanel: noop,
  })))
})

test('tree UI components render without throwing', () => {
  const h = ReactStub.createElement
  const graph = buildGraph(tree, { sessions, archived: new Set(['c']) })
  const noop = () => {}
  assert.doesNotThrow(() => render(h(TreeHeader, {
    counts: '3 条分支 · 4 个对话',
    hasArchived: true,
    loading: false,
    onRefresh: noop,
  })))
  assert.doesNotThrow(() => render(h(TreeCanvas, {
    sections: [{
      key: 'r',
      model: {
        id: 'r',
        tree,
        title: '主对话',
        branchCount: 3,
        current: true,
        rootArchived: false,
        running: false,
        updatedAt: 1_000,
      },
      graph,
      collapsed: false,
      x: 0,
      y: 0,
      width: graph.bounds.width,
      height: 34 + graph.bounds.height,
    }],
    bounds: { width: graph.bounds.width, height: 34 + graph.bounds.height },
    selectedId: 'b',
    onSelect: noop,
    onOpen: noop,
    onFocus: noop,
    onEscape: noop,
    onToggleCollapse: noop,
    onTogglePanel: noop,
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

test('the inspector is one scrolling column plus the danger bar', () => {
  const noop = () => {}
  const graph = buildGraph(tree, { sessions, archived: new Set(['c']) })
  const aside = withHooks(NodeInspector, {
    entry: graph.byId.get('b'),
    graph,
    onSelect: noop,
    onOpen: noop,
    onBring: noop,
    onArchive: noop,
    onDelete: noop,
    onUnarchive: noop,
    onNote: noop,
    onCompare: noop,
    useSessionAccess: () => true,
  })
  // Every direct child of the panel is either the scroll area or the danger
  // bar. The usage section once closed one parenthesis too late and became a
  // pinned footer: it lost the section rhythm and could never scroll.
  const children = (Array.isArray(aside.props.children) ? aside.props.children : [aside.props.children])
    .filter((child) => child !== null && child !== undefined)
  assert.deepEqual(children.map((child) => child.props?.className ?? ''), ['ct-side-scroll', 'ct-side-danger'])
  const inside = []
  const walk = (element) => {
    if (element === null || element === undefined || typeof element !== 'object') return
    if (Array.isArray(element)) {
      for (const child of element) walk(child)
      return
    }
    inside.push(element)
    walk(element.props?.children)
  }
  walk(children[0])
  assert.ok(
    inside.some((element) => element.props?.className === 'ct-usage-number'),
    'the usage block belongs inside the scrolling column',
  )
})

test('trimCache keeps the newest entries and leaves a small cache alone', () => {
  const record = {
    old: { fetchedAt: 10 },
    mid: { fetchedAt: 20 },
    fresh: { fetchedAt: 30 },
  }
  assert.deepEqual(Object.keys(trimCache(record, 2)).sort(), ['fresh', 'mid'])
  // Below the limit the same object comes back, so the store does not churn.
  assert.equal(trimCache(record, 5), record)
  assert.deepEqual(trimCache({}, 3), {})
})

test('a comparison column renders one side without throwing', () => {
  const h = ReactStub.createElement
  assert.doesNotThrow(() => render(h(CompareSide, {
    side: {
      id: 'b',
      title: '分支 B',
      turns: 3,
      steps: 5,
      toolCalls: 2,
      usage: { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 0 },
      model: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' },
      lastAssistant: '先说结论：方案 B 走通了。',
    },
    sessions,
  })))
  assert.doesNotThrow(() => render(h(CompareSide, {
    side: { id: 'c', title: '', turns: 0, steps: 0, toolCalls: 0, usage: {}, model: null, lastAssistant: '' },
    sessions,
  })))
})
