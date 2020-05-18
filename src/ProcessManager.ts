import { ChildProcess } from "child_process";
import { ManagedProcess } from "./types";

export class ProcessManager {
  private _processes: Array<ManagedProcess>
  constructor() {
    this._processes = []
  }
  add(process: ChildProcess, clientId: string) {
    this._processes.push({
      processId: `${process.pid}`,
      process,
      clientId
    })
  }
  kill(processId: string) {
    const managedProcess = this._processes.find(p => p.processId === processId);
    if (!managedProcess) {
      throw new Error(`Process could not be killed - not found: ${processId}`);
    }
    managedProcess.process.kill()
    this._processes = this._processes.filter(p => p.processId !== processId);
  }
}