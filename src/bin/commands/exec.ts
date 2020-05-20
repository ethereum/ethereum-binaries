import {Command, command, metadata, param, Options, option} from 'clime'
import chalk from 'chalk'
import { execClient } from '../lib';

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
  description: 'Executes a command on a client',
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
    @param({
      name: 'command',
      description: 'command to execute',
      default: 'latest',
      required: false,
    })
    command: string,
    options: ClientOptions
  ){
    const { version: clientVersion } = options
    console.log(chalk.bold(`Executing client command - client: "${clientName}" version: "${clientVersion}" command: ${command}\n`))
    try {
      await execClient(clientName, clientVersion, command)
    } catch (error) {
      console.log(chalk.red.bold('Client error - '+error.message))
    }
  }
}