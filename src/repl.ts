import Table from 'cli-table'
import * as repl from 'node:repl'
import 'colors'
import type { Connection, Session } from 'autobahn'
import { inspect } from 'node:util'
import YAML from 'yaml'

export const start = (connection: Connection) => (session: Session) => {
  const commandTable = new Table({ head: ['Command', 'Description'] })
  commandTable.push(['.SUB <topic>', 'Subscript to a topic'])
  commandTable.push(['.PUB <topic>', 'Publish to a topic'])
  commandTable.push(['.REG <procedure>', 'Register a RPC endpoint'])
  commandTable.push(['.CALL <procedure>', 'Call a RPC endpoint'])

  const variableTable = new Table({ head: ['Variable', 'Description'] })
  variableTable.push(['connection', 'The WAMP connection'])
  variableTable.push(['session', 'The WAMP session'])

  console.info()
  console.info('Connected'.green.bold)
  console.info()
  console.info(commandTable.toString())
  console.info()
  console.info(variableTable.toString())
  console.info()

  const replServer = repl.start({
    prompt: '$> '.magenta,
  })

  replServer.defineCommand('SUB', {
    help: 'Subscript to a topic.',
    action: command('Usage: .SUB <topic>', async function (topic) {
      await session.subscribe(topic, (args, kwargs) => {
        process.stdout.write('\r')
        console.info(
          'PUB>'.cyan,
          `${topic}>`.yellow,
          inspect({ args, kwargs }, false, 10),
        )
        this.displayPrompt()
      })
      console.info('Subscribed to', topic.green)
    }),
  })

  replServer.defineCommand('PUB', {
    help: 'Publish to a topic.',
    action: command('Usage: .PUB <topic>', async function (topic) {
      const args = await question(this, 'Enter args (YAML array)> '.magenta, [])

      const kwargs = await question(
        this,
        'Enter kwargs (YAML object)> '.magenta,
        {},
      )

      await session.publish(topic.trim(), args, kwargs, {
        exclude_me: false,
      })

      console.info(
        'Published to',
        topic.green,
        inspect({ args, kwargs }, false, 10).yellow,
      )
    }),
  })

  replServer.defineCommand('REG', {
    help: 'Register a RPC endpoint.',
    action: command('Usage: .REG <procedure>', async function (procedure) {
      await session.register(procedure.trim(), (args, kwargs) => {
        process.stdout.write('\r')
        console.info(
          'CALL>'.cyan,
          `${procedure}>`.yellow,
          inspect({ args, kwargs }, false, 10),
        )
        this.displayPrompt()
      })
      console.info('Register a', procedure.green, 'endpoint')
    }),
  })

  replServer.defineCommand('CALL', {
    help: 'Call a RPC endpoint',
    action: command('Usage: .CALL <procedure>', async function (procedure) {
      const args = await question(this, 'Enter args (YAML array)> '.magenta, [])

      const kwargs = await question(
        this,
        'Enter kwargs (YAML object)> '.magenta,
        {},
      )

      const response = await session.call(procedure, args, kwargs)

      console.info(
        'Called',
        procedure.green,
        inspect({ args, kwargs }, false, 10).yellow,
      )

      console.info('RES>'.cyan, response)
    }),
  })

  replServer.on('reset', reset)

  reset()

  function reset() {
    Object.assign(replServer.context, { connection, session })
    replServer.once('exit', () => connection.close())
  }
}

function command(
  usage: string,
  cmd: (this: repl.REPLServer, input: string) => Promise<void>,
) {
  return async function (this: repl.REPLServer, input: string) {
    const $input = input.trim()

    if (!$input) {
      console.error(usage.red)
      this.displayPrompt()
      return
    }

    try {
      await cmd.call(this, $input)
    } catch (error) {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`.red,
      )
    } finally {
      this.displayPrompt()
    }
  }
}

function question<T>(
  replServer: repl.REPLServer,
  question: string,
  dflt: T,
): Promise<string> {
  return new Promise<string>((resolve) => {
    replServer.question(question, (answer) => {
      const trimmedAnswer = answer.trim()
      resolve(trimmedAnswer ? YAML.parse(trimmedAnswer) : dflt)
    })
  })
}
