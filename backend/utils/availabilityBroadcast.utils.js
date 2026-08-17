import { getIO } from './socket.utils.js';

/** Notify all clients that schedule or appointment occupancy changed. */
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
