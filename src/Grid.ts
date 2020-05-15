import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { PackageManager, IRelease, IPackage } from 'ethpkg'

interface FilterConfig {
  name: {
    includes?: Array<string>;
    excludes?: Array<string>;
  }
}

interface ClientConfig {
  repository: string;
  prefix?: undefined;
  filter?: FilterFunction;
  binaryName?: string; // the name of binary in package - e.g. 'geth'; auto-expanded to geth.exe if necessary
}

export declare type StateListener = (newState: string, args?: any) => void;
declare type FilterFunction = (release: IRelease) => boolean;

export interface DownloadOptions {
  platform?: string;
  listener?: StateListener;
  cachePath?: string;
}

const createFilterFunction = (filterConfig? : FilterConfig) : FilterFunction => {
  if (!filterConfig || !('name' in filterConfig)) {
    return (() => true)
  }
  const { name } = filterConfig
  const includes : Array<string> = name.includes || []
  const excludes: Array<string> = name.excludes || []
  return ({ fileName, version } : any) => {
    if (!fileName) {
      return false
    }
    fileName = fileName.toLowerCase()
    const shouldFilter = (
      (!includes || includes.every(val => fileName.indexOf(val) >= 0)) &&
      (!excludes || excludes.every(val => fileName.indexOf(val) === -1))
    )
    // console.log(fileName, shouldFilter, excludes)
    return shouldFilter
  }
}

const normalizePlatform = (platform: string) => {
  if (['mac'].includes(platform.toLowerCase())) {
    platform = 'darwin'
  } 
  else if (['win32'].includes(platform.toLowerCase())) {
    platform = 'windows'
  }
  return platform
}

export class Grid {

  private _packageManager: PackageManager

  constructor() {
    this._packageManager = new PackageManager()
  }

  private async _getClientConfig(clientName: string) : Promise<ClientConfig> {
    let { default: config } = require('./client_plugins/geth')
    if (!config) {
      throw new Error('Unsupported client: '+clientName)
    }
    config = {...config} // clone before modification
    // convert filter object to function
    config.filter = createFilterFunction(config.filter)
    return config
  }

  public async getAvailableClients() {

  }

  public async getClientVersions(clientName: string) : Promise<Array<IRelease>> {
    const config = await this._getClientConfig(clientName)
    const releases = await this._packageManager.listPackages(config.repository, {
      prefix: config.prefix,
      filter: config.filter
    })
    return releases
  }

  private async _extractBinary(pkg: IPackage, binaryName?: string, destPath: string = process.cwd()) {
    const packagePath = pkg.filePath // only set if loaded from cache
    const entries = await pkg.getEntries()
    if (entries.length === 0) {
      throw new Error('Invalid or empty package')
    }
    let binaryEntry = undefined
    if (binaryName) {
      binaryEntry = entries.find((e: any) => e.relativePath.endsWith(binaryName))
    } else {
      // try to detect binary
      console.warn('No "binaryName" specified: trying to auto-detect executable within package')
      // const isExecutable = mode => Boolean((mode & 0o0001) || (mode & 0o0010) || (mode & 0o0100))
      if (process.platform === 'win32') {
        binaryEntry = entries.find((e: any) => e.relativePath.endsWith('.exe'))
      } else {
        // no heuristic available: pick first
        binaryEntry = entries[0]
      }
    }

    if (!binaryEntry) {
      throw new Error(
        'Binary unpack failed: not found in package - try to specify binaryName in your plugin or check if package contains binary'
      )
    } else {
      binaryName = binaryEntry.file.name
      // console.log('auto-detected binary:', binaryName)
    }

    const destAbs = path.join(destPath, `${binaryName}_${pkg.metadata?.version}`)
    if (fs.existsSync(destAbs)) {
      return destAbs
      // fs.unlinkSync(destAbs)
    }
    // IMPORTANT: if the binary already exists the mode cannot be set
    fs.writeFileSync(
      destAbs,
      await binaryEntry.file.readContent(),
      {
        mode: parseInt('754', 8) // strict mode prohibits octal numbers in some cases
      }
    )
    return destAbs
  }

  public async getClient(clientName: string, version: string = 'latest', {
    platform = process.platform,
    listener = undefined,
    cachePath = path.join(process.cwd(), 'cache')
  } : DownloadOptions = {}) : Promise<string> {
    const config = await this._getClientConfig(clientName)
    platform = normalizePlatform(platform)
    const pkg = await this._packageManager.getPackage(config.repository, {
      prefix: config.prefix, // server-side filter based on string prefix
      version: version === 'latest' ? undefined : version, // specific version or version range that should be returned
      platform,
      filter: config.filter, // string filter e.g. filter 'unstable' excludes geth-darwin-amd64-1.9.14-unstable-6f54ae24 
      cache: cachePath, // avoids download if package is found in cache
      destPath: cachePath, // where to write package + metadata
      listener, // listen to progress events
      extract: false, // extracts all package contents (good for java / python runtime clients without  single binary)
      verify: false // ethpkg verification
    })
    if (!pkg) {
      throw new Error('Package not found')
    }
    const binaryPath = await this._extractBinary(pkg, config.binaryName, cachePath)
    return binaryPath
  }

  public async startClient(clientName: string, version: string = 'latest', flags: string[] = [], options: DownloadOptions) {
    const clientBinaryPath = await this.getClient(clientName, version, options)
    if(options.listener) {
      options.listener('starting_client')
    }
    const _process = spawn(clientBinaryPath, [...flags], {
      stdio: 'inherit',
      detached: false,
      shell: false,
    })
  }

  public async stopClient(clientId: string) {

  }

  public async waitForState(clientId: string) {

  }

  public async execute(clientId: string) {

  }

}