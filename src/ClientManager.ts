import fs, { stat } from 'fs'
import path from 'path'
import ethpkg, { PackageManager, IRelease, IPackage, download } from 'ethpkg'
import { clients as defaultClients } from './client_plugins'
import { normalizePlatform, uuid, createFilterFunction, validateConfig, extractPlatformFromString, getFileExtension } from './utils'
import { ClientInfo, ClientConfig, DownloadOptions, ClientStartOptions, instanceofPackageConfig, instanceofDockerConfig, instanceofClientInfo, CommandOptions, IClient, instanceofClientConfig, PackageConfig, ReleaseFilterOptions, LogFilter, FilterFunction, GetClientOptions } from './types'
import DockerManager from './DockerManager'
import { Logger } from './Logger'
import { ProcessManager } from './ProcessManager'
import { DockerizedClient } from './Client/DockerizedClient'
import { BinaryClient } from './Client/BinaryClient'
import { CLIENT_STATE } from './Client/BaseClient'
import { PROCESS_EVENTS } from './events'

const DOCKER_PREFIX = 'ethbinary'

export const SHARED_DATA = '/shared_data'

export class MultiClientManager {

  private _packageManager: PackageManager
  private _clients: Array<IClient>
  private _dockerManager: DockerManager
  private _processManager: ProcessManager
  private _logger: Logger
  private _clientConfigs: ClientConfig[]

  /**
   * Because a ClientManager instance handle process events like uncaughtException, exit, ..
   * there should only be one instance
   */
  private static instance: MultiClientManager

  private constructor() {
    this._logger = Logger.getInstance()
    this._packageManager = new PackageManager()
    this._dockerManager = new DockerManager(DOCKER_PREFIX)
    this._processManager = new ProcessManager()
    this._clients = []
    this._clientConfigs = []

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
    console.log('INFO Program will exit - try to stop running clients: ' + runningClients.length)
    for (const client of runningClients) {
      try {
        const info = client.info()
        console.log(`Trying to stop ${info.type} client in state ${info.state} id:`, client.id)
        await client.stop()
        console.log(`Client ${client.id} stopped.`, info)
      } catch (error) {
        console.error('Stop error', error.message)
      }
    }
    process.exit()
  }

  public static getInstance(): MultiClientManager {
    if (!MultiClientManager.instance) {
      MultiClientManager.instance = new MultiClientManager()
    }
    return MultiClientManager.instance
  }

  public status(clientId?: string | ClientInfo) {
    if (clientId) {
      const client = this._findClient(clientId)
      return client.info()
    }
    return {
      clients: this._clients.map(c => c.info())
    }
  }

  private async _getClientConfig(clientName: string, useDocker = undefined): Promise<ClientConfig> {
    let config = this._clientConfigs.find(c => c.name === clientName && (useDocker === true ? instanceofDockerConfig(c) : true))
    if (!config) {
      console.warn('Supported clients are', await this.getAvailableClients())
      throw new Error('Unsupported client: ' + clientName+' - docker: '+useDocker)
    }
    return config
  }

  public addClientConfig(config: ClientConfig | Array<ClientConfig>) {
    if (Array.isArray(config)) {
      for (const _c of config) {
        this.addClientConfig(_c)
      }
      return
    }
    else if (instanceofClientConfig(config)) {
      let isValid = validateConfig(config)
      if (!isValid) {
        throw new Error('Invalid client config')
      }
      const _config = {
        // set defaults
        // @ts-ignore
        displayName: config.name,
        entryPoint: 'auto',
        service: false,
        ...config,
        // @ts-ignore
        filter: createFilterFunction(config.filter)
      }
      this._clientConfigs.push(_config)
    }
  }

  public async getAvailableClients() {
    return this._clientConfigs.map(c => `${c.name} - docker: ${instanceofDockerConfig(c)}`)
  }

  public async getClientVersions(clientName: string, {
    platform = (<string>process.platform),
    packagesOnly = true,
    version = undefined
  }: ReleaseFilterOptions = {}): Promise<Array<IRelease>> {
    const config = await this._getClientConfig(clientName)
    if (!instanceofPackageConfig(config)) {
      // TODO handle docker versions
      return []
    }
    let releases = await this._packageManager.listPackages(config.repository, {
      prefix: config.prefix,
      filter: <FilterFunction | undefined>config.filter,
      version, // apply version or version range filter
      packagesOnly, // dangerous mode: return not packaged assets as well
    })

    if (!packagesOnly) {
      // filter binaries only
      releases = releases.filter(release => {
        const ext = getFileExtension(release.fileName)
        const hasBinaryExtension = ext === undefined || (process.platform === 'win32' && ext === '.exe')
        return hasBinaryExtension
      })
    }

    if (platform) {
      platform = normalizePlatform(platform)
      // filter releases for different platforms
      releases = releases.filter(release => {
        const releasePlatform = extractPlatformFromString(release.fileName)
        return releasePlatform !== undefined && (releasePlatform === platform)
      })
    }

    return releases
  }

