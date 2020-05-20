#!/usr/bin/env node

import * as path from 'path'
import { CLI, Shim } from 'clime'
import { clientSpecifierToCommand } from './lib'
import { MultiClientManager as ClientManager } from '../ClientManager'

const version = require('../../package.json').version
console.log(`

⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫
⧫                                                           ⧫
⧫                     Ethbinary ${version}                       ⧫
⧫                                                           ⧫
⧫          Manage & Interact with Ethereum Binaries         ⧫   
⧫                                                           ⧫
⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫ ⧫

`)


class MyCLI extends CLI {
  async execute(argv: string[],
    contextExtension: object | string | undefined,
    cwd?: string | undefined, ) {

    const supportedClients = await ClientManager.getInstance().getAvailableClients()
    let idx = argv.findIndex(arg => supportedClients.some(sc => arg.startsWith(sc)))

    if (idx === -1) {
      // @ts-ignore
      return super.execute(argv, contextExtension, cwd)
    }

    // transform client specifier syntax
    let clientName = argv[idx]
    let clientArgs = [clientName]
    if (clientName.includes('@')) {
      let [_clientName, clientVersion] = clientName.split('@')
      clientArgs = [_clientName, '--clientVersion', clientVersion]
    }

    // the problem is that we want to pass through all client flags such as --goerli
    // without explicitly defining ass possible flags here
    // therefore we need to detect the begin of client flags and escape them
    let clientCommands = argv.slice(idx + 1)  // +1 do not include client name
    // console.log('client options', clientCommands)

    // flags handled by this cli shoud be skipped
    const whitelistFlags = ['--clientVersion']
    const firstFlagIdx = clientCommands.findIndex(c => !whitelistFlags.includes(c) && c.startsWith('-'))
    let clientFlags : string[] = []
    if (firstFlagIdx !== -1) {
      clientCommands = clientCommands.slice(0, firstFlagIdx)
      clientFlags = clientCommands.slice(firstFlagIdx)
    }

    // turn all client specific flags into one space separated string
    // use escape sequence to avoid syntax error --flags --... (cannot be another flag)
    const ESCAPE = '/'
    const escapedFlags = ['--clientFlags', ESCAPE + clientFlags.join(' ')]

    // take everything before client name, append escaped client flags
    // [ 'start', 'geth', '--goerli' ] => [ 'start', 'geth', '--clientFlags', '/--goerli' ]
    // [ 'start', 'geth@latest', '--goerli' ] => [ 'start', 'geth', '--clientVersion', 'latest', '--clientFlags', '/--goerli' ]
    const transformedCommand = [...argv.slice(0, idx), ...clientArgs, ...clientCommands, ...escapedFlags]
    
    // NOTE: use for debugging
    // console.log('transformed command', transformedCommand)

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
