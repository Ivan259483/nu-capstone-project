import { getIO } from './socket.utils.js';

/** Notify all clients that shop hours / closures changed (admin calendar + customer booking). */
export function emitAvailabilityUpdated(meta = {}) {
  try {
    const io = getIO();
    io.emit('availability_updated', {
      at: new Date().toISOString(),
      ...meta,
    });
  } catch {
    // Socket may be unavailable in tests or during boot
  }
}
