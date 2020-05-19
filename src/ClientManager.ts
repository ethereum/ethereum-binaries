import fs from 'fs'
import path from 'path'
import ethpkg, { PackageManager, IRelease, IPackage, download } from 'ethpkg'
import { clients } from './client_plugins'
import { normalizePlatform, uuid, createFilterFunction, validateConfig, verifyBinary } from './utils'
import { ClientInfo, ClientConfig, DownloadOptions, ClientStartOptions, instanceofPackageConfig, instanceofDockerConfig, instanceofClientInfo, CommandOptions, IClient } from './types'
import DockerManager from './DockerManager'
import { Logger } from './Logger'
import { ProcessManager } from './ProcessManager'
import { DockerizedClient } from './Client/DockerizedClient'
import { BinaryClient } from './Client/BinaryClient'
import { CLIENT_STATE } from './Client/BaseClient'

const DOCKER_PREFIX = 'ethbinary'

export class ClientManager {

  private _packageManager: PackageManager
  private _clients: Array<IClient>
  private _dockerManager: DockerManager
  private _processManager: ProcessManager
  private _logger: Logger

  /**
   * Because a ClientManager instance handle process events like uncaughtException, exit, ..
   * there should only be one instance
   */
  private static instance : ClientManager

  private constructor() {
    this._logger = new Logger()
    this._packageManager = new PackageManager()
    this._dockerManager = new DockerManager(DOCKER_PREFIX)
    this._processManager = new ProcessManager()
    this._clients = []

    // exitHandler MUST only perform sync operations
    const exitHandler = (options: any, exitCode: any) => {
      console.log('  ==> exit handler called', exitCode)

      if (exitCode || exitCode === 0) console.log(exitCode);
      if (options.exit) process.exit();
    }

    // https://stackoverflow.com/questions/40574218/how-to-perform-an-async-operation-on-exit
    // The 'beforeExit' event is emitted when Node.js empties its event loop and has no additional work to schedule.
    // Normally, the Node.js process will exit when there is no work scheduled, 
    // but a listener registered on the 'beforeExit' event can make asynchronous calls, and thereby cause the Node.js process to continue.
    process.on('beforeExit', async () => {
      this._logger.log('ClientManager will exit. Cleaning up...')
      await this._cleanup()
    })

    process.on('SIGINT', exitHandler.bind(null, { exit: true }));
    process.on('unhandledRejection', (reason, p) => {
      // console.error('Unhandled Rejection at Promise', p);
      console.error('Unhandled Promise Rejection', reason)
      exitHandler({ exit: true }, 0)
    })
  }

  private async _cleanup() {
    const runningClients = this._clients.filter(client => client.info().state !== CLIENT_STATE.STOPPED)
    // TODO stop running docker containers or kill processes
    console.log('Program will exit - try to stop running clients:')
    for (const client of runningClients) {
      try {
        const info = client.info()
        console.log(`Trying to stop ${info.type} client in state ${info.state} id:`, client.id)
        await client.stop()
        console.log('Success!')
      } catch (error) {
        console.error('Stop error', error)
      }
    }
    process.exit()
  }

  public static getInstance() : ClientManager {
    if (!ClientManager.instance) {
      ClientManager.instance = new ClientManager()
    }
    return ClientManager.instance
  }

  public status() {
    return {
      clients: this._clients.map(c => c.info())
    }
  }

  private async _getClientConfig(clientName: string): Promise<ClientConfig> {
    let config = clients[clientName]
    if (!config) {
      console.warn('Supported clients are', await this.getAvailableClients())
      throw new Error('Unsupported client: ' + clientName)
    }
    let isValid = validateConfig(config)
    if (!isValid) {
      throw new Error('Invalid client config')
    }
    config = { ...config } // clone before modification
    // convert filter object to function
    config.filter = createFilterFunction(config.filter)
    return config
  }

  public addClientConfig(config: ClientConfig) {
    let isValid = validateConfig(config)
    if (!isValid) {
      throw new Error('Invalid client config')
    }
    clients[config.name] = config
  }

  public async getAvailableClients() {
    return Object.keys(clients)
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

  public async getClient(clientName: string, version: string = 'latest', {
    platform = process.platform,
    listener = undefined,
    cachePath = path.join(process.cwd(), 'cache')
  }: DownloadOptions = {}): Promise<ClientInfo> {
    const config = await this._getClientConfig(clientName)
    if (!fs.existsSync(cachePath)) {
      fs.mkdirSync(cachePath, { recursive: true })
    }
    platform = normalizePlatform(platform)
    if (instanceofDockerConfig(config)) {
      // lazy init to avoid crashes for non docker functionality
      this._dockerManager.connect()
      const imageName = await this._dockerManager.getOrCreateImage(config.name, config.dockerfile, listener)
      if (!imageName) {
        throw new Error('Docker image could not be found or created')
      }
      this._logger.log('image created', imageName)
      // only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed for container names 
      // but image name can be urls like gcr.io/prysmaticlabs/prysm/validator
      const containerName = `ethbinary_${config.name}_container`
      const container = await this._dockerManager.createContainer(imageName, containerName)
      if (!container) {
        throw new Error('Docker container could not be created')
      }
      // client is a docker container and client path is name of the docker container
      const client = new DockerizedClient(container, this._dockerManager, config)
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
    throw new Error(`Client config does not specify how to retrieve client: repository or dockerfile should be set`)
  }

  public async startClient(clientId: string | ClientInfo, flags: string[] = [], options: ClientStartOptions = {}): Promise<ClientInfo> {
    const client: IClient = this._findClient(clientId)
    // add started client to client list
    await client.start(flags, options)
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

  public async stopClient(clientId: string | ClientInfo) : Promise<ClientInfo> {
    const client: IClient = this._findClient(clientId)
    await client.stop()
    // remove stopped client from client list // TODO make setting?
    // this._clients = this._clients.filter(c => c.id !== client.id)
    // console.log('Killing process:', path.basename(clientInfo.binaryPath), 'process pid:', _process.pid);
    return client.info()
  }

  public async execute(clientId: string | ClientInfo, command: string, options?: CommandOptions): Promise<Array<string>> {
    this._logger.verbose('execute on client', clientId)
    const client: IClient = this._findClient(clientId)
    const result = await client.execute(command, options)
    return result
  }

  public async waitForState(clientId: string) {

  }

  public async rpc() {

  }

}