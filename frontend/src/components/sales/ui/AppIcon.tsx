import React from 'react';
import * as LucideIcons from 'lucide-react';

type IconVariant = 'outline' | 'solid';

interface IconProps {
  name: string;
  variant?: IconVariant;
  size?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  [key: string]: any;
}

function AppIcon({
  name,
  variant = 'outline',
  size = 24,
  className = '',
  onClick,
  disabled = false,
  ...props
}: IconProps) {
  // Map to lucide-react icons (replaces @heroicons/react dependency)
  const IconComponent = (LucideIcons as any)[name] as React.FC<any> | undefined;

  if (!IconComponent) {
    const Fallback = (LucideIcons as any)['HelpCircle'] as React.FC<any>;
    return (
      <Fallback
        size={size}
        className={`text-gray-400 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
        onClick={disabled ? undefined : onClick}
        {...props}
      />
    );
  }

  return (
    <IconComponent
      size={size}
      className={`${disabled ? 'opacity-50 cursor-not-allowed' : onClick ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
      onClick={disabled ? undefined : onClick}
      {...props}
    />
  );
}

export default AppIcon;
