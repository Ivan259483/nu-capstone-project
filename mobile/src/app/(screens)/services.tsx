import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AddVehicleModal from '@/components/booking/AddVehicleModal';
import SkeletonPulse from '@/components/ui/SkeletonPulse';
import { Toast } from '@/components/ui/PremiumToast';
import { getApiErrorMessage, invalidateCache } from '@/services/api/client';
import {
  getPackageKeyFromServiceName,
  serviceService,
  type ServiceVehiclePriceKey,
} from '@/services/api/serviceService';
import type {
  ServiceCatalog,
  ServiceOption,
  ServicePricingCategory,
  Vehicle,
} from '@/services/api/types';
import { vehicleService } from '@/services/api/vehicleService';

const C = {
  bg: '#040405',
  surface: '#0D0D12',
  surfaceHigh: '#16161D',
  border: '#27272A',
  borderSoft: 'rgba(255,255,255,0.09)',
  borderFaint: 'rgba(255,255,255,0.055)',
  orange: '#FF8C00',
  orangeLight: '#FFB77D',
  orangeSoft: 'rgba(255,140,0,0.10)',
  orangeBorder: 'rgba(255,140,0,0.54)',
  onOrange: '#4D2600',
  recommended: '#22C55E',
  white: '#FFFFFF',
  primary: '#F4F4F5',
  secondary: '#A1A1AA',
  muted: '#71717A',
  danger: '#F87171',
} as const;

type PriceView = {
  price: number;
  original: number | null;
  savings: number | null;
};

type PriceUpdateState = {
  vehicle: Vehicle;
  service: ServiceOption;
  price: number;
  categoryLabel: string;
};

type UnavailableState = {
  vehicle: Vehicle;
  requestedName: string;
  categoryLabel: string;
  alternatives: ServiceOption[];
};

const money = (value: number) => `₱${value.toLocaleString('en-PH')}`;

const getPriceView = (
  service: ServiceOption,
  category: ServicePricingCategory,
): PriceView | null => {
  const key = category.apiKey as ServiceVehiclePriceKey;
  const legacyKey = key === 'largeSuv' ? 'largesuv' : key;
  const baseValue = service.pricing?.[key]?.base
    ?? service.prices?.[key]
    ?? service.prices?.[legacyKey as keyof typeof service.prices];
  const price = Number(baseValue);
  if (!Number.isFinite(price) || price <= 0) return null;

  const originalValue = Number(service.pricing?.[key]?.original);
  const original = Number.isFinite(originalValue) && originalValue > price
    ? originalValue
    : null;
  return {
    price,
    original,
    savings: original !== null ? original - price : null,
  };
};

const serviceCode = (service: ServiceOption) => {
  const match = service.name.match(/spf\s*[-_]*(80|89|99|101)/i);
  return match ? `SPF ${match[1]}` : service.name;
};

const serviceName = (service: ServiceOption) => {
  const withoutCode = service.name
    .replace(/spf\s*[-_]*(80|89|99|101)\s*[—–-]?\s*/i, '')
    .replace(/\s+ALL[-\s]?IN\s*$/i, '')
    .trim();
  return withoutCode || service.catalogCard?.tierLabel || 'Protection Package';
};

const categoryForCode = (
  categories: ServicePricingCategory[],
  code?: string | null,
) => categories.find((category) => category.code === code);

