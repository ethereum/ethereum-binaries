import fs from 'fs'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { PackageManager, IRelease, IPackage } from 'ethpkg'
import { clients } from './client_plugins'
import { normalizePlatform, uuid, FilterFunction, createFilterFunction } from './utils'

interface ClientConfig {
  repository: string;
  prefix?: undefined;
  filter?: FilterFunction;
  binaryName?: string; // the name of binary in package - e.g. 'geth'; auto-expanded to geth.exe if necessary
}

export declare type StateListener = (newState: string, args?: any) => void;

export interface DownloadOptions {
  platform?: string;
  listener?: StateListener;
  cachePath?: string;
}

export interface ClientInfo {
  id: string
  started: number // ts
  binaryPath: string
  processId: number
}

export class Grid {

  private _packageManager: PackageManager
  private _clients : Array<ClientInfo>
  private _processes : Array<any>

  constructor() {
    this._packageManager = new PackageManager()
    this._clients = []
    this._processes = []
  }

  public async status() {
    return {
      clients: JSON.stringify(this._clients)
    }
  }

  private async _getClientConfig(clientName: string) : Promise<ClientConfig> {
    let config = clients[clientName]
    if (!config) {
      throw new Error('Unsupported client: '+clientName)
    }
    config = {...config} // clone before modification
    // convert filter object to function
    config.filter = createFilterFunction(config.filter)
    return config
  }

  public addClientConfig(name: string, config: ClientConfig) {
    clients[name] = config
  }

  public async getAvailableClients() {
    return Object.keys(clients)
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
    if(!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true })
    }
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

  public async startClient(clientName: string, version: string = 'latest', flags: string[] = [], options?: DownloadOptions) : Promise<ClientInfo> {
    const clientBinaryPath = await this.getClient(clientName, version, options)
    if(options && options.listener) {
      options.listener('starting_client')
    }
    const stdio = 'pipe' // 'inherit'
    const _process = spawn(clientBinaryPath, [...flags], {
      stdio: [stdio, stdio, stdio],
      detached: false,
      shell: false,
    })
    this._processes.push({
      process: _process
    })
    const clientInfo = {
      id: uuid(),
      started: Date.now(),
      processId: _process.pid,
      binaryPath: clientBinaryPath
    }
    this._clients.push(clientInfo)
    return clientInfo
  }

  public async stopClient(clientId: string) {
    const clientInfo = this._clients.find(clientInfo => clientInfo.id === clientId);
    if (!clientInfo) {
      throw new Error('Client not found')
    }
    const { process: _process } = this._processes.find(p => p.process.pid === clientInfo.processId);
    if (!_process) {
      throw new Error(`Client process could not be found`);
    }
    console.log('Killing process:', path.basename(clientInfo.binaryPath), 'process pid:', _process.pid);
    (<ChildProcess>_process).kill();
    this._clients = this._clients.filter(clientInfo => clientInfo.id !== clientId)
    this._processes = this._processes.filter(p => p.process.pid !== clientInfo.processId);
  }

  public async waitForState(clientId: string) {

  }

  public async execute(clientId: string) {

  }

  public async rpc() {

  }

}