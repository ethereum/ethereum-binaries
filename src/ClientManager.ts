import fs from 'fs'
import path from 'path'
import ethpkg, { PackageManager, IRelease, IPackage, download } from 'ethpkg'
import { clients as defaultClients } from './client_plugins'
import { normalizePlatform, uuid, createFilterFunction, validateConfig, verifyBinary } from './utils'
import { ClientInfo, ClientConfig, DownloadOptions, ClientStartOptions, instanceofPackageConfig, instanceofDockerConfig, instanceofClientInfo, CommandOptions, IClient, instanceofClientConfig } from './types'
import DockerManager from './DockerManager'
import { Logger } from './Logger'
import { ProcessManager } from './ProcessManager'
import { DockerizedClient } from './Client/DockerizedClient'
import { BinaryClient } from './Client/BinaryClient'
import { CLIENT_STATE } from './Client/BaseClient'

const DOCKER_PREFIX = 'ethbinary'

export class MultiClientManager {

  private _packageManager: PackageManager
  private _clients: Array<IClient>
  private _dockerManager: DockerManager
  private _processManager: ProcessManager
  private _logger: Logger
  private _clientConfigs : {[index:string] : ClientConfig}

  /**
   * Because a ClientManager instance handle process events like uncaughtException, exit, ..
   * there should only be one instance
   */
  private static instance : MultiClientManager

  private constructor() {
    this._logger = new Logger()
    this._packageManager = new PackageManager()
    this._dockerManager = new DockerManager(DOCKER_PREFIX)
    this._processManager = new ProcessManager()
    this._clients = []
    this._clientConfigs = {}

    this.addClientConfig(defaultClients)

    // exitHandler MUST only perform sync operations
    const exitHandler = (options: any, exitCode: any) => {
      console.log('  ==> exit handler called with code', exitCode)
      if (options.exit) process.exit();
    }

    // https://stackoverflow.com/questions/40574218/how-to-perform-an-async-operation-on-exit
    // The 'beforeExit' event is emitted when Node.js empties its event loop and has no additional work to schedule.
    // Normally, the Node.js process will exit when there is no work scheduled, 
    // but a listener registered on the 'beforeExit' event can make asynchronous calls, and thereby cause the Node.js process to continue.
    process.on('beforeExit', async (code) => {
      this._logger.log('ClientManager will exit. Cleaning up...')
      await this._cleanup()
      exitHandler({ exit: true }, code)
    })
    process.on('SIGINT', async (code) => {
      console.log('sigint')
      this._logger.log('ClientManager got SIGINT. Cleaning up...')
      await this._cleanup()
      exitHandler({ exit: true }, code)
    });
    process.on('unhandledRejection', async (reason, p) => {
      // console.error('Unhandled Rejection at Promise', p);
      console.error('Unhandled Promise Rejection', reason)
      await this._cleanup()
      exitHandler({ exit: true }, 0)
    })
  }

  private async _cleanup() {
    const runningClients = this._clients.filter(client => client.info().state === CLIENT_STATE.STARTED)
    // TODO stop running docker containers or kill processes
    console.log('INFO Program will exit - try to stop running clients: '+runningClients.length)
    for (const client of runningClients) {
      try {
        const info = client.info()
        console.log(`Trying to stop ${info.type} client in state ${info.state} id:`, client.id)
        await client.stop()
        console.log(`Client ${client.id} stopped.`)
      } catch (error) {
        console.error('Stop error', error.message)
      }
    }
    process.exit()
  }

  public static getInstance() : MultiClientManager {
    if (!MultiClientManager.instance) {
      MultiClientManager.instance = new MultiClientManager()
    }
    return MultiClientManager.instance
  }

  public status(clientId?: string | ClientInfo) {
    if(clientId) {
      const client = this._findClient(clientId)
      return client.info()
    }
    return {
      clients: this._clients.map(c => c.info())
    }
  }

  private async _getClientConfig(clientName: string): Promise<ClientConfig> {
    let config = this._clientConfigs[clientName]
    if (!config) {
      console.warn('Supported clients are', await this.getAvailableClients())
      throw new Error('Unsupported client: ' + clientName)
    }
    config = { ...config } // clone before modification
    // convert filter object to function
    // @ts-ignore
    config.filter = createFilterFunction(config.filter)
    return config
  }

