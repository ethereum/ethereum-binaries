
export const LOGLEVEL = {
  WARN: -1,
  INFO: 0,
  VERBOSE: 2
}

export class Logger {
  private _loglevel = LOGLEVEL.INFO
  _log(loglevel = LOGLEVEL.INFO, message: string, ...optionalParams: any[]) {
    if (this._loglevel >= loglevel) {
      console.log(message, ...optionalParams)
    }
  }
  log(message: string, ...optionalParams: any[]) {
    this._log(LOGLEVEL.INFO, message, ...optionalParams)
  }
  verbose(message: string, ...optionalParams: any[]) {
    this._log(LOGLEVEL.VERBOSE, message, ...optionalParams)
  }
  warn(message: string, ...optionalParams: any[]) {
    this._log(LOGLEVEL.WARN, message, ...optionalParams)
  }
}