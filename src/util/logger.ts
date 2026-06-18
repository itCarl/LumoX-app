export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel: number = levels.info;

function fmt(level: LogLevel, scope: string, args: unknown[]): unknown[] {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level.toUpperCase()}] [${scope}]`, ...args];
}

export function setLogLevel(level: LogLevel): void {
  if (levels[level] !== undefined) currentLevel = levels[level];
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...a: unknown[]) => levels.debug >= currentLevel && console.debug(...fmt('debug', scope, a)),
    info:  (...a: unknown[]) => levels.info  >= currentLevel && console.log(...fmt('info',  scope, a)),
    warn:  (...a: unknown[]) => levels.warn  >= currentLevel && console.warn(...fmt('warn',  scope, a)),
    error: (...a: unknown[]) => levels.error >= currentLevel && console.error(...fmt('error', scope, a)),
  };
}
