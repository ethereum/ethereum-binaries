import { IClient, ClientInfo, ClientStartOptions, CommandOptions } from "../types"
import { uuid } from "../utils"

export enum CLIENT_STATE {
  INIT = 'INIT',
  STARTED = 'STARTED',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
} 

export abstract class BaseClient implements IClient {
  protected _uuid = uuid()
  protected _started: number = 0
  protected _stopped: number = 0
  protected _state: CLIENT_STATE = CLIENT_STATE.INIT
  get id() {
    return this._uuid
  }
  info(): ClientInfo {
    throw new Error("Method not implemented.")
  }
  async start(flags: string[], options: ClientStartOptions): Promise<void> {
    this._stopped = 0
    this._state = CLIENT_STATE.STARTED
    this._started = Date.now()
  }
  async stop(): Promise<void> {
    this._state = CLIENT_STATE.STOPPED
    this._stopped = Date.now()
  }
  abstract execute(command: string, options?: CommandOptions): Promise<Array<string>> 
}