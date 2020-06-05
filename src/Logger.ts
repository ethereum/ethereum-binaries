
export const LOGLEVEL = {
  WARN: -1,
  INFO: 0,
  VERBOSE: 2
}

export class Logger {
  private _loglevel = LOGLEVEL.WARN

  private static _instance : Logger

  private constructor() {}

  public static getInstance() {
    if (!Logger._instance) {
      Logger._instance = new Logger()
    }
    return Logger._instance
  }

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

const logger = Logger.getInstance()

export default logger