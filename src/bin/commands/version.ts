import {Command, command, metadata} from 'clime'
import fs from 'fs'
import path from 'path'

@command({
  description: 'Prints the ethbinary version number',
})
export default class extends Command {
  @metadata
  public execute(){
    // no-op version is printed in init CLI script
    console.log('version ')
  }
}