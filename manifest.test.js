import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

/**
 * Host packages the plugin imports at runtime. They must be peer dependencies:
 * a `link:` install only receives the names a linked package lists as peers,
 * and a regular install receives them from the profile scope.
 */
const HOST_PACKAGES = ['@deepseek-ai/dsh-session']

test('host packages are peer dependencies, never bundled dependencies', () => {
  for (const name of HOST_PACKAGES) {
    assert.equal(
      typeof manifest.peerDependencies?.[name],
      'string',
      `${name} must be declared in peerDependencies: a linked install cannot resolve it from dependencies alone`,
    )
    assert.equal(manifest.dependencies?.[name], undefined, `${name} must not also be a bundled dependency`)
  }
})

test('the manifest declares the DSH runtime it was built against', () => {
  assert.match(manifest.engines?.dsh ?? '', /^>=?0\.2\.2-rc\.1/, 'engines.dsh must start at 0.2.2-rc.1')
})

test('the bundle patch and the client entry the manifest points at exist', async () => {
  const patchPath = manifest.dsh?.bundle?.patch
  assert.equal(typeof patchPath, 'string')
  await stat(join(root, patchPath))
  assert.equal(manifest.dsh?.client?.platform, 'web')

  for (const include of manifest.dsh?.client?.inject ?? []) {
    assert.match(include, /^@deepseek-ai\/dsh-client-ui-/, `unexpected client injection ${include}`)
  }
})

test('every export the manifest publishes resolves to a file', async () => {
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    assert.equal(typeof target, 'string', `export ${key} must be a path`)
    if (target.includes('*')) continue
    await stat(join(root, target))
  }
})

test('every module the entry imports ships with the package', async () => {
  const seen = new Set()
  const queue = ['index.js']
  const imports = []
  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const source = await readFile(join(root, file), 'utf8')
    for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
      const target = join(file, '..', match[1]).replace(/^\.\//, '')
      imports.push(target)
      queue.push(target)
    }
  }
  assert.ok(imports.length > 0, 'the entry must import its modules')
  for (const file of imports) {
    await stat(join(root, file))
    const published = (manifest.files ?? []).some((entry) => {
      if (entry === file) return true
      if (entry.endsWith('/*.js')) return file.startsWith(`${entry.slice(0, -5)}/`) && file.endsWith('.js')
      return false
    })
    assert.ok(published, `${file} is imported by the entry but missing from package.json files`)
  }
})

test('the package is publishable: no private flag, and repository metadata is set', () => {
  assert.notEqual(manifest.private, true, 'private: true blocks npm publish')
  assert.match(manifest.repository?.url ?? '', /^(git\+)?https:\/\/github\.com\//)
})
