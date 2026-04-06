/**
 * Pluggable logger interface for @shiftspace/core.
 *
 * Extensions inject their own logger (e.g. vscode.LogOutputChannel).
 * If no logger is set, messages go to console.
 */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

const consoleLogger: Logger = {
  // eslint-disable-next-line no-console -- fallback logger
  info: (msg, ...args) => console.warn(`[info] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
  // eslint-disable-next-line no-console -- fallback logger
  debug: (msg, ...args) => console.warn(`[debug] ${msg}`, ...args),
};

let _logger: Logger = consoleLogger;

export function setLogger(logger: Logger): void {
  _logger = logger;
}

export const log: Logger = {
  info: (msg, ...args) => _logger.info(msg, ...args),
  warn: (msg, ...args) => _logger.warn(msg, ...args),
  error: (msg, ...args) => _logger.error(msg, ...args),
  debug: (msg, ...args) => _logger.debug(msg, ...args),
};
