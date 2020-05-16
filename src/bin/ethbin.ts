#!/usr/bin/env node

import * as path from 'path'
import {CLI, Shim} from '../../node_modules/clime'
import { clientSpecifierToCommand } from './lib'
import { Grid } from '../Grid'

console.log(`
⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫
⧫                                                           ⧫
⧫           _   _     _     _                               ⧫
⧫          | | | |   | |   (_)                              ⧫
⧫       ___| |_| |__ | |__  _ _ __   __ _ _ __ _   _        ⧫
⧫      / _ \\ __| '_ \\| '_ \\| | '_ \\ / _\` | '__| | | |       ⧫
⧫     |  __/ |_| | | | |_) | | | | | (_| | |  | |_| |       ⧫
⧫      \\___|\\__|_| |_|_.__/|_|_| |_|\\__,_|_|   \\__, |       ⧫
⧫                                               __/ |       ⧫
⧫                                              |___/        ⧫
⧫            Manage Ethereum Binaries from CLI              ⧫              
⧫                                                           ⧫
⧫                                                           ⧫
⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫
`)


class MyCLI extends CLI {
  async execute(argv: string[],
    contextExtension: object | string | undefined,
    cwd?: string | undefined,) {
      
    const supportedClients = await new Grid().getAvailableClients()
    let idx = argv.findIndex(arg => arg.startsWith('geth'))
    if (idx === -1) {
      // @ts-ignore
      return super.execute(argv, contextExtension, cwd)
    }  
    console.log('idx', idx)
    let command = clientSpecifierToCommand(argv[idx])
    let rest = argv.slice(idx + 1)
    const ESCAPE = '__'
    rest = ['--flags', ESCAPE+rest.join(' ')]

    const transformedCommand = [...command, ...rest]
    console.log('transformed', argv, transformedCommand)
    // @ts-ignore
    return super.execute(transformedCommand, contextExtension, cwd)
  }
}

// The second parameter is the path to folder that contains command modules.
let cli = new MyCLI(`ethbinary`, path.join(__dirname, 'commands'))

// Clime in its core provides an object-based command-line infrastructure.
// To have it work as a common CLI, a shim needs to be applied:
let shim = new Shim(cli)
shim.execute(process.argv)
