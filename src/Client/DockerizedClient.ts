import { BaseClient } from "./BaseClient"
import { Container } from "dockerode"
import DockerManager from "../DockerManager"
import { DockerConfig, ClientInfo, ClientStartOptions } from "../types"

export class DockerizedClient extends BaseClient {
  constructor(
    private _container: Container,
    private _dockerManager: DockerManager,
    private _config: DockerConfig
  ) { super() }
  info(): ClientInfo {
    return {
      id: this.id,
      type: 'docker',
      started: this._started,
      stopped: this._stopped,
      processId: this._container.id,
      binaryPath: this._config.entryPoint
    }
  }
  async start(flags: string[] = [], options: ClientStartOptions = {}): Promise<void> {
    await super.start(flags, options)
    const result = await this._container.start()
  }
  async stop(): Promise<void> {
    await super.stop()
    await this._container.stop()
  }
}