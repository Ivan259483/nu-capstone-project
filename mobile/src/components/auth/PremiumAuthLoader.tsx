import React from 'react';
import PremiumLoader from '@/components/ui/loading/PremiumLoader';

type PremiumAuthLoaderProps = {
  size?: number;
  accessibilityLabel?: string;
};

/**
 * A restrained orbital loader for authentication actions. The indicator is
 * intentionally static when Reduce Motion is enabled; the adjacent status
 * text remains the primary accessible loading cue.
 */
export default function PremiumAuthLoader({
  size = 20,
  accessibilityLabel = 'Authentication in progress',
}: PremiumAuthLoaderProps) {
  return <PremiumLoader size={size} accessibilityLabel={accessibilityLabel} />;
}
