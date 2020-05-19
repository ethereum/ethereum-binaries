import {Command, command, metadata, param, Options, option} from 'clime'
import { startClient } from '../lib';
import chalk from 'chalk'

export class ClientOptions extends Options {
  @option({
    name: 'clientFlags',
    description: 'list of flags',
    default: '',
  })
  flags?: string;
  @option({
    name: 'clientVersion',
    description: 'sets the client version',
    default: 'latest',
  })
  version?: string;
}

@command({
  description: 'Starts a client',
})
export default class extends Command {
  @metadata
  public async execute(
    @param({
      name: 'client',
      description: 'client name',
      required: true,
    })
    clientName: string,
    options: ClientOptions
  ){
    const { version: clientVersion } = options
    const flags = options.flags?.slice('/'.length).split(' ').filter(f => f !== '')
    console.log(chalk.bold(`Starting client: "${clientName}" version: "${clientVersion}" with flags:`, JSON.stringify(flags)))
    try {
      await startClient(clientName, clientVersion, flags, {
        stdio: 'inherit'
      })
    } catch (error) {
      console.log(chalk.red.bold('Client error - '+error.message))
    }
  }
}