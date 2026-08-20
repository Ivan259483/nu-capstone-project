const sanitizeMetricName = (value) => String(value || 'operation')
  .toLowerCase()
  .replace(/[^a-z0-9_.-]+/g, '_')
  .slice(0, 80);

const requestPath = (req) => {
  if (!req) return 'background';
  try {
    return new URL(req.originalUrl || req.url || '/', 'http://perf.invalid').pathname;
  } catch {
    return '/unknown';
  }
};

/**
 * Measure one database, external-service, or CPU operation and expose it through
 * both structured logs and the Server-Timing response header.
 */
export async function timeOperation({ req, res, kind = 'operation', name }, operation) {
  const startedAt = process.hrtime.bigint();
  let outcome = 'ok';

  try {
    return await operation();
  } catch (error) {
    outcome = 'error';
    throw error;
  } finally {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const route = requestPath(req);
    const method = req?.method || 'BACKGROUND';
    const metricName = sanitizeMetricName(`${kind}.${name}`);

    console.info(
      `[PERF] kind=${kind} operation=${sanitizeMetricName(name)} method=${method} path=${route} durationMs=${durationMs.toFixed(1)} outcome=${outcome}`
    );

    if (res) {
      res.locals ||= {};
      res.locals.performanceTimings ||= [];
      res.locals.performanceTimings.push({ kind, name, durationMs, outcome });
      if (!res.headersSent && typeof res.setHeader === 'function') {
        const existing = typeof res.getHeader === 'function' ? res.getHeader('Server-Timing') : undefined;
        const metric = `${metricName};dur=${durationMs.toFixed(1)}`;
        res.setHeader('Server-Timing', existing ? `${existing}, ${metric}` : metric);
      }
    }
  }
}

/** Run best-effort work after the current response path without surfacing errors. */
export function runInBackground({ req, kind = 'background', name }, operation) {
  return new Promise((resolve) => {
    setImmediate(() => {
      void timeOperation({ req, kind, name }, operation)
        .then((value) => resolve({ ok: true, value }))
        .catch((error) => {
          console.warn(
            `[PERF] background_failed operation=${sanitizeMetricName(name)} message=${String(error?.message || error).slice(0, 300)}`
          );
          resolve({ ok: false, error });
        });
    });
  });
}
