import { Command, command, metadata } from 'clime'
import { downloadClient } from '../../lib'

@command({
  description: 'Downloads a client',
})
export default class extends Command {
  @metadata
  public async execute() {
    await downloadClient('geth')
  }
}