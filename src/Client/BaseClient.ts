import { IClient, ClientInfo, ClientStartOptions } from "../types"
import { uuid } from "../utils"

export abstract class BaseClient implements IClient {
  protected _uuid = uuid()
  protected _started: number = 0
  protected _stopped: number = 0
  get id() {
    return this._uuid
  }
  info(): ClientInfo {
    throw new Error("Method not implemented.")
  }
  async start(flags: string[], options: ClientStartOptions): Promise<void> {
    this._started = Date.now()
  }
  async stop(): Promise<void> {
    this._stopped = Date.now()
  }
}