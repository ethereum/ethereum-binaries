import { Grid } from "../../Grid";
import { Select } from 'enquirer'
import cliProgress from 'cli-progress'
import boxen from 'boxen'
import chalk from 'chalk'

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

export const clientSpecifierToCommand = (clientSpecifier: string) => {
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

export const downloadClient = async (clientName = 'geth') => {

    const grid = new Grid()
    let versions = await grid.getClientVersions(clientName)

    const prompt = new Select({
      name: 'selectedAccount',
      message: 'Which version?',
      choices: versions.map((r, idx) => ({
        name: r.version, 
        message: `${r.version} (${r.updated_at})`
      }))
    });
    const selectedVersion = await prompt.run()

    const client = await grid.getClient(clientName, selectedVersion, {
      listener: createProgressListener()
    })

    // console.log('client binary path', client)
}

export const startClient = async (clientName = 'geth', version='latest', flags: string[] = []) => {
  const grid = new Grid()
  await grid.startClient(clientName, version, flags, {
    listener: createProgressListener()
  })
}