import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROUTER_URL = 'ws://localhost:8080/'
const DEFAULT_REALM = 'test1'

test('REPL connects to the live router', { timeout: 30_000 }, async () => {
  await using replSession = await startReplSession()
  await waitForOutput(replSession.readOutput, /Connected/, 10_000)
  assert.match(replSession.readOutput(), /Connected/)
})

test('REPL subscribes to a topic', { timeout: 30_000 }, async () => {
  await using replSession = await startReplSession()
  const topic = uniqueTopic()

  await waitForOutput(replSession.readOutput, /Connected/, 10_000)
  replSession.send(`.SUB ${topic}`)
  await waitForOutput(
    replSession.readOutput,
    new RegExp(`Subscribed to\\s+${escapeRegExp(topic)}`),
    10_000,
  )

  assert.match(
    replSession.readOutput(),
    new RegExp(`Subscribed to\\s+${escapeRegExp(topic)}`),
  )
})

test('REPL publishes to a topic', { timeout: 30_000 }, async () => {
  await using replSession = await startReplSession()
  const topic = uniqueTopic()

  await waitForOutput(replSession.readOutput, /Connected/, 10_000)
  replSession.send(`.PUB ${topic}`)
  await waitForOutput(
    replSession.readOutput,
    /Enter args \(YAML array\)>/,
    10_000,
  )
  replSession.send('[1, "two"]')
  await waitForOutput(
    replSession.readOutput,
    /Enter kwargs \(YAML object\)>/,
    10_000,
  )
  replSession.send('{ok: true, from: e2e}')
  await waitForOutput(
    replSession.readOutput,
    new RegExp(`Published to\\s+${escapeRegExp(topic)}`),
    10_000,
  )

  assert.match(
    replSession.readOutput(),
    new RegExp(`Published to\\s+${escapeRegExp(topic)}`),
  )
})

test(
  'REPL receives event on subscribed topic',
  { timeout: 30_000 },
  async () => {
    await using replSession = await startReplSession()
    const topic = uniqueTopic()

    await waitForOutput(replSession.readOutput, /Connected/, 10_000)
    replSession.send(`.SUB ${topic}`)
    await waitForOutput(
      replSession.readOutput,
      new RegExp(`Subscribed to\\s+${escapeRegExp(topic)}`),
      10_000,
    )

    replSession.send(`.PUB ${topic}`)
    await waitForOutput(
      replSession.readOutput,
      /Enter args \(YAML array\)>/,
      10_000,
    )
    replSession.send('[1, "two"]')
    await waitForOutput(
      replSession.readOutput,
      /Enter kwargs \(YAML object\)>/,
      10_000,
    )
    replSession.send('{ok: true, from: e2e}')
    await waitForOutput(
      replSession.readOutput,
      new RegExp(`PUB>\\s+${escapeRegExp(topic)}>`),
      10_000,
    )

    assert.match(
      replSession.readOutput(),
      new RegExp(`PUB>\\s+${escapeRegExp(topic)}>`),
    )
  },
)

async function startReplSession() {
  const routerUrl = process.env.WAMP_ROUTER_URL ?? DEFAULT_ROUTER_URL
  const realm = process.env.WAMP_REALM ?? DEFAULT_REALM
  const entrypointPath = fileURLToPath(
    new URL('../src/program.ts', import.meta.url),
  )
  const cwd = fileURLToPath(new URL('..', import.meta.url))

  const child = spawn(process.execPath, [entrypointPath, routerUrl, realm], {
    cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    output += chunk
  })
  child.stderr.on('data', (chunk: string) => {
    output += chunk
  })

  return {
    send(command: string) {
      child.stdin.write(`${command}\n`)
    },
    readOutput() {
      return stripAnsi(output)
    },
    async [Symbol.asyncDispose]() {
      {
        if (child.killed || child.exitCode !== null) {
          return
        }

        child.stdin.write('.exit\n')

        const closed = Promise.race([
          once(child, 'exit'),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('child did not exit in time')),
              2_000,
            )
          }),
        ])

        try {
          await closed
        } catch {
          child.kill('SIGKILL')
          await once(child, 'exit')
        }
      }
    },
  }
}

function uniqueTopic() {
  return `wamp-cli.e2e.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
}

async function waitForOutput(
  readOutput: () => string,
  pattern: RegExp,
  timeoutMs: number,
) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (pattern.test(readOutput())) {
      return
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }

  throw new Error(
    `Timed out waiting for output pattern: ${pattern.source}\nCurrent output:\n${readOutput()}`,
  )
}

function stripAnsi(text: string) {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
