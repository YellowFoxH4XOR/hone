// Shared I/O for hook entry points.
//
// Prime directive: FAIL OPEN. If anything in Hone throws — corrupt state file,
// bad config, unexpected input shape — the hook exits 0 with no output, which
// Claude Code treats as "no opinion". A coaching plugin must never be the
// reason a developer can't work.

import type { HookInput } from './types.ts';

export function readStdinJson(): Promise<HookInput | null> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data) as HookInput);
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => resolve(null));
  });
}

export function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj));
}

// Wraps a hook main(); guarantees exit 0 on any failure.
export function run(main: (input: HookInput) => void | Promise<void>): void {
  readStdinJson()
    .then((input) => (input ? main(input) : undefined))
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
}
