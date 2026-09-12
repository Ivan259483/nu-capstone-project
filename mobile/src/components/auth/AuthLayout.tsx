/**
 * AuthLayout — shared screen shell for the auth flow: back button, logo
 * slot, title block, form slot, footer slot, consistent 24px horizontal
 * padding. Used by Sign In / Create Account / Reset Password / OTP.
 *
 * `AuthBackdrop` (the background-image + neutral-scrim rendering) is
 * exported separately so `welcome.tsx` — a bottom-anchored hero screen that
 * doesn't fit the form-shaped title/form/footer slot structure — can reuse
 * just the backdrop without being forced through the rest of this layout.
 */

import React from 'react';
import {
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthColors, AuthRadius, AuthSpacing, AuthTypography } from '@/constants/authTheme';

/** Cinematic photo backdrop with a neutral scrim used by Sign In and Welcome. */
export function AuthBackdrop({
  source,
  bottomFade = false,
}: {
  source: ImageSourcePropType;
  bottomFade?: boolean;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: AuthColors.photoMute }]} />
      <LinearGradient
        colors={[AuthColors.photoScrimTop, AuthColors.photoScrimBottom]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: AuthColors.photoBase }]} />
      {bottomFade ? (
        <LinearGradient
          colors={['transparent', AuthColors.bg]}
          locations={[0, 1]}
          style={styles.bottomFade}
        />
      ) : null}
    </View>
  );
}

interface AuthLayoutProps {
  backgroundImage?: ImageSourcePropType;
  showBack?: boolean;
  onBack?: () => void;
  logo?: React.ReactNode;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const DEFAULT_LOGO_SOURCE = require('../../../assets/images/autospf-logo.png');

export default function AuthLayout({
  backgroundImage,
  showBack = false,
  onBack,
  logo,
  title,
  subtitle,
  children,
  footer,
  scrollable = true,
  keyboardAvoiding = true,
  contentContainerStyle,
}: AuthLayoutProps) {
  const resolvedLogo = logo === undefined ? (
    <Image
      source={DEFAULT_LOGO_SOURCE}
      style={styles.logo}
      contentFit="contain"
      accessibilityLabel="AutoSPF+ Logo"
    />
  ) : logo;

  const slots = (
    <>
      {resolvedLogo ? <View style={styles.logoSlot}>{resolvedLogo}</View> : null}

      {title ? (
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}

      <View style={styles.formSlot}>{children}</View>
    </>
  );

  const body = (
    <>
      {showBack ? (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={AuthColors.textPrimary} />
        </TouchableOpacity>
      ) : null}

      {scrollable ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {slots}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, contentContainerStyle]}>{slots}</View>
      )}

      {footer ? <View style={styles.footerSlot}>{footer}</View> : null}
    </>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: backgroundImage ? 'transparent' : AuthColors.bg }]}
      edges={['top', 'bottom']}
    >
      {backgroundImage ? <AuthBackdrop source={backgroundImage} /> : null}
      {keyboardAvoiding ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
  },
  container: { flex: 1 },
  flex: { flex: 1 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: AuthRadius.full,
    borderWidth: 1,
    borderColor: AuthColors.borderHairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: AuthSpacing.screenPaddingHorizontal,
    marginTop: 8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: AuthSpacing.screenPaddingHorizontal,
    paddingTop: 16,
    paddingBottom: 24,
  },
  logoSlot: {
    alignItems: 'center',
    marginBottom: AuthSpacing.sectionGap,
  },
  logo: {
    width: 120,
    aspectRatio: 604 / 413,
  },
  titleBlock: {
    marginBottom: AuthSpacing.sectionGap,
  },
  title: {
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: AuthTypography.h1.fontSize,
    lineHeight: AuthTypography.h1.lineHeight,
    letterSpacing: AuthTypography.h1.letterSpacing,
    color: AuthColors.textPrimary,
  },
  subtitle: {
    fontFamily: AuthTypography.bodySecondary.fontFamily,
    fontSize: AuthTypography.bodySecondary.fontSize,
    lineHeight: AuthTypography.bodySecondary.lineHeight,
    color: AuthColors.textSecondary,
    marginTop: 8,
  },
  formSlot: {
    width: '100%',
  },
  footerSlot: {
    paddingHorizontal: AuthSpacing.screenPaddingHorizontal,
    paddingBottom: 8,
  },
});
