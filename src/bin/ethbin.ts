#!/usr/bin/env node

import * as path from 'path'
import {CLI, Shim} from '../../node_modules/clime'
import chalk from 'chalk'
import boxen from 'boxen'
import { clientSpecifierToCommand } from './lib'

console.log(`
⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫
⧫                                                           ⧫
⧫           _ ___     _  ___            _                   ⧫
⧫          |_  | |_| |_)  |  |\\ |  /\\  |_) \\_/              ⧫
⧫          |_  | | | |_) _|_ | \\| /--\\ | \\  |               ⧫
⧫                                                           ⧫
⧫          Manage Ethereum Binaries on CLI\                  ⧫              
⧫                                                           ⧫
⧫                                                           ⧫
⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫
`)


class MyCLI extends CLI {
  async execute(argv: string[],
    contextExtension: object | string | undefined,
    cwd?: string | undefined,) {
      
    const supportedClients = ['geth']
    let idx = argv.findIndex(arg => arg.startsWith('geth'))  

    let command = clientSpecifierToCommand(argv[idx])
    let rest = argv.slice(idx + 1)
    const ESCAPE = '__'
    rest = ['--flags', ESCAPE+rest.join(' ')]

    // @ts-ignore
    return super.execute([...command, ...rest], contextExtension, cwd)
  }
}

// The second parameter is the path to folder that contains command modules.
let cli = new MyCLI(`ethbin`, path.join(__dirname, 'commands'))

// Clime in its core provides an object-based command-line infrastructure.
// To have it work as a common CLI, a shim needs to be applied:
let shim = new Shim(cli)
shim.execute(process.argv)