  public addClientConfig(config: ClientConfig | Array<ClientConfig>) {
    if (Array.isArray(config)) {
      for (const _c of config) {
        this.addClientConfig(_c)
      }
      return
    } 
    else if(instanceofClientConfig(config)) {
      let isValid = validateConfig(config)
      if (!isValid) {
        throw new Error('Invalid client config')
      }
      config = {
        // @ts-ignore
        displayName: config.name,
        entryPoint: 'auto',
        service: false,
        ...config
      }
      // @ts-ignore
      this._clientConfigs[config.name] = config
    }
  }

  public async getAvailableClients() {
    return Object.keys(this._clientConfigs)
  }

  public async getClientVersions(clientName: string): Promise<Array<IRelease>> {
    const config = await this._getClientConfig(clientName)
    if (!instanceofPackageConfig(config)) {
      // TODO handle docker versions
      return []
    }
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
      this._logger.warn('No "binaryName" specified: trying to auto-detect executable within package')
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
      this._logger.log('auto-detected binary:', binaryName)
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

  public async getClient(clientSpec: string | ClientConfig, {
    version = 'latest',
    platform = process.platform,
    listener = undefined,
    cachePath = path.join(process.cwd(), 'cache')
  }: DownloadOptions = {}): Promise<ClientInfo> {

    let clientName = typeof clientSpec === 'string' ? clientSpec : clientSpec.name

    if (instanceofClientConfig(clientSpec)) {
      // this does additional validation and sets default: do NOT use config directly without checks
      this.addClientConfig(clientSpec)
    } 

    let config = await this._getClientConfig(clientName)

    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true })
    }
    platform = normalizePlatform(platform)
    if (instanceofDockerConfig(config)) {
      // lazy init to avoid crashes for non docker functionality
      this._dockerManager.connect()
      const imageName = await this._dockerManager.getOrCreateImage(config.name, config.dockerimage, {
        listener
      })
      if (!imageName) {
        throw new Error('Docker image could not be found or created')
      }
      this._logger.log('image created', imageName)
      // only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed for container names 
      // but image name can be urls like gcr.io/prysmaticlabs/prysm/validator
      // Date.now() allows to have multiple instances of one image
      // const containerName = `ethbinary_${config.name}_container_${Date.now()}`
      // const containerName = `ethbinary_${config.name}_container_${Date.now()}`
      const containerName = `ethbinary_${config.name}_container`
      const overwrite = true
      /*
      const container = await this._dockerManager.createContainer(imageName, containerName, {
        overwrite,
        dispose: false, // if containers are disposed they cannot be analyzed afterwards, therefore it is better to clean them on start
        overwriteEntrypoint: false,
        autoPort: true,
        ports: ['8545', '30303', '30303/udp']
      })
      if (!container) {
        throw new Error('Docker container could not be created')
      }
      */
     let container = {
       id: '123',
       stop(){}
     }
      // client is a docker container and client path is name of the docker container
      const client = new DockerizedClient(container, this._dockerManager, config, imageName)
      this._clients.push(client)
      return client.info()
    }
    else if (instanceofPackageConfig(config)) {
      const pkg = await this._packageManager.getPackage(config.repository, {
        prefix: config.prefix, // server-side filter based on string prefix
        version: version === 'latest' ? undefined : version, // specific version or version range that should be returned
        platform,
        filter: config.filter, // string filter e.g. filter 'unstable' excludes geth-darwin-amd64-1.9.14-unstable-6f54ae24 
        cache: cachePath, // avoids download if package is found in cache
        cacheOnly: version === 'cache', // get latest cached if version = 'cache
        destPath: cachePath, // where to write package + metadata
        listener, // listen to progress events
        extract: false, // extracts all package contents (good for java / python runtime clients without  single binary)
        verify: false // ethpkg verification
      })
      if (!pkg) {
        throw new Error('Package not found')
      }

      // verify package
      if (pkg.metadata && pkg.metadata.signature) {
        // TODO call listener
        const detachedSignature = await download(pkg.metadata.signature)
        if (!pkg.filePath) {
          throw new Error('Package could not be located for verification')
        }
        if (!config.publicKey) {
          throw new Error('PackageConfig does not specify public key')
        }
        const verificationResult = await verifyBinary(pkg.filePath, config.publicKey, detachedSignature.toString())
        // console.log('verification result', verificationResult)
      }
      const binaryPath = await this._extractBinary(pkg, config.binaryName, cachePath)
      const client = new BinaryClient(binaryPath, this._processManager, config)
      this._clients.push(client)
      return client.info()
    }
    throw new Error(`Client config does not specify how to retrieve client: repository or dockerimage should be set`)
  }

  private _findClient(clientId: string | ClientInfo) {
    if (instanceofClientInfo(clientId)) {
      clientId = clientId.id
    }
    const client = this._clients.find(client => client.id === clientId);
    if (!client) {
      throw new Error('Client not found')
    }
    return client
  }

  public async startClient(clientId: string | ClientInfo, flags: string[] = [], options: ClientStartOptions = {}): Promise<ClientInfo> {
    const client: IClient = this._findClient(clientId)
    // add started client to client list
    await client.start(flags, options)
    return client.info()
  }

  public async stopClient(clientId: string | ClientInfo) : Promise<ClientInfo> {
    const client: IClient = this._findClient(clientId)
    await client.stop()
    // remove stopped client from client list // TODO make setting?
    // this._clients = this._clients.filter(c => c.id !== client.id)
    // console.log('Killing process:', path.basename(clientInfo.binaryPath), 'process pid:', _process.pid);
    return client.info()
  }

  public async execute(clientId: string | ClientInfo, command: string, options?: CommandOptions): Promise<Array<string>> {
    this._logger.verbose('execute on client', clientId, command)
    const client: IClient = this._findClient(clientId)
    options = {
      timeout: 30 * 1000,
      ...options
    }
    const result = await client.execute(command, options)
    return result
  }

  public async whenState(clientId: string | ClientInfo, state: string) : Promise<ClientInfo>  {
    const client: IClient = this._findClient(clientId)
    return new Promise((resolve, reject) => {
      console.log('try to wait for state', state)
      client.on('state', (newState) => {
        console.log('new state', client.info().state, client.info().ipc)
        if (newState === CLIENT_STATE.IPC_READY) {
          resolve(client.info())
        }
      })
    })
  }

  public async rpc() {

  }

}

