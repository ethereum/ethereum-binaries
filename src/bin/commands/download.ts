import { Command, command, metadata, param, option, Options } from 'clime'
import { downloadClient } from '../lib'

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
  })
  version?: string;
}

@command({
  description: 'Downloads a client',
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
  ) {
    console.log('download client', clientName, 'version', options.version)
    await downloadClient(clientName, options.version)
  }
}