import { ChildProcess, spawn } from "child_process"
import { BaseClient, CLIENT_STATE } from "./BaseClient"
import { PackageConfig, ClientInfo, ClientStartOptions, CommandOptions } from "../types"
import { ProcessManager } from "../ProcessManager"
import { PROCESS_EVENTS } from "../events"

export class BinaryClient extends BaseClient {
  private _process?: ChildProcess

  constructor(
    private _binaryPath: string, 
    private _processManager: ProcessManager, 
    private _config: PackageConfig
  ) {
    super()
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
      binaryPath: this._binaryPath
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

    // search for IPC path in logs:
    if (log.endsWith('.ipc') || log.includes('IPC endpoint opened')) {
      // example geth: INFO [05-22|14:50:58.240] IPC endpoint opened  url=/Users/user/Library/Ethereum/goerli/geth.ipc
      let ipcPath = log.split('=')[1].trim()
      // fix double escaping
      if (ipcPath.includes('\\\\')) {
        ipcPath = ipcPath.replace(/\\\\/g, '\\')
      }
      this.ipc = ipcPath
    }

    if (log.includes('HTTP endpoint opened')) {
      // example INFO [05-22|15:52:31.584] HTTP endpoint opened   url=http://127.0.0.1:8545/ cors= vhosts=localhost
      const urlKeyVal = log.split(' ').find(l => l.startsWith('url'))
      if (urlKeyVal) {
        const [key, url] = urlKeyVal.split('=')
        if (url) {
          this.rpc = url.trim()
        }
      }
    }
  }
  async start(flags: string[] = [], options: ClientStartOptions = {}): Promise<void> {
    await super.start(flags, options)
    options = {
      listener: () => { },
      stdio: 'pipe',
      ...options
    }
    const { listener = () => {} } = options
    listener(PROCESS_EVENTS.CLIENT_START_STARTED, { name: this._config.name, flags })
    this._started = Date.now()
    this._process = this._processManager.spawn(this._uuid, this._binaryPath, [...flags], {
      stdio: options.stdio ,
    })
    const { stdout,  stderr, stdin } = this._process
    if (stdout && stderr) {
      stdout.on('data', this._parseLogs)
      stderr.on('data', this._parseLogs)
    }
    listener(PROCESS_EVENTS.CLIENT_START_FINISHED, { name: this._config.name, flags })
  }
  async stop(): Promise<void> {
    await super.stop()
    if (!this._process) {
      return
    }
    const { stdout,  stderr, stdin } = this._process
    if (stdout && stderr) {
      stdout.off('data', this._parseLogs)
      stderr.off('data', this._parseLogs)
    }
    this._processManager.kill('' + this._process.pid)
  }
  async execute(command: string, options: CommandOptions = {}): Promise<string[]> {
    const flags : string[] = command.split(' ')
    const stdio = options.stdio || 'pipe'
    const _process = await this._processManager.exec(this._uuid, this._binaryPath, [...flags], {
      stdio,
    })

    // collect process logs for 30 seconds
    // if process did not exit => throws timeout exception
    // else return process output
    // this will only work when process spawned with stdio 'pipe'
    const timeout = options.timeout
    const commandLogs: Array<string> = []
    const { stdout,  stderr, stdin } = _process
    if (stdout && stderr) {
      const onData = (data: any) => {
        const log = data.toString()
        if (log) {
          let parts = log.split(/\r|\n/)
          parts = parts.filter((p: string) => p !== '')
          commandLogs.push(...parts)
        }
      }
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
}