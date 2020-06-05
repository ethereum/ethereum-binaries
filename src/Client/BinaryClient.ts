import fs from 'fs'
import path from 'path'
import { ChildProcess, spawn } from "child_process"
import { BaseClient, CLIENT_STATE } from "./BaseClient"
import { PackageConfig, ClientInfo, ClientStartOptions, CommandOptions, GetClientOptions, FilterFunction } from "../types"
import { ProcessManager } from "../ProcessManager"
import { PROCESS_EVENTS } from "../events"
import { PackageManager, IPackage, download } from "ethpkg"
import { verifyBinary, resolveRuntimeDependency, getFileExtension } from '../utils'
import logger from '../Logger'


const extractBinary = async (pkg: IPackage, name: string, binaryName?: string, destPath: string = process.cwd()) => {
  const packagePath = pkg.filePath // only set if loaded from cache
  const entries = await pkg.getEntries()
  if (entries.length === 0) {
    throw new Error('Invalid or empty package')
  }
  let binaryEntry = undefined
  if (!binaryName) {
    logger.warn('No "binaryName" specified: trying to auto-detect executable within package')
    binaryName = name
  }

  const ext = getFileExtension(binaryName)
  if (process.platform === 'win32' && ext === undefined) {
    binaryName += '.exe'
  }

  // const isExecutable = mode => Boolean((mode & 0o0001) || (mode & 0o0010) || (mode & 0o0100))
  binaryEntry = entries.find((e: any) => e.relativePath.endsWith(binaryName))

  if (!binaryEntry) {
    throw new Error(
      'Binary unpack failed: not found in package - try to specify binaryName in your plugin or check if package contains binary'
    )
  } else {
    binaryName = binaryEntry.file.name
    logger.warn('Auto-detected binary:', binaryName)
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

const verifyBinaryPackage = async (pkg: IPackage, publicKey?: string) => {
  if (!pkg.metadata || !pkg.metadata.signature) {
    throw new Error('')
  }
  const detachedSignature = await download(pkg.metadata.signature)
  if (!pkg.filePath) {
    throw new Error('Package could not be located for verification')
  }
  if (!publicKey) {
    throw new Error('PackageConfig does not specify public key')
  }
  const verificationResult = await verifyBinary(pkg.filePath, publicKey, detachedSignature.toString())
  return verificationResult
}

export class BinaryClient extends BaseClient {
  private _process?: ChildProcess

  constructor(
    private _binaryPath: string,
    private _processManager: ProcessManager,
    private _config: PackageConfig
  ) {
    super()
  }

  public static async create(packageManager: PackageManager, processManager: ProcessManager, config: PackageConfig, {
    version,
    platform,
    cachePath,
    isPackaged, // are the binaries packaged?
    listener = () => { }
  }: GetClientOptions) {

    if (!isPackaged) {
      throw new Error('Raw binaries should be handled by client manager')
    }

    listener(PROCESS_EVENTS.RESOLVE_BINARY_STARTED, {})

    const pkg = await packageManager.getPackage(config.repository, {
      prefix: config.prefix, // server-side filter based on string prefix
      version: version === 'latest' ? undefined : version, // specific version or version range that should be returned
      platform,
      filter: <FilterFunction>config.filter, // string filter e.g. filter 'unstable' excludes geth-darwin-amd64-1.9.14-unstable-6f54ae24 
      cache: cachePath, // avoids download if package is found in cache
      cacheOnly: version === 'cache', // get latest cached if version = 'cache
      destPath: cachePath, // where to write package + metadata
      listener, // listen to progress events
      extract: config.extract || false, // extracts all package contents (good for java / python runtime clients without  single binary)
      verify: false // ethpkg verification
    })
    if (!pkg) {
      throw new Error('Package not found')
    }
    listener(PROCESS_EVENTS.RESOLVE_BINARY_FINISHED, { pkg })

    // verify package
    if (pkg.metadata && pkg.metadata.signature) {
      // TODO call listener
      try {
        const verificationResult = await verifyBinaryPackage(pkg, config.publicKey)
        console.log('Verification result', verificationResult)
      } catch (error) {
        console.log('Verification failed')
      }
    }

    if (config.dependencies) {
      if (config.dependencies.runtime) {
        const runtime = config.dependencies.runtime[0]
        const runtimeBinaryPath = resolveRuntimeDependency(runtime)
        if (!runtimeBinaryPath) {
          throw new Error('Could not find path for runtime: ' + runtime.name)
        }
        logger.log('Runtime resolved: ', runtimeBinaryPath)
        return new BinaryClient(runtimeBinaryPath, processManager, config)
      }
      else {
        throw new Error('Invalid dependency config')
      }
    }

    const binaryPath = await extractBinary(pkg, config.name, config.binaryName, cachePath)
    const client = new BinaryClient(binaryPath, processManager, config)
    return client
  }

  info(): ClientInfo {
    return {
      id: this.id,
      type: 'binary',
      state: this._state,
      started: this._started,
      stopped: this._stopped,
      ipc: this._ipc,
      rpcUrl: this._rpcUrl,
      processId: '' + (this._process ? this._process.pid : ''),
      binaryPath: this._binaryPath,
      logs: [...this._logs]
    }
  }
  private _parseLogs = (data: Buffer) => {
    let log = ''
    try {
      log = data.toString()
    } catch (error) {
      return
    }
    if (!log) { return }

    // split logs into lines and process + emit them line by line
    let lines = log.split(/\r|\n/)

    lines.forEach(line => {

      // ignore empty lines
      if (!line) { return }

      // search for IPC path in logs:
      if (line.endsWith('.ipc') || line.includes('IPC endpoint opened')) {
        // example geth: INFO [05-22|14:50:58.240] IPC endpoint opened  url=/Users/user/Library/Ethereum/goerli/geth.ipc
        let ipcPath = line.split('=')[1].trim()
        // fix double escaping
        if (ipcPath.includes('\\\\')) {
          ipcPath = ipcPath.replace(/\\\\/g, '\\')
        }
        this.ipc = ipcPath
      }

      if (line.includes('HTTP endpoint opened')) {
        // example INFO [05-22|15:52:31.584] HTTP endpoint opened   url=http://127.0.0.1:8545/ cors= vhosts=localhost
        const urlKeyVal = line.split(' ').find(l => l.startsWith('url'))
        if (urlKeyVal) {
          const [key, url] = urlKeyVal.split('=')
          if (url) {
            this.rpc = url.trim()
          }
        }
      }

      // will emit the log
      this.addLog(line)
    })

  }
  async start(flags: string[] = [], options: ClientStartOptions = {}): Promise<void> {
    await super.start(flags, options)
    options = {
      listener: () => { },
      stdio: 'pipe',
      ...options
    }
    const { listener = () => { } } = options
    listener(PROCESS_EVENTS.CLIENT_START_STARTED, { name: this._config.name, flags })
    this._started = Date.now()
    this._process = this._processManager.spawn(this._uuid, this._binaryPath, [...flags], {
      stdio: options.stdio,
    })
    const { stdout, stderr, stdin } = this._process
    if (stdout && stderr) {
      stdout.on('data', this._parseLogs)
      stderr.on('data', this._parseLogs)
    }
    this._process.on('error', (error) => {
      // FIXME handle process errors
    })
    listener(PROCESS_EVENTS.CLIENT_START_FINISHED, { name: this._config.name, flags })
  }
  async stop(): Promise<void> {
    await super.stop()
    if (!this._process) {
      return
    }
    const { stdout, stderr, stdin } = this._process
    if (stdout && stderr) {
      stdout.off('data', this._parseLogs)
      stderr.off('data', this._parseLogs)
    }
    this._processManager.kill('' + this._process.pid)
    this._process = undefined
  }
  async execute(command: string = '', options: CommandOptions = {}): Promise<string[]> {
    if (this._process) {
      throw new Error('Binary already running')
    }
    const flags: string[] = command.split(' ')
    const stdio = options.stdio || 'pipe'


    // when stdio = 'inherit': this does not exist: process.stdout.on('data', onData)
    // and cp.stdout won't be available. therefore processManager simulates inherit
    // so that we can intercept / log the output
    const _process = await this._processManager.exec(this._uuid, this._binaryPath, [...flags], {
      stdio,
    })

    // collect process logs for 30 seconds
    // if process did not exit => throws timeout exception
    // else return process output
    // this will only work when process spawned with stdio 'pipe'
    const timeout = options.timeout
    const commandLogs: Array<string> = []
    const { stdout, stderr, stdin } = _process

    // note: this is very similar to parseLogs but does not 
    // emit or analyze the command output
    // we should maybe merge the two in the future
    const onData = (data: any) => {
      const log = data.toString()
      if (log) {
        let parts = log.split(/\r|\n/)
        parts = parts.filter((p: string) => p !== '')
        commandLogs.push(...parts)
      }
    }

    if (stdout && stderr) {
      stdout.on('data', onData)
      stderr.on('data', onData)
    }

    try {
      await this._processManager.onExit(_process, timeout)
      // update state to indicate that process successfully exited (no kill during cleanup)
      this._state = CLIENT_STATE.STOPPED
    } catch (error) {
      console.warn('Dumping output of cancelled command:')
      console.warn(commandLogs)
      throw error
    }
    return commandLogs
  }
  async input(_input: string) {
    if (!this._process) {
      throw new Error('Binary not running')
    }
    this._process.stdin?.write(`${_input}\n`)
  }
}