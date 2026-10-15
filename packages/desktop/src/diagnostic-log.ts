import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Fields = Record<string, string | number | boolean | null | undefined>;
export type UpdateResult = { message: string; detail?: string; stage?: string; attemptId?: string; version?: string };
const MAX_LOG = 1024 * 1024;
export function diagnosticText(value: string): string {
  return value.replace(/-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----/g, '[clé masquée]')
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [masqué]')
    .replace(/((?:token|password|secret|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[masqué]')
    .slice(0, 2000);
}
export function diagnosticError(error: unknown): Fields {
  if (!(error instanceof Error)) return { message: 'Erreur sans diagnostic disponible.' };
  const value = error as NodeJS.ErrnoException;
  return { message: diagnosticText(error.message), code: value.code, syscall: value.syscall };
}

/** Local only. Never pass project contents, tool arguments or environment variables. */
export class DiagnosticLog {
  readonly directory: string | null;
  constructor(preferred: string, readonly version: string, fallback?: string) {
    let selected: string | null = null;
    for (const folder of [...new Set([preferred, fallback].filter((value): value is string => !!value))]) {
      try {
        mkdirSync(folder, { recursive: true });
        appendFileSync(join(folder, 'application.jsonl'), '', { mode: 0o600 });
        selected = folder; break;
      } catch { /* Logging must never prevent startup. */ }
    }
    this.directory = selected;
    this.pruneAttempts();
  }
  write(event: string, fields: Fields = {}): void {
    if (!this.directory) return;
    try {
      const file = join(this.directory, 'application.jsonl');
      if (statSync(file).size >= MAX_LOG) {
        const older = join(this.directory, 'application.2.jsonl');
        try { unlinkSync(older); } catch { /* No older log. */ }
        const previous = join(this.directory, 'application.1.jsonl');
        try { renameSync(previous, older); } catch { /* No previous log. */ }
        renameSync(file, previous);
      }
      const safe: Fields = {};
      for (const [key, value] of Object.entries(fields)) {
        if (/source|dbml|model|presentation|token|authorization|password|secret|key|args|environment/i.test(key)) continue;
        safe[key] = typeof value === 'string' ? diagnosticText(value) : value;
      }
      appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), version: this.version, pid: process.pid, event, ...safe }) + '\n', { mode: 0o600 });
    } catch { /* Diagnostics must not break application operations. */ }
  }
  attemptPath(attemptId: string): string | undefined {
    return this.directory && /^[a-f0-9-]{36}$/.test(attemptId) ? join(this.directory, `update-${attemptId}.jsonl`) : undefined;
  }
  preserveResult(result: UpdateResult): boolean {
    if (!this.directory) return false;
    try {
      const safe = { message: diagnosticText(result.message),
        ...(typeof result.detail === 'string' ? { detail: diagnosticText(result.detail) } : {}),
        ...(typeof result.stage === 'string' ? { stage: result.stage.slice(0, 80) } : {}),
        ...(typeof result.attemptId === 'string' ? { attemptId: result.attemptId.slice(0, 80) } : {}),
        ...(typeof result.version === 'string' ? { version: result.version.slice(0, 40) } : {}) };
      const target = join(this.directory, 'last-update-result.json');
      writeFileSync(target + '.tmp', JSON.stringify(safe, null, 2), { mode: 0o600 });
      renameSync(target + '.tmp', target); return true;
    } catch { return false; }
  }
  lastResult(): UpdateResult | null {
    if (!this.directory) return null;
    try {
      const result = JSON.parse(readFileSync(join(this.directory, 'last-update-result.json'), 'utf8'));
      return typeof result.message === 'string' ? { message: diagnosticText(result.message),
        ...(typeof result.detail === 'string' ? { detail: diagnosticText(result.detail) } : {}),
        ...(typeof result.stage === 'string' ? { stage: result.stage.slice(0, 80) } : {}),
        ...(typeof result.attemptId === 'string' ? { attemptId: result.attemptId.slice(0, 80) } : {}) } : null;
    } catch { return null; }
  }
  private pruneAttempts(): void {
    if (!this.directory) return;
    try {
      const attempts = readdirSync(this.directory, { withFileTypes: true })
        .filter(entry => entry.isFile() && /^update-[a-f0-9-]{36}\.jsonl$/.test(entry.name))
        .map(entry => ({ path: join(this.directory!, entry.name), modified: statSync(join(this.directory!, entry.name)).mtimeMs }))
        .sort((a, b) => b.modified - a.modified);
      for (const entry of attempts.slice(20)) unlinkSync(entry.path);
    } catch { /* Another process may be writing a log. */ }
  }
}
