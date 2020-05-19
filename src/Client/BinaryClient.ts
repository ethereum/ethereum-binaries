import { ChildProcess, spawn } from "child_process"
import { BaseClient } from "./BaseClient"
import { PackageConfig, ClientInfo, ClientStartOptions, CommandOptions } from "../types"
import { ProcessManager } from "../ProcessManager"



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
      processId: '' + (this._process ? this._process.pid : ''),
      binaryPath: this._binaryPath
    }
  }
  async start(flags: string[] = [], options: ClientStartOptions = {}): Promise<void> {
    await super.start(flags, options)
    options = {
      listener: () => { },
      stdio: 'pipe',
      ...options
    }
    if (options.listener) {
      // TODO use process_states
      options.listener('starting_client')
    }
    this._started = Date.now()
    this._process = this._processManager.spawn(this._uuid, this._binaryPath, [...flags], {
      stdio: options.stdio ,
    })
  }
  async stop(): Promise<void> {
    await super.stop()
    this._processManager.kill('' + this._process?.pid)
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
    const timeout = 30*1000 
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

    await this._processManager.onExit(_process, timeout)
    return commandLogs
  }
}