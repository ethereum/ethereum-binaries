import {Command, command, metadata} from 'clime'
import chalk from 'chalk'

@command({
  description: 'Prints the ethbinary version',
})
export default class extends Command {
  @metadata
  public execute(){
    console.log(chalk.bold('ethbinary version: ', require('../../../package.json').version))
    console.log('\n')
  }
}