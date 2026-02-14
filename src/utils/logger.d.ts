export interface LogEntry {
  id?: number;
  level: string;
  category: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

export function getLogs(limit?: number): Promise<LogEntry[]>;
export function exportLogs(limit?: number): Promise<string>;
export function clearLogs(): Promise<void>;
export function logSync(message: string, data?: unknown): void;
export function logError(error: unknown, context?: unknown): void;
export function subscribeToLogs(callback: (entry: LogEntry) => void): () => void;
export function getRecentLogBuffer(): LogEntry[];
export const logDb: { logs: { count(): Promise<number> } };
