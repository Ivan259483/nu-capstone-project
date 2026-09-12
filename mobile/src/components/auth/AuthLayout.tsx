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
import {
  AuthColors,
  AuthFontFamily,
  AuthRadius,
  AuthSpacing,
  AuthTypography,
} from '@/constants/authTheme';

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
  appearance?: 'default' | 'loginBrand';
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
const LOGIN_BRAND_BACKGROUND_SOURCE = require('../../../assets/images/login-cinematic-bg.png');

export default function AuthLayout({
  backgroundImage,
  appearance = 'default',
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
  const isLoginBrand = appearance === 'loginBrand';
  const resolvedBackgroundImage = backgroundImage
    ?? (isLoginBrand ? LOGIN_BRAND_BACKGROUND_SOURCE : undefined);
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
      {resolvedLogo ? (
        <View style={[styles.logoSlot, isLoginBrand && styles.logoSlotLoginBrand]}>
          {resolvedLogo}
        </View>
      ) : null}

      {title ? (
        <View style={[styles.titleBlock, isLoginBrand && styles.titleBlockLoginBrand]}>
          <Text style={[styles.title, isLoginBrand && styles.titleLoginBrand]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, isLoginBrand && styles.subtitleLoginBrand]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.formSlot, isLoginBrand && styles.formSlotLoginBrand]}>{children}</View>
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
          contentContainerStyle={[
            styles.scrollContent,
            isLoginBrand && styles.scrollContentLoginBrand,
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {slots}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.scrollContent,
            isLoginBrand && styles.scrollContentLoginBrand,
            contentContainerStyle,
          ]}
        >
          {slots}
        </View>
      )}

      {footer ? (
        <View style={[styles.footerSlot, isLoginBrand && styles.footerSlotLoginBrand]}>
          {footer}
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: resolvedBackgroundImage ? 'transparent' : AuthColors.bg },
      ]}
      edges={['top', 'bottom']}
    >
      {resolvedBackgroundImage ? (
        <AuthBackdrop source={resolvedBackgroundImage} bottomFade={isLoginBrand} />
      ) : null}
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
  scrollContentLoginBrand: {
    alignItems: 'center',
  },
  logoSlot: {
    alignItems: 'center',
    marginBottom: AuthSpacing.sectionGap,
  },
  logoSlotLoginBrand: {
    // The source asset contains about 27px of visible black canvas below the
    // mark at this rendered size. Five layout pixels keep the visible artwork
    // approximately 32px above the heading.
    marginBottom: 5,
  },
  logo: {
    width: 120,
    aspectRatio: 604 / 413,
  },
  titleBlock: {
    marginBottom: AuthSpacing.sectionGap,
  },
  titleBlockLoginBrand: {
    width: '100%',
    maxWidth: 430,
    alignItems: 'center',
  },
  title: {
    fontFamily: AuthTypography.h1.fontFamily,
    fontSize: AuthTypography.h1.fontSize,
    lineHeight: AuthTypography.h1.lineHeight,
    letterSpacing: AuthTypography.h1.letterSpacing,
    color: AuthColors.textPrimary,
  },
  titleLoginBrand: {
    fontFamily: AuthFontFamily.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: AuthTypography.bodySecondary.fontFamily,
    fontSize: AuthTypography.bodySecondary.fontSize,
    lineHeight: AuthTypography.bodySecondary.lineHeight,
    color: AuthColors.textSecondary,
    marginTop: 8,
  },
  subtitleLoginBrand: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  formSlot: {
    width: '100%',
  },
  formSlotLoginBrand: {
    maxWidth: 430,
    alignSelf: 'center',
  },
  footerSlot: {
    paddingHorizontal: AuthSpacing.screenPaddingHorizontal,
    paddingBottom: 8,
  },
  footerSlotLoginBrand: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
  },
});
