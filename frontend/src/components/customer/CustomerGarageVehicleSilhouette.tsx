import React from 'react';

/** Side-profile vehicle silhouettes (MDI paths, bundled — no CDN). */
export type GarageSilhouetteVariant = 'sedan' | 'hatchback' | 'suv' | 'pickup' | 'van';

const GARAGE_SILHOUETTE_PATHS: Record<GarageSilhouetteVariant, string> = {
  sedan:
    'm16 6l3 4h2c1.11 0 2 .89 2 2v3h-2a3 3 0 0 1-3 3a3 3 0 0 1-3-3H9a3 3 0 0 1-3 3a3 3 0 0 1-3-3H1v-3c0-1.11.89-2 2-2l3-4zm-5.5 1.5H6.75L4.86 10h5.64zm1.5 0V10h5.14l-1.89-2.5zm-6 6A1.5 1.5 0 0 0 4.5 15A1.5 1.5 0 0 0 6 16.5A1.5 1.5 0 0 0 7.5 15A1.5 1.5 0 0 0 6 13.5m12 0a1.5 1.5 0 0 0-1.5 1.5a1.5 1.5 0 0 0 1.5 1.5a1.5 1.5 0 0 0 1.5-1.5a1.5 1.5 0 0 0-1.5-1.5',
  hatchback:
    'M16 6H6l-5 6v3h2a3 3 0 0 0 3 3a3 3 0 0 0 3-3h6a3 3 0 0 0 3 3a3 3 0 0 0 3-3h2v-3c0-1.11-.89-2-2-2h-2zM6.5 7.5h4V10h-6zm5.5 0h3.5l1.96 2.5H12zm-6 6A1.5 1.5 0 0 1 7.5 15A1.5 1.5 0 0 1 6 16.5A1.5 1.5 0 0 1 4.5 15A1.5 1.5 0 0 1 6 13.5m12 0a1.5 1.5 0 0 1 1.5 1.5a1.5 1.5 0 0 1-1.5 1.5a1.5 1.5 0 0 1-1.5-1.5a1.5 1.5 0 0 1 1.5-1.5',
  suv:
    'M3 6h13l3 4h2c1.11 0 2 .89 2 2v3h-2a3 3 0 0 1-3 3a3 3 0 0 1-3-3H9a3 3 0 0 1-3 3a3 3 0 0 1-3-3H1V8c0-1.11.89-2 2-2m-.5 1.5V10h8V7.5zm9.5 0V10h5.14l-1.89-2.5zm-6 6A1.5 1.5 0 0 0 4.5 15A1.5 1.5 0 0 0 6 16.5A1.5 1.5 0 0 0 7.5 15A1.5 1.5 0 0 0 6 13.5m12 0a1.5 1.5 0 0 0-1.5 1.5a1.5 1.5 0 0 0 1.5 1.5a1.5 1.5 0 0 0 1.5-1.5a1.5 1.5 0 0 0-1.5-1.5',
  pickup:
    'M16 6h-5.5v4H1v5h2a3 3 0 0 0 3 3a3 3 0 0 0 3-3h6a3 3 0 0 0 3 3a3 3 0 0 0 3-3h2v-3c0-1.11-.89-2-2-2h-2zm-4 1.5h3.5l1.96 2.5H12zm-6 6A1.5 1.5 0 0 1 7.5 15A1.5 1.5 0 0 1 6 16.5A1.5 1.5 0 0 1 4.5 15A1.5 1.5 0 0 1 6 13.5m12 0a1.5 1.5 0 0 1 1.5 1.5a1.5 1.5 0 0 1-1.5 1.5a1.5 1.5 0 0 1-1.5-1.5a1.5 1.5 0 0 1 1.5-1.5',
  van:
    'M3 7c-1.11 0-2 .89-2 2v8h2a3 3 0 0 0 3 3a3 3 0 0 0 3-3h6a3 3 0 0 0 3 3a3 3 0 0 0 3-3h2v-4c0-1.11-.89-2-2-2l-3-4zm0 1.5h4V11H3zm6 0h4V11H9zm6 0h2.5l1.96 2.5H15zm-9 7A1.5 1.5 0 0 1 7.5 17A1.5 1.5 0 0 1 6 18.5A1.5 1.5 0 0 1 4.5 17A1.5 1.5 0 0 1 6 15.5m12 0a1.5 1.5 0 0 1 1.5 1.5a1.5 1.5 0 0 1-1.5 1.5a1.5 1.5 0 0 1-1.5-1.5a1.5 1.5 0 0 1 1.5-1.5',
};

export function resolveGarageSilhouetteVariant(type?: string | null): GarageSilhouetteVariant {
  const t = (type || '').toLowerCase().trim();
  if (t === 'hatchback') return 'hatchback';
  if (t === 'pick up' || t === 'pickup') return 'pickup';
  if (t === 'large suv / van' || t === 'largesuv') return 'van';
  if (t === 'suv') return 'suv';
  return 'sedan';
}

export function getGarageBannerSilhouetteStyle(color?: string | null): React.CSSProperties {
  const colorKey = color?.trim().toLowerCase() || 'white';
  const lightBanner = colorKey === 'white' || colorKey === 'silver' || colorKey === 'yellow' || colorKey === 'orange';
  if (lightBanner) {
    return {
      color: 'rgba(15, 23, 42, 0.36)',
      filter: 'drop-shadow(0 6px 18px rgba(255, 255, 255, 0.5))',
    };
  }
  return {
    color: 'rgba(255, 255, 255, 0.58)',
    filter: 'drop-shadow(0 10px 28px rgba(0, 0, 0, 0.22))',
  };
}

type Props = {
  type?: string | null;
  color?: string | null;
  /** Large ghost on garage card banner, or compact icon in booking picker */
  size?: 'banner' | 'chip';
  /** Chip mode: vehicle accent (e.g. theme.border) */
  accentColor?: string;
  className?: string;
};

export default function CustomerGarageVehicleSilhouette({
  type,
  color,
  size = 'banner',
  accentColor,
  className = '',
}: Props) {
  const variant = resolveGarageSilhouetteVariant(type);
  const isChip = size === 'chip';
  const px = isChip ? 22 : 88;
  const style: React.CSSProperties = isChip
    ? { color: accentColor || '#475569', opacity: 0.9 }
    : getGarageBannerSilhouetteStyle(color);

  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      aria-hidden
      className={`customer-garage-card-banner-icon-graphic shrink-0 ${className}`.trim()}
      style={style}
    >
      <path fill="currentColor" d={GARAGE_SILHOUETTE_PATHS[variant]} />
    </svg>
  );
}
