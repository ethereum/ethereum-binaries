import { SingleClientManager } from "../../ClientManager";
import cliProgress from 'cli-progress'
import boxen from 'boxen'
import chalk from 'chalk'
import { PROCESS_EVENTS } from "../../events";
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
  let downloadProgressBar : any
  let extractProgressBar : any
  return (newState: string, args: any) => {
    // console.log('new state', newState)
    if (newState === PROCESS_EVENTS.RESOLVE_PACKAGE_STARTED) {
      console.log(chalk.green('Looking up latest release'))
    }
    if (newState === PROCESS_EVENTS.RESOLVE_PACKAGE_FINISHED) {
      console.log(chalk.green('Release resolved:'))
      printFormattedRelease(args.release)
    }
    if (newState === PROCESS_EVENTS.DOWNLOAD_STARTED) {
      console.log(chalk.green.bold('Download client'))
      downloadProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
      downloadProgressBar.start(100, 0);
    }
    else if (newState === PROCESS_EVENTS.DOWNLOAD_PROGRESS) {
      if (!downloadProgressBar) return
      const { progress } = args
      downloadProgressBar.update(progress)
    }
    else if(newState === PROCESS_EVENTS.DOWNLOAD_FINISHED) {
      downloadProgressBar.stop()
      console.log('\n')
    } 
    else if (newState === PROCESS_EVENTS.EXTRACT_PACKAGE_STARTED) {
      console.log(chalk.green.bold('Extract package contents'))
      extractProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic)
      extractProgressBar.start(100, 0);
    }
    else if (newState === PROCESS_EVENTS.EXTRACT_PACKAGE_PROGRESS) {
      const { progress, file, destPath } = args
      extractProgressBar.update(progress)
    }
    else if (newState === PROCESS_EVENTS.EXTRACT_PACKAGE_FINISHED) {
      extractProgressBar.stop()
      console.log('\n')
    }
    else if (newState === PROCESS_EVENTS.RESOLVE_BINARY_FINISHED) {
      const { pkg } = args
      const { metadata } = pkg
      if (metadata.remote === false) {
        console.log(chalk.bold('Using cached binary from package at', pkg.filePath))
      }
    }
    else  if(newState === PROCESS_EVENTS.CLIENT_START_STARTED) {
      console.log(chalk.bold('Starting client now...\n'))
    }
    else {
      // console.log('new state', newState)
    }
  }
}

export const downloadClient = async (clientName = 'geth', clientVersion?: string) => {
    const cm = new SingleClientManager()
    if (!clientVersion) {
      let versions = await cm.getClientVersions(clientName)
      if (!versions || versions.length === 0) {
        throw new Error(`No releases found for client "${clientName}"`)
      }
      const prompt = new Select({
        name: 'selectedVersion',
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

const combineListeners = (...listeners: Function[]) => {
  return (newState: string, args: any) => {
    listeners.forEach(listener => listener && listener(newState, args))
  }
}

export const startClient = async (clientName = 'geth', version='latest', flags: string[] = [], options: any = {}) => {
  const cm = new SingleClientManager()
  const listener = combineListeners(createProgressListener(), options.listener)
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