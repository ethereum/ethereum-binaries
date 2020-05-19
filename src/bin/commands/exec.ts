import {Command, command, metadata, param, Options, option} from 'clime'
import chalk from 'chalk'
import { ClientManager } from '../../ClientManager';

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
      const cm = ClientManager.getInstance()
      const client = await cm.getClient(clientName, clientVersion)
      // result can be ignore because 'inherit' will log everything to stdout
      const result = await cm.execute(client, command, {
        stdio: 'inherit'
      })
    } catch (error) {
      console.log(chalk.red.bold('Client error - '+error.message))
    }
  }
}