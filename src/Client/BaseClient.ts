import { IClient, ClientInfo, ClientStartOptions, CommandOptions } from "../types"
import { uuid } from "../utils"
import { EventEmitter } from "events"

export enum CLIENT_STATE {
  INIT = 'INIT',
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
  IPC_READY = 'IPC_READY',
  ERROR = 'ERROR',
} 

export abstract class BaseClient extends EventEmitter implements IClient {
  protected _uuid = uuid()
  protected _started: number = 0
  protected _stopped: number = 0
  protected _state: CLIENT_STATE = CLIENT_STATE.INIT
  protected _ipc?: string // store ipc path if it can be detected

  get id() {
    return this._uuid
  }
  set ipc(ipcPath: string) {
    this._ipc = ipcPath
    this._state = CLIENT_STATE.IPC_READY 
    this.emit('state', CLIENT_STATE.IPC_READY)
  }
  info(): ClientInfo {
    throw new Error("Method not implemented.")
  }
  async start(flags: string[], options: ClientStartOptions): Promise<void> {
    this._stopped = 0
    this._state = CLIENT_STATE.STARTED
    this._started = Date.now()
    this.emit('state', CLIENT_STATE.STARTED)
  }
  async stop(): Promise<void> {
    this._state = CLIENT_STATE.STOPPED
    this._stopped = Date.now()
    this.emit('state', CLIENT_STATE.STOPPED)
  }
  abstract execute(command: string, options?: CommandOptions): Promise<Array<string>> 
}