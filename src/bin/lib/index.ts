import { SingleClientManager } from "../../ClientManager";
import cliProgress from 'cli-progress'
import boxen from 'boxen'
import chalk from 'chalk'
const { Select } = require('enquirer')

const printFormattedRelease = (release?: any) => {
  if(!release) {
    return console.log('No release info provided!')
  }
  if ('original' in release) {
    release = { ...release }
    release.original = '<Original response data removed from output>'
  }
  console.log(boxen(chalk.grey(JSON.stringify(release, undefined, 2))))
}

export const clientSpecifierToCommand = (clientSpecifier?: string) => {
  if (!clientSpecifier) return []
  if (clientSpecifier.includes('@')) {
    const [client, version] = clientSpecifier.split('@')
    return ['client', 'start', client, version]
  }
  return [clientSpecifier]
}

const createProgressListener = () => {
  let progressBar : any
  return (newState: string, args: any) => {
    if (newState === 'resolve_package_finished') {
      console.log(chalk.green('Release resolved:'))
      printFormattedRelease(args.release)
    }
    if (newState === 'download_started') {
      console.log(chalk.green.bold('Download client'))
      progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
      progressBar.start(100, 0);
    }
    else if (newState === 'download_progress') {
      if (!progressBar) return
      const { progress } = args
      progressBar.update(progress)
    }
    else if(newState === 'download_finished') {
      progressBar.stop()
      console.log('\n')
    } 
    else  if(newState === 'starting_client') {
      console.log(chalk.bold('Starting client now...\n'))
    }
    else {
      // console.log('new state', newState)
    }
  }
}

export const downloadClient = async (clientName = 'geth', clientVersion?: string) => {

    const cm = new SingleClientManager()
    if (!clientVersion){
      let versions = await cm.getClientVersions(clientName)
      const prompt = new Select({
        name: 'selectedAccount',
        message: 'Which version?',
        choices: versions.map((r, idx) => ({
          name: r.version, 
          message: `${r.version} (${r.updated_at})`
        }))
      });
      const selectedVersion = await prompt.run()
      clientVersion = selectedVersion
    }

    const client = await cm.getClient(clientName, {
      version: clientVersion,
      listener: createProgressListener()
    })

    // console.log('client binary path', client)
}

export const startClient = async (clientName = 'geth', version='latest', flags: string[] = [], options = {}) => {
  const cm = new SingleClientManager()
  const listener = createProgressListener()
  const client = await cm.getClient(clientName, {
    version,
    listener
  })
  await client.start(flags, {
    listener,
    ...options
  })
}

export const execClient = async (clientName = 'geth', clientVersion='latest', command? : string) => {
  if (!command) {
    throw new Error('Invalid command')
  }
  const listener = createProgressListener()
  const cm = new SingleClientManager()
  const client = await cm.getClient(clientName, { 
    version: clientVersion,
    listener 
  })
  // result can be ignore because 'inherit' will log everything to stdout
  const result = await client.execute(command, {
    listener,
    stdio: 'inherit'
  });
  return result
}