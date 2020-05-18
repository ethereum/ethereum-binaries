import { ChildProcess } from "child_process"
import { BaseClient } from "./BaseClient"
import { PackageConfig } from "../types"

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
    const stdio = options.stdio || 'pipe'
    this._started = Date.now()
    this._process = spawn(this._binaryPath, [...flags], {
      stdio: [stdio, stdio, stdio],
      detached: false,
      shell: false,
    })
    this._processManager.add(this._process, this._uuid)
  }
  async stop(): Promise<void> {
    await super.stop()
    this._processManager.kill('' + this._process?.pid)
  }
}