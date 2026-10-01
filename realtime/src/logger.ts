type Level = 'info' | 'warn' | 'error';

/** Structured one-line JSON logs (no per-frame logging). */
export const log = (level: Level, event: string, data: Record<string, unknown> = {}): void => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};
