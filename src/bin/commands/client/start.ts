import {Command, command, metadata, param, Options, option} from 'clime'
import { startClient } from '../../lib';
import chalk from 'chalk'

export class PassThroughOptions extends Options {
  @option({
    flag: 'f',
    description: 'list of flags',
    default: '',
  })
  flags?: string;
}

@command({
  description: 'Starts a client',
})
export default class extends Command {
  @metadata
  public execute(
    @param({
      name: 'client',
      description: 'client name',
      required: true,
    })
    clientName: string,
    @param({
      name: 'version',
      description: 'client version',
      default: 'latest',
      required: false,
    })
    clientVersion: string,
    options: PassThroughOptions
  ){
    const flags = options.flags?.slice('__'.length).split(' ')
    console.log(chalk.bold(`Starting client: "${clientName}" version: "${clientVersion}" with flags:`, flags))
    startClient(clientName, clientVersion, flags)
  }
}