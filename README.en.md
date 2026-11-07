# dsh-conversation-tree

English | [中文](README.md)

[![CI](https://github.com/jiangyuxue666/dsh-conversation-tree/actions/workflows/ci.yml/badge.svg)](https://github.com/jiangyuxue666/dsh-conversation-tree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> A workspace-wide conversation-tree view for DeepSeek Harness.

A web plugin for DeepSeek Harness. It draws every conversation of a workspace, together with the branches derived from them, on a single canvas — for reading branch lineage and per-conversation usage, and for branching, bringing context back, archiving and deleting. A branch is an ordinary DSH session: models, tools and slash commands behave as usual.

## Features

- **Workspace canvas** — every conversation is one tree, laid out on a shared canvas that pans and zooms; the current conversation is pinned first and highlighted.
- **Branching** — `Tree branch` under any completed turn creates a child session that inherits the context up to that turn and records its source conversation, turn and branch-point excerpt.
- **Node details** — source, branch turn, depth, the conversation's own turns and steps, token breakdown, cache hit rate and model.
- **Notes** — name any conversation or branch; the name shows on the node (a root shows it on its own node) and search matches it. Notes live in the plugin's registry, never in the session log. A fresh branch starts with the message it forked at as its note.
- **Compare** — select a node, press `Compare` in the side panel and pick another (or `Shift`-click one) to see turns, steps, tool calls, usage, model, the prompts each side opened with and the last conclusion side by side.
- **Bring back** — compresses the turns a conversation produced itself (skipping the inherited fork prefix) into a summary, offers an editable preview, then queues it into a target conversation.
- **Branch from the tree** — `Branch from here` forks the newest completed turn of the conversation you are reading, without going back to the chat page.
- **Where this tree got to** — one model call over the whole tree: each branch's conclusion, where it stalled, and which one is worth keeping. Only runs when you press it.
- **Unread dot** — a branch that moved on since you last looked at it shows a dot.
- **Export** — the whole tree as a Markdown outline, with titles and notes.
- **Archive and delete** — in the side panel; deletion is limited to branches created by this plugin and runs as soon as you confirm.
- **Search and keyboard** — cross-tree matching on titles and branch-point excerpts, centring the first hit; arrow keys, `Enter`, `Home`/`End`, `+`/`-` and `f`.

## Requirements

DSH `>=0.2.2-rc.1 <0.3.0`.

## Installation

```bash
dsh plugin --profile web add github:jiangyuxue666/dsh-conversation-tree
```

Alternatively, enter the repository URL in **Settings → Plugins → Add plugin**:

```
https://github.com/jiangyuxue666/dsh-conversation-tree
```

Installation writes the plugin into the profile's `dsh.profile.bundles`; restart DSH to apply.

### From a tarball

```bash
npm pack
dsh plugin --profile web add ./jiangyuxue666-dsh-conversation-tree-0.7.1.tgz
```

### Local development

```bash
dsh plugin --profile web add /path/to/dsh-conversation-tree
```

Links the source directory into the profile; restart DSH after edits, no reinstall needed.

`@deepseek-ai/dsh-session` is declared as a peer dependency and provided by DSH. Run `npm install` before running the tests locally.

## Usage

1. Open the conversation and locate the turn to branch from.
2. Click `Tree branch` under the message.
3. Open the `Tree` tab to see every tree in the workspace.
4. Click a node for details; double-click to open the conversation.
5. Drag the canvas to pan, scroll to zoom; the corner button fits the canvas and may enlarge a small tree up to 150%. With several trees each header arrow collapses one tree; a lone tree has no header. Conversations that never branched stay folded at the bottom of the canvas.
6. Use `Bring back` in the side panel to send a summary to a target conversation.
7. Archive or delete a subtree at the bottom of the side panel.

## Notes

- The tree only manages sessions created through `Tree branch`; forks created by the native DSH button are not shown.
- Branch sessions also appear in the regular conversation list; the tree is an additional management view.
- Deleting a conversation from the sidebar (or another plugin) is reconciled on the next read: the children of the deleted node move up to the nearest live ancestor and are marked as re-linked; when the whole ancestor chain is gone, they become roots of their own trees instead of leaving a node nothing can open.
- Workspace membership is resolved by the host from the workspace registry; more than 2000 sessions in one request are truncated with a notice.
- In a large Workspace the usage pass covers the trees near the current conversation (at most 120 cold session logs per response) and the page says which ones were left out.
- Deletion is supported only on macOS and Windows, against the verified JSONL backend; other platforms can still branch, view and bring back.
- Root conversations cannot be deleted; archiving a branch uses DSH's native archive and can be undone.
- Tree edges live in `$DSH_HOME/conversation-tree.json`, with a second copy in each branch's session log; a lost registry can be rebuilt from the logs.
- Write routes validate same-origin (`Origin` against `Host`).

## Development

```bash
npm install
npm test
```

Layout:

- `index.js` — entry: route constants, `inject`, `apply`, test exports
- `lib/base.js` — same-origin check, JSON reading, failure responses
- `lib/registry.js` — branch-edge registry and cross-process lock
- `lib/liveness.js` — live-Session sampling, the basis for self-repair
- `lib/reconcile.js` — ghost-edge repair: drop deleted nodes, promote or detach their branches
- `lib/tree.js` — `/tree` and `/forest` reads and projections
- `lib/session.js` — session log access, pending promotion, ancestor recovery
- `lib/branch.js` — branch creation
- `lib/summarize.js` — bring-back summaries
- `lib/tree-summary.js` — the whole-tree digest
- `lib/delete.js` — subtree deletion, including platform branches
- `lib/stats.js` — token and turn statistics with a persistent cache
- `lib/models.js` — model routes and presets
- `lib/transcript.js` — events to text
- `lib/handles.js` — live agent handle table
- `client.js` — web client; DSH registers one factory per client bundle, so it stays a single file

Host routes:

- `POST /api/conversation-tree/branch`
- `GET  /api/conversation-tree/tree?sessionId=...`
- `POST /api/conversation-tree/forest`
- `POST /api/conversation-tree/summarize`
- `POST /api/conversation-tree/delete`
- `POST /api/conversation-tree/note`
- `POST /api/conversation-tree/compare`
- `POST /api/conversation-tree/peek`
- `POST /api/conversation-tree/tree-summary`

## Compatibility

- DSH `>=0.2.2-rc.1 <0.3.0`
- Deletion: macOS / Windows

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT.
