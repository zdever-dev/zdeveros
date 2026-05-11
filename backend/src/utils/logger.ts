// backend/src/utils/logger.ts
// Kruhový buffer logů pro DevTools

export interface LogEntry {
  id: number;
  ts: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  user: string;
  ip: string;
}

const MAX_ENTRIES = 300;
let counter = 0;
const buffer: LogEntry[] = [];

export function pushLog(entry: Omit<LogEntry, 'id' | 'ts'>) {
  buffer.push({ id: ++counter, ts: new Date().toISOString(), ...entry });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getLogs(limit = 100): LogEntry[] {
  return buffer.slice(-limit).reverse();
}

export function clearLogs() {
  buffer.length = 0;
}