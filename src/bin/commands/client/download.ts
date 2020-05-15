import { Command, command, metadata } from 'clime'
import { downloadClient } from '../../lib'

@command({
  description: 'Prints the Grid version number',
})
export default class extends Command {
  @metadata
  public async execute() {
    await downloadClient('geth')
  }
}