function SheetShell({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={s.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={s.backdrop}
        />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}> 
          <View style={s.handle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

function PackageDetailsSheet({
  service,
  category,
  onClose,
}: {
  service: ServiceOption | null;
  category: ServicePricingCategory | null;
  onClose: () => void;
}) {
  const price = service && category ? getPriceView(service, category) : null;
  const inclusions = useMemo(
    () => service?.catalogCard?.fullInclusions || [],
    [service?.catalogCard?.fullInclusions],
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof inclusions>();
    inclusions.forEach((item) => {
      const key = item.group || 'Package Inclusions';
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return Array.from(groups.entries());
  }, [inclusions]);

  return (
    <SheetShell visible={Boolean(service && category)} onClose={onClose}>
      {service && category && price ? (
        <>
          <View style={s.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>{service.catalogCard?.tierLabel || service.tier || 'PACKAGE'}</Text>
              <Text style={s.sheetTitle}>{serviceCode(service)} — {serviceName(service)}</Text>
              <Text style={s.sheetSubtitle}>{category.label} pricing</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close package details" onPress={onClose} style={s.closeButton}>
              <Ionicons name="close" size={19} color={C.white} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.detailsContent} showsVerticalScrollIndicator={false}>
            <View style={s.detailsPriceRow}>
              <Text style={s.detailsPrice}>{money(price.price)}</Text>
              {price.original !== null ? <Text style={s.detailsOriginal}>SRP {money(price.original)}</Text> : null}
            </View>
            {price.savings !== null ? <Text style={s.detailsSavings}>You save {money(price.savings)}</Text> : null}
            {service.catalogCard?.tagline ? <Text style={s.detailsTagline}>{service.catalogCard.tagline}</Text> : null}

            <View style={s.specRow}>
              {service.catalogCard?.warrantyLabel ? (
                <View style={s.specItem}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={C.orangeLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.specLabel}>PROTECTION</Text>
                    <Text style={s.specValue}>{service.catalogCard.warrantyLabel}</Text>
                  </View>
                </View>
              ) : null}
              {service.duration ? (
                <View style={s.specItem}>
                  <Ionicons name="time-outline" size={17} color={C.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.specLabel}>SERVICE TIME</Text>
                    <Text style={s.specValue}>{service.duration}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {grouped.map(([group, items]) => (
              <View key={group} style={s.detailGroup}>
                <Text style={s.detailGroupTitle}>{group}</Text>
                {items.map((item, index) => (
                  <View key={`${group}-${item.title}-${index}`} style={s.inclusionRow}>
                    <View style={s.checkCircle}>
                      <Ionicons name="checkmark" size={12} color={C.orange} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.inclusionTitle}>{item.title}</Text>
                      {item.detail ? <Text style={s.inclusionDetail}>{item.detail}</Text> : null}
                      {item.savingsLabel ? <Text style={s.inclusionSavings}>{item.savingsLabel}</Text> : null}
                    </View>
                  </View>
                ))}
                {group === 'Paint Protection Film' && service.catalogCard?.ppfCoverage?.length ? (
                  <View style={s.coverageWrap}>
                    <Text style={s.coverageLabel}>PPF COVERAGE</Text>
                    <View style={s.coverageGrid}>
                      {service.catalogCard.ppfCoverage.map((area) => (
                        <View key={area} style={s.coveragePill}><Text style={s.coverageText}>{area}</Text></View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
            {service.description ? (
              <View style={s.notesBlock}>
                <Text style={s.detailGroupTitle}>Package notes</Text>
                <Text style={s.notesText}>{service.description}</Text>
              </View>
            ) : null}
          </ScrollView>
        </>
      ) : null}
    </SheetShell>
  );
}

function CatalogSkeleton() {
  return (
    <View style={s.cardList} accessibilityLabel="Loading services">
      {[0, 1, 2].map((item) => (
        <SkeletonPulse key={item} style={s.skeletonCard}>
          <View style={s.skeletonLineShort} />
          <View style={s.skeletonLineTitle} />
          <View style={s.skeletonLinePrice} />
          <View style={s.skeletonLineBody} />
          <View style={s.skeletonActions} />
        </SkeletonPulse>
      ))}
    </View>
  );
}

export default function ServicesCatalogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<ServiceCatalog | null>(null);
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [detailsService, setDetailsService] = useState<ServiceOption | null>(null);
  const [pendingService, setPendingService] = useState<ServiceOption | null>(null);
  const [checkingServiceId, setCheckingServiceId] = useState<string | null>(null);
  const [priceUpdate, setPriceUpdate] = useState<PriceUpdateState | null>(null);
  const [unavailable, setUnavailable] = useState<UnavailableState | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await serviceService.getCatalog();
      if (!next.pricingCategories.length || !next.packages.length) {
        throw new Error('The service catalog is incomplete.');
      }
      setCatalog(next);
      setSelectedCategoryCode((current) => (
        next.pricingCategories.some((category) => category.code === current)
          ? current
          : next.pricingCategories[0].code
      ));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'We couldn’t load services.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVehicles = useCallback(async (): Promise<Vehicle[] | null> => {
    try {
      const next = await vehicleService.getMyVehicles();
      setVehicles(next);
      setVehiclesLoaded(true);
      return next;
    } catch (loadError) {
      setVehiclesLoaded(false);
      Toast.show(getApiErrorMessage(loadError, 'We couldn’t load your Garage. Please try again.'), 'error');
      return null;
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
    void loadVehicles();
  }, [loadCatalog, loadVehicles]);

  const categories = useMemo(() => catalog?.pricingCategories || [], [catalog?.pricingCategories]);
  const selectedCategory = categories.find((category) => category.code === selectedCategoryCode) || null;
  const visiblePackages = useMemo(() => {
    if (!catalog || !selectedCategory) return [];
    return catalog.packages
      .filter((service) => getPriceView(service, selectedCategory) !== null)
      .sort((a, b) => (
        (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
        || a.name.localeCompare(b.name)
      ));
  }, [catalog, selectedCategory]);

  const navigateToBooking = useCallback((vehicle: Vehicle, service: ServiceOption) => {
    const vehicleId = vehicle.id || vehicle._id;
    if (!vehicleId) return;
    router.push({
      pathname: '/(customer)/book',
      params: {
        vehicleId,
        serviceId: service.id,
        ...(getPackageKeyFromServiceName(service.name)
          ? { pkg: getPackageKeyFromServiceName(service.name)! }
          : {}),
      },
    });
  }, [router]);

  const continueWithVehicle = useCallback(async (vehicle: Vehicle, browsedService: ServiceOption) => {
    const vehicleId = vehicle.id || vehicle._id;
    if (!vehicleId || !selectedCategory) return;
    setCheckingServiceId(browsedService.id);
    try {
      invalidateCache('/services/booking-options');
      const authoritative = await serviceService.getBookingCatalog(vehicleId);
      const actualVehicle = {
        ...vehicle,
        ...(authoritative.vehicle || {}),
        plateNumber: authoritative.vehicle?.plateNumber || vehicle.plateNumber,
      };
      const requestedCode = browsedService.packageCode || getPackageKeyFromServiceName(browsedService.name)?.toUpperCase();
      const actualService = authoritative.packages.find((service) => service.id === browsedService.id)
        || authoritative.packages.find((service) => (
          service.packageCode === requestedCode
          || getPackageKeyFromServiceName(service.name) === getPackageKeyFromServiceName(browsedService.name)
        ));
      const actualCategory = categoryForCode(categories, actualVehicle.pricingCategory);
      const categoryLabel = actualCategory?.label || 'selected vehicle class';
      const actualPrice = Number(actualService?.promoPrice);
      const isAvailable = Boolean(
        actualService
        && actualService.available !== false
        && Number.isFinite(actualPrice)
        && actualPrice > 0
      );

      if (!isAvailable || !actualService) {
        setUnavailable({
          vehicle: actualVehicle,
          requestedName: browsedService.name,
          categoryLabel,
          alternatives: authoritative.packages.filter((service) => (
            service.available !== false
            && Number.isFinite(Number(service.promoPrice))
            && Number(service.promoPrice) > 0
          )),
        });
        return;
      }

      const browsedPrice = getPriceView(browsedService, selectedCategory)?.price ?? null;
      if (browsedPrice !== actualPrice) {
        setPriceUpdate({ vehicle: actualVehicle, service: actualService, price: actualPrice, categoryLabel });
        return;
      }
      navigateToBooking(actualVehicle, actualService);
    } catch (bookingError) {
      Toast.show(getApiErrorMessage(bookingError, 'We couldn’t confirm current pricing. Please try again.'), 'error');
    } finally {
      setCheckingServiceId(null);
    }
  }, [categories, navigateToBooking, selectedCategory]);

  const handleBook = useCallback(async (service: ServiceOption) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingService(service);
    setCheckingServiceId(service.id);
    const garage = vehiclesLoaded ? vehicles : await loadVehicles();
    if (!garage) {
      setCheckingServiceId(null);
      return;
    }
    if (garage.length === 0) {
      setCheckingServiceId(null);
      setAddVehicleOpen(true);
      return;
    }
    if (garage.length === 1) {
      await continueWithVehicle(garage[0], service);
      return;
    }
    setCheckingServiceId(null);
    setVehiclePickerOpen(true);
  }, [continueWithVehicle, loadVehicles, vehicles, vehiclesLoaded]);

  return (
    <View style={s.screen}>
      <LinearGradient colors={['rgba(255,140,0,0.07)', 'transparent']} style={s.headerGlow} pointerEvents="none" />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}> 
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.backButton}>
          <Ionicons name="chevron-back" size={21} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerEyebrow}>AUTOSPF+ PROTECTION</Text>
          <Text style={s.headerTitle}>Services</Text>
          <Text style={s.headerSubtitle}>Compare premium care packages tailored to your vehicle class.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 18) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {!loading && !error && selectedCategory ? (
          <Animated.View entering={FadeInDown.duration(180)}>
            <Text style={s.fieldLabel}>VEHICLE CLASS</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Vehicle class, ${selectedCategory.label}`}
              accessibilityHint="Opens the vehicle class selector"
              activeOpacity={0.84}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCategoryPickerOpen(true);
              }}
              style={s.selector}
            >
              <View style={s.selectorIcon}><Ionicons name="car-sport-outline" size={18} color={C.orange} /></View>
              <View style={s.selectorCopy}>
                <Text style={s.selectorOverline}>SELECTED CLASS</Text>
                <Text style={s.selectorText}>{selectedCategory.label}</Text>
              </View>
              <View style={s.selectorChevron}>
                <Ionicons name="chevron-down" size={16} color={C.secondary} />
              </View>
            </TouchableOpacity>
            <View style={s.indicativeRow}>
              <Ionicons name="information-circle-outline" size={13} color={C.muted} />
              <Text style={s.indicativeNote}>Your saved vehicle confirms the final booking price.</Text>
            </View>
          </Animated.View>
        ) : null}

        {loading ? <CatalogSkeleton /> : error ? (
          <View style={s.errorCard}>
            <View style={s.errorIcon}><Ionicons name="cloud-offline-outline" size={22} color={C.orangeLight} /></View>
            <Text style={s.errorTitle}>We couldn’t load services.</Text>
            <Text style={s.errorBody}>Check your connection and try again.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading services" onPress={() => void loadCatalog()} style={s.retryButton}>
              <Ionicons name="refresh" size={15} color={C.onOrange} />
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : selectedCategory ? (
          <View style={s.catalogSection}>
            <View style={s.sectionHeading}>
              <View style={s.sectionTitleBlock}>
                <Text style={s.sectionEyebrow}>CURATED SERVICE CATALOG</Text>
                <Text style={s.sectionTitle}>Ceramic &amp; Protection Lineup</Text>
              </View>
              <View style={s.sectionMeta}>
                <Text style={s.packageCount}>{visiblePackages.length} packages available</Text>
                <View style={s.sectionMetaDivider} />
                <View style={s.livePill}><View style={s.liveDot} /><Text style={s.liveText}>LIVE PRICING</Text></View>
              </View>
            </View>

            <View style={s.cardList}>
              {visiblePackages.map((service, index) => {
                const price = getPriceView(service, selectedCategory)!;
                const badge = service.catalogCard?.badge?.trim();
                const busy = checkingServiceId === service.id;
                const recommended = Boolean(service.catalogCard?.popular || badge?.toLowerCase().includes('recommended'));
                const flagship = Boolean(service.catalogCard?.flagship || badge?.toLowerCase().includes('all-in'));
                const premium = Boolean(!flagship && badge?.toLowerCase().includes('premium'));
                return (
                  <Animated.View
                    key={service.id}
                    entering={FadeInDown.delay(index * 45).duration(200)}
                    style={s.packageCardShadow}
                  >
                    <View style={[s.packageCard, recommended && s.packageCardRecommended, flagship && s.packageCardFlagship]}>
                    <LinearGradient
                      colors={flagship
                        ? ['rgba(255,183,125,0.085)', 'rgba(255,255,255,0.018)', 'transparent']
                        : ['rgba(255,255,255,0.035)', 'transparent']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.cardSurfaceGradient}
                      pointerEvents="none"
                    />
                    <View style={[s.cardAccent, recommended && s.cardAccentRecommended]} />
                    <View style={s.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <View style={s.tierRow}>
                          <View style={s.tierRule} />
                          <Text style={s.tier}>{service.catalogCard?.tierLabel || service.tier || 'PACKAGE'}</Text>
                        </View>
                      </View>
                      {badge ? (
                        <View style={[
                          s.badge,
                          recommended && s.badgeRecommended,
                          premium && s.badgePremium,
                          flagship && s.badgeFlagship,
                        ]}>
                          <Ionicons
                            name={recommended ? 'star' : flagship ? 'diamond-outline' : premium ? 'shield-checkmark-outline' : 'pricetag-outline'}
                            size={11}
                            color={recommended ? C.recommended : premium ? C.primary : C.orangeLight}
                          />
                          <Text
                            style={[s.badgeText, recommended && s.badgeTextRecommended, premium && s.badgeTextPremium]}
                            numberOfLines={1}
                          >
                            {badge}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={s.packageCode}>{serviceCode(service)}</Text>
                    <Text style={s.packageSubtitle} numberOfLines={2}>
                      {service.catalogCard?.tagline || serviceName(service)}
                    </Text>

                    <View style={s.priceBlock}>
                      <Text style={s.priceLabel}>PACKAGE PRICE</Text>
                      <View style={s.priceRow}>
                        <Text style={s.price}>{money(price.price)}</Text>
                        <View style={s.priceComparison}>
                          {price.original !== null ? <Text style={s.originalPrice}>SRP {money(price.original)}</Text> : null}
                          {price.savings !== null ? <View style={s.savePill}><Text style={s.saveText}>Save {money(price.savings)}</Text></View> : null}
                        </View>
                      </View>
                    </View>

                    <View style={s.metadataRow}>
                      {service.catalogCard?.warrantyLabel ? (
                        <View style={s.metadataItem}>
                          <View style={s.metadataIcon}><Ionicons name="shield-checkmark-outline" size={15} color={C.orangeLight} /></View>
                          <View style={s.metadataCopy}>
                            <Text style={s.metadataLabel}>PROTECTION</Text>
                            <Text style={s.metadataText} numberOfLines={1}>{service.catalogCard.warrantyLabel}</Text>
                          </View>
                        </View>
                      ) : null}
                      {service.duration ? (
                        <View style={s.metadataItem}>
                          <View style={s.metadataIcon}><Ionicons name="time-outline" size={15} color={C.secondary} /></View>
                          <View style={s.metadataCopy}>
                            <Text style={s.metadataLabel}>SERVICE TIME</Text>
                            <Text style={s.metadataText} numberOfLines={1}>{service.duration}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    <View style={s.descriptionBlock}>
                      <Text style={s.descriptionLabel}>PACKAGE OVERVIEW</Text>
                      <Text style={s.description} numberOfLines={3}>{service.description || 'Premium vehicle protection package.'}</Text>
                    </View>

                    <View style={s.cardActions}>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`See what's included in ${service.name}`} onPress={() => setDetailsService(service)} style={s.detailsButton}>
                        <Ionicons name="list-outline" size={15} color={C.orangeLight} />
                        <Text style={s.detailsButtonText}>See what’s included</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Book ${service.name}`}
                        activeOpacity={0.86}
                        disabled={Boolean(checkingServiceId)}
                        onPress={() => void handleBook(service)}
                        style={[s.bookButton, Boolean(checkingServiceId) && s.buttonDisabled]}
                      >
                        <Text style={s.bookButtonText}>{busy ? 'Checking…' : 'Book This Package'}</Text>
                        {!busy ? <Ionicons name="arrow-forward" size={15} color={C.onOrange} /> : null}
                      </TouchableOpacity>
                    </View>
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <SheetShell visible={categoryPickerOpen} onClose={() => setCategoryPickerOpen(false)}>
        <View style={s.sheetHeader}>
          <View><Text style={s.eyebrow}>BROWSE PRICING</Text><Text style={s.sheetTitle}>Choose Vehicle Class</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close vehicle class selector" onPress={() => setCategoryPickerOpen(false)} style={s.closeButton}>
            <Ionicons name="close" size={19} color={C.white} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.choiceList} showsVerticalScrollIndicator={false}>
          {categories.map((category) => {
            const active = selectedCategoryCode === category.code;
            return (
              <TouchableOpacity
                key={category.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={category.label}
                activeOpacity={0.82}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedCategoryCode(category.code);
                }}
                style={[s.choiceRow, active && s.choiceRowActive]}
              >
                <View style={[s.radio, active && s.radioActive]}>{active ? <View style={s.radioDot} /> : null}</View>
                <Text style={[s.choiceText, active && s.choiceTextActive]}>{category.label}</Text>
                {active ? <Ionicons name="checkmark" size={17} color={C.orange} /> : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Done choosing vehicle class" onPress={() => setCategoryPickerOpen(false)} style={s.sheetPrimaryButton}>
          <Text style={s.sheetPrimaryText}>Done</Text>
        </TouchableOpacity>
      </SheetShell>

      <SheetShell visible={vehiclePickerOpen} onClose={() => setVehiclePickerOpen(false)}>
        <View style={s.sheetHeader}>
          <View><Text style={s.eyebrow}>YOUR GARAGE</Text><Text style={s.sheetTitle}>Choose Vehicle</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close vehicle selector" onPress={() => setVehiclePickerOpen(false)} style={s.closeButton}>
            <Ionicons name="close" size={19} color={C.white} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={s.choiceList} showsVerticalScrollIndicator={false}>
          {vehicles.map((vehicle) => {
            const vehicleCategory = categoryForCode(categories, vehicle.pricingCategory);
            return (
              <TouchableOpacity
                key={vehicle.id || vehicle._id}
                accessibilityRole="button"
                accessibilityLabel={`Book for ${vehicle.make} ${vehicle.model}`}
                activeOpacity={0.82}
                onPress={() => {
                  setVehiclePickerOpen(false);
                  if (pendingService) void continueWithVehicle(vehicle, pendingService);
                }}
                style={s.vehicleRow}
              >
                <View style={s.vehicleIcon}><Ionicons name="car-sport-outline" size={19} color={C.orange} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vehicleName}>{`${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim()}</Text>
                  <Text style={s.vehicleMeta}>{vehicleCategory?.label || vehicle.vehicleType || 'Vehicle'} · {vehicle.plateNumber || 'No plate'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={C.secondary} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SheetShell>

      <PackageDetailsSheet service={detailsService} category={selectedCategory} onClose={() => setDetailsService(null)} />

      <AddVehicleModal
        visible={addVehicleOpen}
        onClose={() => setAddVehicleOpen(false)}
        onVehicleAdded={(vehicle) => {
          setVehicles((current) => [...current, vehicle]);
          setVehiclesLoaded(true);
          setAddVehicleOpen(false);
          if (pendingService) void continueWithVehicle(vehicle, pendingService);
        }}
      />

      <Modal visible={Boolean(priceUpdate)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setPriceUpdate(null)} accessibilityViewIsModal>
        <View style={s.dialogOverlay}>
          <View style={s.dialog}>
            <View style={s.dialogIcon}><Ionicons name="pricetag-outline" size={21} color={C.orange} /></View>
            <Text style={s.dialogEyebrow}>AUTHORITATIVE PRICE</Text>
            <Text style={s.dialogTitle}>Pricing updated for your {priceUpdate ? `${priceUpdate.vehicle.make} ${priceUpdate.vehicle.model}`.trim() : 'vehicle'}</Text>
            {priceUpdate ? (
              <>
                <Text style={s.dialogPackage}>{serviceCode(priceUpdate.service)} — {serviceName(priceUpdate.service)}</Text>
                <Text style={s.dialogPrice}>{money(priceUpdate.price)}</Text>
                <Text style={s.dialogBody}>Pricing is based on your {priceUpdate.categoryLabel}.</Text>
              </>
            ) : null}
            <View style={s.dialogActions}>
              <TouchableOpacity accessibilityRole="button" onPress={() => setPriceUpdate(null)} style={s.dialogSecondary}><Text style={s.dialogSecondaryText}>Not now</Text></TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  if (priceUpdate) navigateToBooking(priceUpdate.vehicle, priceUpdate.service);
                  setPriceUpdate(null);
                }}
                style={s.dialogPrimary}
              >
                <Text style={s.dialogPrimaryText}>Continue to Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(unavailable)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setUnavailable(null)} accessibilityViewIsModal>
        <View style={s.dialogOverlay}>
          <View style={[s.dialog, s.unavailableDialog]}>
            <View style={s.dialogIcon}><Ionicons name="alert-circle-outline" size={21} color={C.orange} /></View>
            <Text style={s.dialogEyebrow}>PACKAGE AVAILABILITY</Text>
            <Text style={s.dialogTitle}>
              {unavailable ? `${serviceCode({ name: unavailable.requestedName } as ServiceOption)} isn’t available for your ${`${unavailable.vehicle.make} ${unavailable.vehicle.model}`.trim()}.` : ''}
            </Text>
            {unavailable ? <Text style={s.dialogBody}>Choose an available package priced for your {unavailable.categoryLabel}.</Text> : null}
            <ScrollView style={s.alternativeScroll} contentContainerStyle={s.alternativeList} showsVerticalScrollIndicator={false}>
              {unavailable?.alternatives.map((service) => (
                <TouchableOpacity
                  key={service.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${service.name}`}
                  onPress={() => {
                    navigateToBooking(unavailable.vehicle, service);
                    setUnavailable(null);
                  }}
                  style={s.alternativeRow}
                >
                  <View style={{ flex: 1 }}><Text style={s.alternativeName}>{serviceCode(service)} — {serviceName(service)}</Text><Text style={s.alternativeMeta}>{money(Number(service.promoPrice))}</Text></View>
                  <Ionicons name="arrow-forward" size={16} color={C.orange} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity accessibilityRole="button" onPress={() => setUnavailable(null)} style={s.unavailableClose}><Text style={s.dialogSecondaryText}>Keep browsing</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 240 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 20, paddingBottom: 22, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderSoft },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: C.borderSoft },
  headerEyebrow: { color: C.orange, fontSize: 8.5, lineHeight: 11, fontWeight: '800', letterSpacing: 1.35, marginBottom: 4 },
  headerTitle: { color: C.white, fontSize: 27, lineHeight: 31, fontWeight: '800', letterSpacing: -0.55 },
  headerSubtitle: { maxWidth: 310, color: C.secondary, fontSize: 12.5, lineHeight: 18, marginTop: 5 },
  content: { paddingHorizontal: 18, paddingTop: 22 },
  fieldLabel: { color: C.muted, fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },
  selector: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, backgroundColor: C.surfaceHigh, borderRadius: 16, borderWidth: 1, borderColor: C.orangeBorder },
  selectorIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: 'rgba(255,140,0,0.17)' },
  selectorCopy: { flex: 1 },
  selectorOverline: { color: C.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.85 },
  selectorText: { color: C.white, fontSize: 14.5, lineHeight: 19, fontWeight: '700', marginTop: 2 },
  selectorChevron: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.045)' },
  indicativeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 9, paddingHorizontal: 2 },
  indicativeNote: { flex: 1, color: C.muted, fontSize: 10.5, lineHeight: 15 },
  catalogSection: { marginTop: 29 },
  sectionHeading: { gap: 11, marginBottom: 14 },
  sectionTitleBlock: { gap: 3 },
  sectionEyebrow: { color: C.orange, fontSize: 8.5, lineHeight: 11, fontWeight: '800', letterSpacing: 1.15 },
  sectionTitle: { color: C.primary, fontSize: 18, lineHeight: 23, fontWeight: '800', letterSpacing: -0.28 },
  sectionMeta: { minHeight: 28, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: C.borderFaint },
  packageCount: { color: C.secondary, fontSize: 9.5, lineHeight: 13, fontWeight: '600' },
  sectionMetaDivider: { width: StyleSheet.hairlineWidth, height: 12, marginHorizontal: 8, backgroundColor: C.borderSoft },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.orange },
  liveText: { color: C.orangeLight, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.65 },
  cardList: { gap: 14 },
  packageCardShadow: { borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 3 },
  packageCard: { padding: 17, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  packageCardRecommended: { borderColor: 'rgba(255,140,0,0.36)' },
  packageCardFlagship: { borderColor: 'rgba(255,183,125,0.26)' },
  cardSurfaceGradient: { ...StyleSheet.absoluteFillObject },
  cardAccent: { position: 'absolute', top: 0, left: 17, right: 17, height: 1, backgroundColor: 'rgba(255,183,125,0.32)' },
  cardAccentRecommended: { backgroundColor: C.orange },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tierRule: { width: 12, height: 1, backgroundColor: C.orange },
  tier: { color: C.orangeLight, fontSize: 8.5, lineHeight: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  packageCode: { color: C.white, fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -0.65, marginTop: 14 },
  packageSubtitle: { maxWidth: '90%', color: C.secondary, fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 2 },
  badge: { maxWidth: '48%', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: 'rgba(255,140,0,0.30)' },
  badgeRecommended: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.24)' },
  badgePremium: { backgroundColor: 'rgba(255,255,255,0.055)', borderColor: C.borderSoft },
  badgeFlagship: { backgroundColor: 'rgba(255,183,125,0.075)', borderColor: 'rgba(255,183,125,0.23)' },
  badgeText: { flexShrink: 1, color: C.orangeLight, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.55 },
  badgeTextRecommended: { color: C.recommended },
  badgeTextPremium: { color: C.primary },
  priceBlock: { marginTop: 17, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderSoft },
  priceLabel: { color: C.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 1.05 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 3 },
  price: { flexShrink: 1, color: C.white, fontSize: 29, lineHeight: 34, fontWeight: '800', letterSpacing: -0.85 },
  priceComparison: { alignItems: 'flex-end', gap: 4 },
  originalPrice: { color: C.muted, fontSize: 10, lineHeight: 13, fontWeight: '600', textDecorationLine: 'line-through' },
  savePill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,140,0,0.09)', borderWidth: 1, borderColor: 'rgba(255,140,0,0.14)' },
  saveText: { color: C.orangeLight, fontSize: 8.5, lineHeight: 11, fontWeight: '800', letterSpacing: 0.15 },
  metadataRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  metadataItem: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.028)', borderWidth: 1, borderColor: C.borderFaint },
  metadataIcon: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.035)' },
  metadataCopy: { flex: 1, minWidth: 0 },
  metadataLabel: { color: C.muted, fontSize: 6.8, lineHeight: 9, fontWeight: '800', letterSpacing: 0.55 },
  metadataText: { color: C.primary, fontSize: 9.5, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  descriptionBlock: { marginTop: 14 },
  descriptionLabel: { color: C.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.9 },
  description: { color: C.secondary, fontSize: 11, lineHeight: 16, marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderSoft },
  detailsButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceHigh },
  detailsButtonText: { color: C.primary, fontSize: 10, fontWeight: '700' },
  bookButton: { flex: 1.25, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: C.orange },
  bookButtonText: { color: C.onOrange, fontSize: 10.5, fontWeight: '800' },
  buttonDisabled: { opacity: 0.5 },
  errorCard: { marginTop: 64, alignItems: 'center', padding: 24, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  errorIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.orangeSoft, marginBottom: 12 },
  errorTitle: { color: C.white, fontSize: 16, fontWeight: '800' },
  errorBody: { color: C.secondary, fontSize: 12, marginTop: 5 },
  retryButton: { marginTop: 16, minWidth: 112, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: C.orange },
  retryText: { color: C.onOrange, fontSize: 12, fontWeight: '800' },
  skeletonCard: { height: 212, borderRadius: 18, padding: 16, backgroundColor: C.surface, marginBottom: 0 },
  skeletonLineShort: { width: '27%', height: 8, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.07)' },
  skeletonLineTitle: { width: '62%', height: 20, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 12 },
  skeletonLinePrice: { width: '42%', height: 26, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.07)', marginTop: 14 },
  skeletonLineBody: { width: '78%', height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 14 },
  skeletonActions: { height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.065)', marginTop: 20 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.74)' },
  sheet: { maxHeight: '86%', minHeight: 250, backgroundColor: '#101014', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border, paddingHorizontal: 18, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, backgroundColor: '#3F3F46', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingBottom: 14 },
  eyebrow: { color: C.orange, fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1.2 },
  sheetTitle: { color: C.white, fontSize: 20, lineHeight: 25, fontWeight: '800', marginTop: 3 },
  sheetSubtitle: { color: C.secondary, fontSize: 11, lineHeight: 15, marginTop: 2 },
  closeButton: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  choiceList: { gap: 8, paddingBottom: 14 },
  choiceRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  choiceRowActive: { borderColor: C.orangeBorder, backgroundColor: C.orangeSoft },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.5, borderColor: '#52525B', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: C.orange },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.orange },
  choiceText: { flex: 1, color: C.secondary, fontSize: 13, fontWeight: '600' },
  choiceTextActive: { color: C.white },
  sheetPrimaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: C.orange },
  sheetPrimaryText: { color: C.onOrange, fontSize: 13, fontWeight: '800' },
  vehicleRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  vehicleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.orangeSoft },
  vehicleName: { color: C.white, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  vehicleMeta: { color: C.muted, fontSize: 10.5, lineHeight: 15, marginTop: 2 },
  detailsContent: { paddingBottom: 12 },
  detailsPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  detailsPrice: { color: C.white, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  detailsOriginal: { color: C.muted, fontSize: 11, textDecorationLine: 'line-through' },
  detailsSavings: { color: C.orangeLight, fontSize: 11, fontWeight: '700', marginTop: 1 },
  detailsTagline: { color: C.secondary, fontSize: 12, lineHeight: 18, marginTop: 10 },
  specRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  specItem: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  specLabel: { color: C.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '800', letterSpacing: 0.75 },
  specValue: { color: C.white, fontSize: 10.5, lineHeight: 14, fontWeight: '600', marginTop: 2 },
  detailGroup: { marginTop: 19 },
  detailGroupTitle: { color: C.white, fontSize: 12, lineHeight: 17, fontWeight: '800', marginBottom: 10 },
  inclusionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderSoft },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.orangeSoft, borderWidth: 1, borderColor: C.orangeBorder },
  inclusionTitle: { color: '#E4E4E7', fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  inclusionDetail: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  inclusionSavings: { color: C.orangeLight, fontSize: 9.5, lineHeight: 13, fontWeight: '700', marginTop: 2 },
  coverageWrap: { marginTop: 11, padding: 11, borderRadius: 13, backgroundColor: C.surface },
  coverageLabel: { color: C.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  coverageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  coveragePill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.055)' },
  coverageText: { color: C.secondary, fontSize: 9.5, fontWeight: '600' },
  notesBlock: { marginTop: 19, paddingBottom: 8 },
  notesText: { color: C.secondary, fontSize: 11, lineHeight: 17 },
  dialogOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.80)' },
  dialog: { width: '100%', maxWidth: 390, padding: 20, borderRadius: 21, backgroundColor: '#111114', borderWidth: 1, borderColor: C.border },
  unavailableDialog: { maxHeight: '78%' },
  dialogIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.orangeSoft, marginBottom: 13 },
  dialogEyebrow: { color: C.orange, fontSize: 8.5, lineHeight: 12, fontWeight: '800', letterSpacing: 1.1 },
  dialogTitle: { color: C.white, fontSize: 18, lineHeight: 24, fontWeight: '800', marginTop: 4 },
  dialogPackage: { color: C.secondary, fontSize: 12, lineHeight: 17, marginTop: 14 },
  dialogPrice: { color: C.white, fontSize: 29, lineHeight: 35, fontWeight: '800', marginTop: 2 },
  dialogBody: { color: C.secondary, fontSize: 11.5, lineHeight: 17, marginTop: 5 },
  dialogActions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  dialogSecondary: { flex: 0.8, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border },
  dialogSecondaryText: { color: C.secondary, fontSize: 11.5, fontWeight: '700' },
  dialogPrimary: { flex: 1.4, minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.orange },
  dialogPrimaryText: { color: C.onOrange, fontSize: 11.5, fontWeight: '800' },
  alternativeScroll: { marginTop: 14 },
  alternativeList: { gap: 8 },
  alternativeRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 13, backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.border },
  alternativeName: { color: C.white, fontSize: 11.5, lineHeight: 16, fontWeight: '700' },
  alternativeMeta: { color: C.orangeLight, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 2 },
  unavailableClose: { minHeight: 43, alignItems: 'center', justifyContent: 'center', marginTop: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border },
});
