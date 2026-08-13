import { config } from '../config/environment.js';

export const isConfiguredCorsOriginAllowed = (origin) => {
  // Native clients and trusted server-to-server clients commonly omit Origin.
  if (!origin) return true;
  const allowedOrigins = Array.isArray(config.corsOrigin)
    ? config.corsOrigin
    : [config.corsOrigin].filter(Boolean);
  return allowedOrigins.includes(origin);
};
