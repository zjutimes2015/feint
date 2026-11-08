import {
  spawn,
  execFileSync,
  type ChildProcess,
  type SpawnOptions,
} from 'node:child_process';

/** Own process groups so pnpm, Playwright and its web server are cleaned together. */
export class PaymentE2EProcesses {
  private children = new Set<ChildProcess>();
  private interrupted?: number;
  private groups = new Map<ChildProcess, Set<number>>();
  private interruptTimer?: ReturnType<typeof setTimeout>;
  private onInt = () => this.interrupt('SIGINT', 130);
  private onTerm = () => this.interrupt('SIGTERM', 143);

  constructor() {
    process.on('SIGINT', this.onInt);
    process.on('SIGTERM', this.onTerm);
  }

  private signal(child: ChildProcess, signal: NodeJS.Signals) {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }
    const groups = this.groups.get(child) ?? new Set([child.pid]);
    // Playwright creates a separate group for its web server. Capture all
    // descendant groups before terminating their parents and losing ancestry.
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid='], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .map((row) => row.trim().split(/\s+/).map(Number));
    const descendants = new Set([child.pid]);
    let added = true;
    while (added) {
      added = false;
      for (const [pid, parent, group] of rows) {
        if (descendants.has(parent) && !descendants.has(pid)) {
          descendants.add(pid);
          groups.add(group);
          added = true;
        }
      }
    }
    this.groups.set(child, groups);
    for (const group of groups) {
      try {
        process.kill(-group, signal);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ESRCH' || code === 'EPERM') continue;
        throw error;
      }
    }
  }

  interrupt(signal: NodeJS.Signals, code: number) {
    this.interrupted ??= code;
    process.exitCode = this.interrupted;
    for (const child of this.children) this.signal(child, signal);
    this.interruptTimer ??= setTimeout(() => {
      for (const child of this.children) this.signal(child, 'SIGKILL');
    }, 3000);
  }

  start(command: string, args: string[], options: SpawnOptions) {
    if (this.interrupted) throw new Error('Payment E2E interrupted');
    const child = spawn(command, args, {
      ...options,
      detached: process.platform !== 'win32',
    });
    this.children.add(child);
    return child;
  }

  async playwright(provider: string, env: NodeJS.ProcessEnv) {
    const child = this.start(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        `playwright.${provider}.config.ts`,
        ...process.argv.slice(2).filter((arg) => arg !== '--'),
      ],
      { env, stdio: 'inherit' }
    );
    const code = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) =>
        resolve(
          code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)
        )
      );
    });
    process.exitCode = this.interrupted ?? code;
  }

  async close() {
    await Promise.all(
      [...this.children].map(async (child) => {
        const closed = new Promise<void>((resolve) => {
          if (
            child.exitCode !== null ||
            child.signalCode !== null ||
            !child.pid
          )
            resolve();
          else child.once('close', () => resolve());
        });
        this.signal(child, 'SIGTERM');
        const timer = setTimeout(() => this.signal(child, 'SIGKILL'), 3000);
        await closed;
        // Also reap descendants if their parent exited before them.
        this.signal(child, 'SIGKILL');
        clearTimeout(timer);
      })
    );
    this.children.clear();
    this.groups.clear();
    clearTimeout(this.interruptTimer);
    process.removeListener('SIGINT', this.onInt);
    process.removeListener('SIGTERM', this.onTerm);
  }
}
