#!/usr/bin/env node

import { Connection } from 'autobahn'
import { program } from 'commander'
import * as repl from './repl.ts'
import 'colors'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

program
  .version(pkg.version)
  .arguments('<url> <realm>')
  .action(start)
  .parse(process.argv)

function start(url: string, realm: string) {
  const connection = new Connection({ url, realm })
  connection.onopen = repl.start(connection)
  console.info(`Connecting to ${url} ${realm}`.italic.yellow)
  connection.open()
}
