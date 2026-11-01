/**
 * Logger Noise Filter
 * Completely suppresses noisy internal engine and third-party library logging
 * (such as libsignal, Baileys session management, prekeys, crypto warnings).
 */

export function isLogNoise(args) {
  for (const arg of args) {
    if (typeof arg === 'string') {
      const lower = arg.toLowerCase();
      if (
        lower.includes('session') ||
        lower.includes('bad mac') ||
        lower.includes('prekey') ||
        lower.includes('expected pubkey') ||
        lower.includes('failed to decrypt') ||
        lower.includes('decrypted message') ||
        lower.includes('unhandled bucket type') ||
        lower.includes('overwriting prekey') ||
        lower.includes('identity key changed') ||
        lower.includes('closing open session') ||
        lower.includes('removing old closed session')
      ) {
        return true;
      }
    } else if (arg && typeof arg === 'object') {
      const name = arg?.constructor?.name || '';
      if (name === 'SessionEntry' || name.toLowerCase().includes('session')) {
        return true;
      }
    }
  }
  return false;
}

export function applyLogNoiseFilter() {
  const origInfo = console.info;
  console.info = function (...args) {
    if (isLogNoise(args)) return;
    origInfo.apply(console, args);
  };

  const origLog = console.log;
  console.log = function (...args) {
    if (isLogNoise(args)) return;
    origLog.apply(console, args);
  };

  const origWarn = console.warn;
  console.warn = function (...args) {
    if (isLogNoise(args)) return;
    origWarn.apply(console, args);
  };

  const origErr = console.error;
  console.error = function (...args) {
    if (isLogNoise(args)) return;
    origErr.apply(console, args);
  };
}
