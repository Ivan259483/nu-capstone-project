/**
 * Shared POS checkout tracing.
 *
 * `timedPosPaymentStep` is the single canonical wrapper for awaited steps in the POS
 * checkout path. It lives here rather than in a controller because both
 * `billing.controller.js` and `payment.controller.js` need it, and the former already
 * imports from the latter — keeping it in either one would create an import cycle.
 *
 * Every step emits a `[CHECKOUT] <label> start` line BEFORE awaiting and a matching
 * `end` (or `error`) line after. A step that hangs therefore leaves a `start` with no
 * `end`, which is what makes a stalled await identifiable at all.
 */

export const durationMsSince = (startedAt) => Number(process.hrtime.bigint() - startedAt) / 1e6;

export function logPosPayment({ req, orderId, reference, step, status = null, body = null, durationMs }) {
  console.info('[POS PAYMENT]', {
    endpoint: req?.originalUrl || req?.url || null,
    orderId,
    reference: reference || null,
    step,
    httpStatus: status,
    responseBody: body,
    durationMs: Number(durationMs || 0).toFixed(1),
  });
}

/**
 * `[<PREFIX>] <label> <phase>` — the trace line the start/end pairing is read from.
 * The prefix comes from `context.tracePrefix` so the same helper serves the checkout
 * path (`CHECKOUT`) and the billing save path (`BILLING-SAVE`).
 */
export function logCheckoutPhase(context, label, phase, extra = {}) {
  console.info(`[${context?.tracePrefix || 'CHECKOUT'}] ${label} ${phase}`, {
    orderId: context?.orderId || null,
    reference: context?.reference || null,
    pid: process.pid,
    elapsedMs: context?.requestStartedAt
      ? durationMsSince(context.requestStartedAt).toFixed(1)
      : null,
    ...extra,
  });
}

/**
 * Await `operation()` with a start line before it and an end line after it.
 * `label` is the human-readable trace name; `step` stays the machine name used by
 * the pre-existing `[POS PAYMENT]` lines so anything grepping for those still works.
 */
export async function timedTraceStep(context, label, operation, hooks = {}) {
  const startedAt = process.hrtime.bigint();
  logCheckoutPhase(context, label, 'start', hooks.startExtra || {});
  try {
    const value = await operation();
    const durationMs = durationMsSince(startedAt);
    logCheckoutPhase(context, label, 'end', {
      stepMs: durationMs.toFixed(1),
      ...(hooks.endExtra ? hooks.endExtra(value) : {}),
    });
    hooks.onEnd?.(durationMs, value);
    return value;
  } catch (error) {
    const durationMs = durationMsSince(startedAt);
    logCheckoutPhase(context, label, 'error', {
      stepMs: durationMs.toFixed(1),
      code: error.code || null,
      message: error.message,
    });
    hooks.onError?.(durationMs, error);
    throw error;
  }
}

export async function timedPosPaymentStep(context, step, operation, label = step) {
  return timedTraceStep(context, label, operation, {
    onEnd: (durationMs) => logPosPayment({ ...context, step, durationMs }),
    onError: (durationMs, error) => logPosPayment({
      ...context,
      step,
      body: { code: error.code || null, message: error.message },
      durationMs,
    }),
  });
}