  public async getClient(clientSpec: string | ClientConfig, {
    version = 'latest',
    platform = process.platform,
    listener = () => {},
    cachePath,
    useDocker = undefined // only use docker configs
  }: GetClientOptions = {}): Promise<ClientInfo> {

    let clientName = typeof clientSpec === 'string' ? clientSpec : clientSpec.name

    cachePath = cachePath || path.join(process.cwd(), 'cache', clientName)

    if (instanceofClientConfig(clientSpec)) {
      // this does additional validation and sets default: do NOT use config directly without checks
      this.addClientConfig(clientSpec)
    }

    const config = await this._getClientConfig(clientName, useDocker)

    platform = normalizePlatform(platform)

    let client
    if (instanceofDockerConfig(config)) {
      client = await DockerizedClient.create(this._dockerManager, config, {
        version,
        listener
        // platform and cache not relevant for docker
      })
    }
    else if (instanceofPackageConfig(config)) {

      const { isPackaged = true } = config

      // make sure cache path exists (docker has no cache)
      if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true })
      }

      if (!isPackaged) {
        // this handles version, binary and platform filtering already
        let releases = await this.getClientVersions(clientName, {
          version,
          packagesOnly: false
        })

        releases = releases.filter(release => release.fileName !== undefined)

        const release = releases.shift()

        if (!release) {
          throw new Error('Specified binary could not be found')
        }

        let binaryPath = path.resolve(cachePath, release.fileName)
        // check cache
        if (!fs.existsSync(binaryPath)) { // download binary

          const { location } = release // get download url
          if (location === undefined) {
            throw new Error('Cannot download binary - undefined download url')
          }
          // wrap progress  listener
          let progress = 0
          const onProgress = (p: number) => {
            const progressNew = Math.floor(p * 100);
            if (progressNew > progress) {
              progress = progressNew;
              listener(PROCESS_EVENTS.DOWNLOAD_PROGRESS, { progress, release, size: release.size })
            }
          }
          listener(PROCESS_EVENTS.DOWNLOAD_STARTED, { location, release })
          const data = await download(location, onProgress)
          listener(PROCESS_EVENTS.DOWNLOAD_FINISHED, { location, size: data.length, release })

          fs.writeFileSync(
            binaryPath,
            data,
            {
              mode: parseInt('754', 8) // strict mode prohibits octal numbers in some cases
            }
          )
        }

        client = new BinaryClient(binaryPath, this._processManager, config)

      } else {
        client = await BinaryClient.create(this._packageManager, this._processManager, config, {
          version,
          platform,
          cachePath,
          isPackaged,
          listener
        })
      }
    } else {
      throw new Error(`Client config does not specify how to retrieve client: repository or dockerimage should be set`)
    }

    this._clients.push(client)
    return client.info()
  }

  // creates an "ad-hoc" client for existing binaries
  public async getBinaryClient(binaryPath: string): Promise<ClientInfo> {
    if (!fs.existsSync(binaryPath)) {
      throw new Error('Binary does not exist: ' + binaryPath)
    }
    const name = path.basename(binaryPath)
    const config: PackageConfig = { name, displayName: name, repository: path.dirname(binaryPath) }
    const client = new BinaryClient(binaryPath, this._processManager, config)
    this._clients.push(client)
    return client.info()
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

  public async startClient(clientId: string | ClientInfo, flags: string | string[] = [], options: ClientStartOptions = {}): Promise<ClientInfo> {
    if (typeof flags === 'string') {
      flags = flags.split(' ')
    }
    const client: IClient = this._findClient(clientId)
    // add started client to client list
    await client.start(flags, options)
    return client.info()
  }

  public async stopClient(clientId: string | ClientInfo): Promise<ClientInfo> {
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

  public async run(clientId: string | ClientInfo, command: string, options?: CommandOptions): Promise<Array<string>> {
    this._logger.verbose('run on client', clientId, command)
    const client: IClient = this._findClient(clientId)
    if (client.info().type !== 'docker') {
      throw new Error('run is only available for docker clients')
    }
    options = {
      timeout: 30 * 1000,
      ...options
    }
    const result = await (<DockerizedClient>client).run(command, options)
    return result
  }

  // NOTE: whenState with callback might be complicated in client-server environments
  // the alternative approach is to poll on status.logs
  public async whenState(clientId: string | ClientInfo, state: string | LogFilter): Promise<ClientInfo> {
    const client: IClient = this._findClient(clientId)
    let status = client.info()
    
    // check if state was already reached
    if (state === CLIENT_STATE.HTTP_RPC_READY && status.rpcUrl) {
      return status
    }
    if (state === CLIENT_STATE.IPC_READY && status.ipc) {
      return status
    }
    // TODO find more generic solution
    if (state === CLIENT_STATE.STARTED && ![CLIENT_STATE.STOPPED, CLIENT_STATE.INIT].includes(status.state)) {
      return status
    }
    if (state === status.state) {
      return status
    }
    // if state not yet reached wait for it
    // TODO allow timeout
    return new Promise((resolve, reject) => {
      if (typeof state === 'function') {
        const filter = state
        const listener = (log: string) => {
          if (filter(log)) {
            resolve(client.info())
            client.off('log', listener)
          }
        }
        client.on('log', listener)   
      } else {
        // TODO remove listener
        client.on('state', (newState) => {
          if (newState === state) {
            resolve(client.info())
          }
        })
      }
    })
  }

  public async input(clientId: string | ClientInfo, _input: string): Promise<ClientInfo> {
    const client: IClient = this._findClient(clientId)
    // TODO implement for docker
    await (<BinaryClient>client).input(_input)
    let status = client.info()
    return status
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
  private _config?: ClientConfig

  constructor() {
    this._clientManager = MultiClientManager.getInstance()
  }

  private _getClientInstance(): ClientInfo {
    // if client was explicitly set -> use user defined client
    if (this._clientInstance) {
      return this._clientInstance
    }
    throw new Error('You are using the ClientManager in single-client mode with more than one client')
  }

  public addClientConfig(config: ClientConfig /* only allow one config to be added */) {
    this._config = config
    return this._clientManager.addClientConfig(config)
  }

  get ipc() {
    let info = this._clientManager.status(this._clientInstance) as ClientInfo
    return info.ipc
  }

  get rpcUrl() {
    let info = this._clientManager.status(this._clientInstance) as ClientInfo
    return info.rpcUrl
  }

  public async getClientVersions(clientName?: string, options?: any): Promise<Array<IRelease>> {
    // overload: public async getClientVersions(options?: any)
    if (typeof clientName === 'object') {
      options = clientName
    }
    if (typeof clientName !== 'string') {
      if (this._config) {
        clientName = this._config.name
      } else {
        throw new Error('Versions for which client? Client name was not provided')
      }
    }
    return this._clientManager.getClientVersions(clientName, options)
  }

  public async getClient(clientSpec: string | ClientConfig, options?: DownloadOptions): Promise<SingleClientManager> {
    if (this._clientInstance) {
      throw new Error('A client is already set. If you want to use different clients use MultiClientManager instead')
    }
    const client = await this._clientManager.getClient(clientSpec, {
      listener: (newState, args) => {
        console.log('new state', newState)
      },
      ...options
    })
    this._clientInstance = client
    return this
  }

  public async getBinaryClient(binaryPath: string): Promise<SingleClientManager> {
    if (this._clientInstance) {
      throw new Error('A client is already set. If you want to use different clients use MultiClientManager instead')
    }
    const client = await this._clientManager.getBinaryClient(binaryPath)
    this._clientInstance = client
    return this
  }

  public async start(flags: string | string[] = [], options?: ClientStartOptions): Promise<ClientInfo> {
    return this._clientManager.startClient(this._getClientInstance(), flags, options)
  }

  public async stop(): Promise<ClientInfo> {
    return this._clientManager.stopClient(this._getClientInstance())
  }

  public async execute(command: string, options?: CommandOptions): Promise<Array<string>> {
    return this._clientManager.execute(this._getClientInstance(), command, options)
  }

  public async run(command: string, options?: CommandOptions): Promise<Array<string>> {
    return this._clientManager.run(this._getClientInstance(), command, options)
  }

  public async whenState(state: string | LogFilter): Promise<ClientInfo> {
    return this._clientManager.whenState(this._getClientInstance(), state)
  }

  public async input(_input: string): Promise<ClientInfo> {
    return this._clientManager.input(this._getClientInstance(), _input)
  }

}

export const getClient = async (clientSpec: string | ClientConfig, options?: DownloadOptions): Promise<SingleClientManager> => {
  const cm = new SingleClientManager()
  return cm.getClient(clientSpec, options)
}