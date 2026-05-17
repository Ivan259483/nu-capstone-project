/**
 * Type shim for `next/dynamic` when the Vite bundle imports it without pulling full Next types.
 * (Next.js `next/navigation` types come from the `next` package when installed.)
 */

declare module 'next/dynamic' {
  import type { ComponentType } from 'react';

  type DynamicOptions = {
    ssr?: boolean;
    loading?: ComponentType<Record<string, unknown>>;
  };

  export default function dynamic<P = Record<string, unknown>>(
    loader: () => Promise<ComponentType<P> | { default: ComponentType<P> }>,
    options?: DynamicOptions
  ): ComponentType<P>;
}
