import test from 'node:test'
import assert from 'node:assert/strict'
import { __test } from './index.js'

const {
  buildTree,
  branchPoint,
  resolveBranchBoundary,
  branchTitle,
  subtreeEdges,
  titleOfEvents,
  validEdge,
  sideProjectKey,
  sideSegment,
  statsNodeSelection,
} = __test

function edge(childId, parentId, extra = {}) {
  return {
    childId,
    parentId,
    atSeq: 7,
    turn: 2,
    snippet: '这是分支点',
    title: `${parentId} · 分支`,
    createdAt: 100,
    ...extra,
  }
}

test('buildTree resolves a nested tree and its current path depth', () => {
  const known = {
    edges: [
      edge('a', 'r', { createdAt: 100 }),
      edge('b', 'a', { createdAt: 200 }),
      edge('c', 'r', { createdAt: 300 }),
    ],
    pending: [],
  }
  const tree = buildTree(known, 'b')
  assert.equal(tree.rootId, 'r')
  assert.equal(tree.currentId, 'b')
  assert.equal(tree.branchCount, 3)
  assert.deepEqual(tree.nodes.map((node) => node.id), ['r', 'a', 'c', 'b'])
  assert.deepEqual(tree.nodes.map((node) => node.depth), [0, 1, 1, 2])
  assert.equal(tree.nodes.find((node) => node.id === 'r').childCount, 2)
  assert.equal(tree.nodes.find((node) => node.id === 'a').childCount, 1)
  assert.equal(tree.nodes.find((node) => node.id === 'b').turn, 2)
})

test('buildTree includes pending edges and marks them', () => {
  const tree = buildTree({ edges: [], pending: [edge('a', 'r')] }, 'a')
  assert.equal(tree.rootId, 'r')
  assert.equal(tree.nodes.find((node) => node.id === 'a').pending, true)
})

test('buildTree refuses a cycle instead of looping forever', () => {
  assert.throws(() => buildTree({ edges: [edge('a', 'r'), edge('r', 'a')], pending: [] }, 'a'), /cycle/)
})

test('branchPoint counts Turns and captures the prompt excerpt', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'user/message', data: { content: [{ type: 'text', text: '第一个问题' }] } },
    { seq: 2, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '第一个回答' }] } } },
    { seq: 3, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
    { seq: 4, type: 'turn/start', data: { turn: 2 } },
    { seq: 5, type: 'user/message', data: { content: [{ type: 'text', text: '第二个问题' }] } },
    { seq: 6, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '第二个回答' }] } } },
    { seq: 7, type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } } },
  ]
  assert.deepEqual(branchPoint(events, 7), { turn: 2, snippet: '第二个问题' })
  assert.deepEqual(branchPoint(events, 3), { turn: 1, snippet: '第一个问题' })
})

test('resolveBranchBoundary maps a closing Assistant message to the Turn end', () => {
  const events = [
    { seq: 0, type: 'turn/start', data: { turn: 1 } },
    { seq: 1, type: 'assistant/message', data: { turn: 1, message: { content: [] } } },
    { seq: 2, type: 'turn/end', data: { turn: 1 } },
    { seq: 3, type: 'turn/start', data: { turn: 2 } },
  ]
  assert.equal(resolveBranchBoundary(events, 1), 2)
  assert.equal(resolveBranchBoundary(events, 2), 2)
  assert.equal(resolveBranchBoundary(events, 0), -1)
  assert.equal(resolveBranchBoundary(events, 99), -1)
})

test('branchTitle keeps a readable parent prefix and ordinal', () => {
  assert.equal(branchTitle('主对话', 1), '主对话 · 分支')
  assert.equal(branchTitle('主对话', 3), '主对话 · 分支 3')
  assert.ok(branchTitle('x'.repeat(200), 1).length <= 80)
})

test('subtreeEdges returns children before parents', () => {
  const edges = [edge('a', 'r'), edge('b', 'a'), edge('c', 'b')]
  assert.deepEqual(subtreeEdges(edges, 'a').map((entry) => entry.childId), ['c', 'b', 'a'])
  assert.deepEqual(subtreeEdges(edges, 'b').map((entry) => entry.childId), ['c', 'b'])
})

test('titleOfEvents takes the latest durable title', () => {
  assert.equal(titleOfEvents([
    { type: 'session/title', data: { title: '旧标题' } },
    { type: 'session/title', data: { title: '新标题' } },
  ]), '新标题')
  assert.equal(titleOfEvents([]), '')
})

test('validEdge rejects self-parenting and malformed boundaries', () => {
  assert.equal(validEdge(edge('a', 'r')), true)
  assert.equal(validEdge(edge('a', 'a')), false)
  assert.equal(validEdge(edge('a', 'r', { atSeq: -1 })), false)
  assert.equal(validEdge(edge('a', 'r', { turn: 0 })), false)
  assert.equal(validEdge({ ...edge('a', 'r'), snippet: undefined }), false)
})

test('session path encoding is stable for the verified backend', () => {
  assert.equal(sideProjectKey('G:\\workspace\\demo'), '--G-workspace-demo--')
  assert.equal(sideSegment('session-abc'), 'session-abc')
  assert.equal(sideSegment('.'), '~002E')
})

test('statsNodeSelection reads the current tree first, whole trees at a time', () => {
  const components = [
    { rootId: 'r1', nodes: [{ id: 'a' }, { id: 'b' }] },
    { rootId: 'r2', nodes: [{ id: 'c' }, { id: 'd' }] },
    { rootId: 'r3', nodes: [{ id: 'e' }] },
  ]
  const picked = statsNodeSelection(components, 'c', 3)
  // The current conversation's tree comes first, and a tree is never split:
  // showing usage on half of one tree reads as a bug.
  assert.deepEqual(picked.nodes.map((node) => node.id), ['c', 'd', 'a', 'b'])
  assert.equal(picked.truncated, true)

  const everything = statsNodeSelection(components, 'e', 10)
  assert.equal(everything.truncated, false)
  assert.equal(everything.nodes.length, 5)
  assert.deepEqual(everything.nodes.map((node) => node.id), ['e', 'a', 'b', 'c', 'd'])
})
