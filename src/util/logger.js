const levels = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = levels.info;

function fmt(level, scope, args) {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level.toUpperCase()}] [${scope}]`, ...args];
}

export function setLogLevel(level) {
  if (levels[level] !== undefined) currentLevel = levels[level];
}

export function createLogger(scope) {
  return {
    debug: (...a) => levels.debug >= currentLevel && console.debug(...fmt('debug', scope, a)),
    info:  (...a) => levels.info  >= currentLevel && console.log(...fmt('info',  scope, a)),
    warn:  (...a) => levels.warn  >= currentLevel && console.warn(...fmt('warn',  scope, a)),
    error: (...a) => levels.error >= currentLevel && console.error(...fmt('error', scope, a)),
  };
}