/**
 * MultiClientManager is the main implementation
 * and it should ONLY RETURN SERIALIZABLE data
 * SingleClientManager is a convenience wrapper that should
 * have as little own functionality as possible and no state
 * so that it can be used e.g. in child processes or webpages that communicate
 * to the MultiClientManager server API
 */
export class SingleClientManager {
  private _clientManager: MultiClientManager
  private _clientInstance?: ClientInfo

  constructor() {
    this._clientManager = MultiClientManager.getInstance()
  }

  private _getClientInstance() : ClientInfo {
    // if client was explicitly set -> use user defined client
    if (this._clientInstance) {
      return this._clientInstance
    }
    throw new Error('You are using the ClientManager in single-client mode with more than one client')
  }

  get ipc() {
    let info = this._clientManager.status(this._clientInstance) as ClientInfo
    return info.ipc
  }

  public async getClientVersions(clientName: string): Promise<Array<IRelease>> {
    return this._clientManager.getClientVersions(clientName)
  }

  public async getClient(clientSpec: string | ClientConfig, options?: DownloadOptions): Promise<SingleClientManager> {
    const client = await this._clientManager.getClient(clientSpec, options)
    if (this._clientInstance) {
      throw new Error('A client is already set. If you want to use different client use MultiClientManager instead')
    }
    this._clientInstance = client
    return this
  }

  public async start(flags: string[] = [], options?: ClientStartOptions): Promise<ClientInfo> {
    return this._clientManager.startClient(this._getClientInstance(), flags, options)
  }

  public async stop() : Promise<ClientInfo>  {
    return this._clientManager.stopClient(this._getClientInstance())
  }

  public async execute(command: string, options?: CommandOptions): Promise<Array<string>> {
    return this._clientManager.execute(this._getClientInstance(), command, options)
  }

  public async whenState(state: string) : Promise<ClientInfo> {
    return this._clientManager.whenState(this._getClientInstance(), state)
  }
}

export const getClient = async (clientSpec: string | ClientConfig, options?: DownloadOptions) : Promise<SingleClientManager> => {
  const cm = new SingleClientManager()
  return cm.getClient(clientSpec, options)
}