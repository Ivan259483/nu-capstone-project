/**
 * Icon wrapper using @expo/vector-icons (Feather set).
 * Drop-in replacement for lucide-react-native icon components.
 * 
 * Usage:  <Icon name="check-circle" size={20} color="#fff" />
 */
import React from 'react';
import { Feather } from '@expo/vector-icons';
import type { StyleProp, ViewStyle } from 'react-native';

interface IconProps {
  name: keyof typeof Feather.glyphMap;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Icon({ name, size = 24, color = '#fff', style }: IconProps) {
  return <Feather name={name} size={size} color={color} style={style as any} />;
}

// Named exports that mimic lucide-react-native component signatures
export const CheckCircle = (p: Omit<IconProps, 'name'>) => <Icon name="check-circle" {...p} />;
export const Clock = (p: Omit<IconProps, 'name'>) => <Icon name="clock" {...p} />;
export const XCircle = (p: Omit<IconProps, 'name'>) => <Icon name="x-circle" {...p} />;
export const Calendar = (p: Omit<IconProps, 'name'>) => <Icon name="calendar" {...p} />;
export const Car = (p: Omit<IconProps, 'name'>) => <Icon name="truck" {...p} />;
export const Wrench = (p: Omit<IconProps, 'name'>) => <Icon name="tool" {...p} />;
export const CheckSquare = (p: Omit<IconProps, 'name'>) => <Icon name="check-square" {...p} />;
export const Square = (p: Omit<IconProps, 'name'>) => <Icon name="square" {...p} />;
export const Lock = (p: Omit<IconProps, 'name'>) => <Icon name="lock" {...p} />;
export const Shield = (p: Omit<IconProps, 'name'>) => <Icon name="shield" {...p} />;
export const ShieldCheck = (p: Omit<IconProps, 'name'>) => <Icon name="shield" {...p} />;
export const FileText = (p: Omit<IconProps, 'name'>) => <Icon name="file-text" {...p} />;
export const Play = (p: Omit<IconProps, 'name'>) => <Icon name="play" {...p} />;
export const User = (p: Omit<IconProps, 'name'>) => <Icon name="user" {...p} />;
export const MapPin = (p: Omit<IconProps, 'name'>) => <Icon name="map-pin" {...p} />;
export const X = (p: Omit<IconProps, 'name'>) => <Icon name="x" {...p} />;
export const Camera = (p: Omit<IconProps, 'name'>) => <Icon name="camera" {...p} />;
export const Download = (p: Omit<IconProps, 'name'>) => <Icon name="download" {...p} />;
export const LayoutDashboard = (p: Omit<IconProps, 'name'>) => <Icon name="grid" {...p} />;
export const Inbox = (p: Omit<IconProps, 'name'>) => <Icon name="inbox" {...p} />;
export const ListChecks = (p: Omit<IconProps, 'name'>) => <Icon name="list" {...p} />;
