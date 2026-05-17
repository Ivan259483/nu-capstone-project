/**
 * AddVehicleModal
 *
 * Picker logic uses an absolutely-positioned bottom sheet *inside* the same
 * Modal — React Native on iOS does not support nested <Modal> components, so a
 * second Modal for dropdowns simply never renders.
 *
 * Field order, validation, and brand/model database mirror web
 * `VehicleGarageForm` + `validateVehicleGarageForm` (customer dashboard).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Toast } from '@/components/ui/PremiumToast';
import {
  FUEL_TYPE_OPTIONS,
  TRANSMISSION_OPTIONS,
  VEHICLE_BODY_TYPES,
  VEHICLE_COLOR_SWATCHES,
  VEHICLE_YEAR_OPTIONS,
} from '@/constants/vehicleForm';
import type { Vehicle } from '@/services/api/types';
import { getApiErrorMessage } from '@/services/api/client';
import { vehicleService } from '@/services/api/vehicleService';
import { SPF_BASE_PRICES, formatPesoOrNA } from '@/constants/spfPricing';
import {
  emptyVehicleGarageForm,
  validateVehicleGarageForm,
  type VehicleGarageFormValues,
} from '@/lib/vehicleGarageForm';
import { normalizePlateNumber } from '@/lib/plate';
import { vehicleBrands, getModelsForBrand, getVehicleTypeForModel } from '@/data/vehicleData';

// ── SPF package data (mirrors CustomerDashboard.tsx) ──────────────────────────
const SPF_PACKAGES = [
  { id: 'spf80',  name: 'SPF 80',  label: 'Essential', prices: SPF_BASE_PRICES.spf80 },
  { id: 'spf89',  name: 'SPF 89',  label: 'Advanced',  prices: SPF_BASE_PRICES.spf89 },
  { id: 'spf99',  name: 'SPF 99',  label: 'Premium',   prices: SPF_BASE_PRICES.spf99 },
  { id: 'spf101', name: 'SPF 101', label: 'Flagship',  prices: SPF_BASE_PRICES.spf101 },
] as const;

const VEHICLE_TYPE_PRICE_MAP: Record<string, string> = {
  hatchback: 'hatchback', sedan: 'sedan', midsized: 'midsized',
  suv: 'suv', 'pick up': 'pickup', pickup: 'pickup',
  'large suv / van': 'largesuv', 'large suv': 'largesuv', van: 'largesuv',
  'highend sedan': 'highend', highend: 'highend', 'high-end sedan': 'highend',
};

const getPriceKey = (type: string): keyof (typeof SPF_PACKAGES)[0]['prices'] =>
  (VEHICLE_TYPE_PRICE_MAP[type.toLowerCase()] as keyof (typeof SPF_PACKAGES)[0]['prices']) || 'hatchback';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG        = '#040405';
const SURFACE   = '#0D0D12';
const SURFACE2  = '#13131A';
const BORDER    = 'rgba(255,255,255,0.11)';
const MUTED     = '#64748b';
const DIM       = '#94a3b8';
const TEXT      = '#f8fafc';
const AMBER     = '#FFB77D';
const GREEN     = '#34d399';
const GREEN_BG  = 'rgba(16,185,129,0.10)';
const GREEN_BD  = 'rgba(16,185,129,0.30)';
const ERR_CLR   = '#f87171';
const ERR_BG    = 'rgba(239,68,68,0.07)';
const ERR_BD    = 'rgba(239,68,68,0.22)';

const COLOR_HEX: Record<string, string> = {
  White: '#e2e8f0', Black: '#1e293b', Silver: '#94a3b8', Gray: '#64748b',
  Blue: '#3b82f6', Red: '#ef4444', Green: '#22c55e', Yellow: '#eab308',
  Orange: '#f97316', Brown: '#78350f',
};

// ── Shared field label ────────────────────────────────────────────────────────
function FieldLabel({
  children, required, optional,
}: { children: string; required?: boolean; optional?: boolean }) {
  return (
    <Text style={lbl.text}>
      {children}
      {required ? <Text style={lbl.star}> *</Text> : null}
      {optional ? <Text style={lbl.opt}> (optional)</Text> : null}
    </Text>
  );
}
const lbl = StyleSheet.create({
  text: { fontSize: 11, fontWeight: '600', color: DIM, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  star: { color: ERR_CLR, textTransform: 'none' },
  opt:  { fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: MUTED, fontSize: 10 },
});

// ── Dark text input ───────────────────────────────────────────────────────────
function DarkField({
  label, required, optional, placeholder, value, onChangeText,
  autoCapitalize, keyboardType, error, hint, maxLength, wrapStyle,
}: {
  label: string; required?: boolean; optional?: boolean;
  placeholder: string; value: string;
  onChangeText: (t: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'number-pad' | 'numeric';
  error?: string; hint?: { text: string; tone: 'ok' | 'warn' };
  maxLength?: number;
  wrapStyle?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const bc = error ? ERR_BD : focused ? 'rgba(255,183,125,0.45)' : BORDER;
  const bg = error ? ERR_BG : focused ? 'rgba(255,183,125,0.04)' : SURFACE;
  return (
    <View style={[df.wrap, wrapStyle]}>
      <FieldLabel required={required} optional={optional}>{label}</FieldLabel>
      <View style={[df.box, { borderColor: bc, backgroundColor: bg }]}>
        <TextInput
          style={df.input}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          keyboardType={keyboardType}
          maxLength={maxLength}
          selectionColor={AMBER}
          autoCorrect={false}
        />
      </View>
      {error
        ? <Text style={df.err}>{error}</Text>
        : hint
        ? <Text style={hint.tone === 'ok' ? df.hintOk : df.hintWarn}>{hint.text}</Text>
        : null}
    </View>
  );
}
const df = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  box:  {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: 44, justifyContent: 'center',
  },
  input:    { fontSize: 14, color: TEXT, padding: 0 },
  err:      { marginTop: 4, fontSize: 11, color: ERR_CLR },
  hintOk:   { marginTop: 4, fontSize: 11, color: GREEN },
  hintWarn: { marginTop: 4, fontSize: 11, color: '#fbbf24' },
});

// ── Select trigger (read-only dropdown look) ──────────────────────────────────
function SelectField({
  label, required, optional, value, placeholder, error, onPress, disabled,
}: {
  label: string; required?: boolean; optional?: boolean;
  value: string; placeholder: string; error?: string;
  onPress: () => void; disabled?: boolean;
}) {
  const bc = error ? ERR_BD : BORDER;
  const bg = error ? ERR_BG : SURFACE;
  return (
    <Pressable
      style={[sf.wrap, disabled && { opacity: 0.55 }]}
      onPress={disabled ? undefined : onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
    >
      <FieldLabel required={required} optional={optional}>{label}</FieldLabel>
      <View style={[sf.box, { borderColor: bc, backgroundColor: bg }]}>
        <Text style={[sf.val, !value && sf.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={15} color={MUTED} />
      </View>
      {error ? <Text style={sf.err}>{error}</Text> : null}
    </Pressable>
  );
}
const sf = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  box: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: 44,
  },
  val:         { flex: 1, fontSize: 14, color: TEXT, marginRight: 6 },
  placeholder: { color: MUTED },
  err:         { marginTop: 4, fontSize: 11, color: ERR_CLR },
});

// ── Types ─────────────────────────────────────────────────────────────────────
export type AddVehicleModalProps = {
  visible: boolean;
  onClose: () => void;
  onVehicleAdded: (vehicle: Vehicle) => void;
};

type PickerKind = 'type' | 'brand' | 'model' | 'year' | 'transmission' | 'fuel' | null;

// ── Component ─────────────────────────────────────────────────────────────────
export default function AddVehicleModal({ visible, onClose, onVehicleAdded }: AddVehicleModalProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [form, setForm] = useState<VehicleGarageFormValues>(() => emptyVehicleGarageForm());
  const [customBrandMode, setCustomBrandMode] = useState(false);
  const [customModelMode, setCustomModelMode] = useState(false);
  const [colorOther, setColorOther] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  const [picker, setPicker] = useState<PickerKind>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerAnim = useRef(new Animated.Value(0)).current;

  const [errPlate, setErrPlate] = useState('');
  const [errType, setErrType] = useState('');
  const [errBrand, setErrBrand] = useState('');
  const [errModel, setErrModel] = useState('');

  const knownBrandModels = useMemo(
    () => (!customBrandMode && form.brand ? getModelsForBrand(form.brand) : []),
    [customBrandMode, form.brand]
  );
  const showCustomModelInput = customBrandMode || customModelMode;

  // Unknown brand → custom brand entry (matches web VehicleGarageForm)
  useEffect(() => {
    if (!form.brand) return;
    if (!vehicleBrands.includes(form.brand)) setCustomBrandMode(true);
  }, [form.brand]);

  // Model not in catalog for selected brand → free-text model (matches web)
  useEffect(() => {
    if (customBrandMode || !form.brand || !form.model) return;
    const models = getModelsForBrand(form.brand);
    if (models.length > 0 && !models.includes(form.model)) setCustomModelMode(true);
  }, [customBrandMode, form.brand, form.model]);

  // Auto-fill vehicle type from model when mapped (matches web)
  useEffect(() => {
    if (customModelMode || !form.model || form.type) return;
    const inferredType = getVehicleTypeForModel(form.model);
    if (inferredType) {
      setForm((prev) => ({ ...prev, type: inferredType }));
      setErrType('');
    }
  }, [customModelMode, form.model, form.type]);

  const openPicker = useCallback((kind: PickerKind) => {
    setPickerSearch('');
    setPicker(kind);
    Animated.spring(pickerAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 10 }).start();
    Haptics.selectionAsync();
  }, [pickerAnim]);

  const closePicker = useCallback(() => {
    Animated.timing(pickerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      setPicker(null);
      setPickerSearch('');
    });
  }, [pickerAnim]);

  const pickerTranslateY = pickerAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });

  const pickerOptions = useMemo<string[]>(() => {
    switch (picker) {
      case 'type':         return [...VEHICLE_BODY_TYPES];
      case 'brand':        return [...vehicleBrands];
      case 'model':        return knownBrandModels.length ? [...knownBrandModels] : [];
      case 'year':         return [...VEHICLE_YEAR_OPTIONS];
      case 'transmission': return [...TRANSMISSION_OPTIONS];
      case 'fuel':         return [...FUEL_TYPE_OPTIONS];
      default: return [];
    }
  }, [picker, knownBrandModels]);

  const filteredPickerOptions = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q || (picker !== 'brand' && picker !== 'model')) return pickerOptions;
    return pickerOptions.filter((o) => o.toLowerCase().includes(q));
  }, [picker, pickerOptions, pickerSearch]);

  const pickerTitle = useMemo(() => {
    switch (picker) {
      case 'type':         return 'Vehicle type';
      case 'brand':        return 'Brand';
      case 'model':        return 'Model';
      case 'year':         return 'Year';
      case 'transmission': return 'Transmission';
      case 'fuel':         return 'Fuel type';
      default: return '';
    }
  }, [picker]);

  const currentPickerValue = useMemo(() => {
    switch (picker) {
      case 'type':         return form.type;
      case 'brand':        return form.brand;
      case 'model':        return form.model;
      case 'year':         return form.year;
      case 'transmission': return form.transmission;
      case 'fuel':         return form.fuelType;
      default: return '';
    }
  }, [picker, form]);

  const applyPick = useCallback((v: string) => {
    switch (picker) {
      case 'type':
        setForm((prev) => ({ ...prev, type: v }));
        setErrType('');
        break;
      case 'brand':
        setErrBrand('');
        setErrModel('');
        if (v === 'Other') {
          setCustomBrandMode(true);
          setCustomModelMode(false);
          setForm((prev) => ({ ...prev, brand: '', model: '', type: '' }));
        } else {
          setCustomBrandMode(false);
          setCustomModelMode(false);
          setForm((prev) => ({ ...prev, brand: v, model: '', type: '' }));
        }
        break;
      case 'model':
        setErrModel('');
        if (v === 'Other') {
          setCustomModelMode(true);
          setForm((prev) => ({ ...prev, model: '' }));
        } else {
          setCustomModelMode(false);
          const inferred = getVehicleTypeForModel(v);
          setForm((prev) => ({
            ...prev,
            model: v,
            ...(inferred ? { type: inferred } : {}),
          }));
          if (inferred) setErrType('');
        }
        break;
      case 'year':
        setForm((prev) => ({ ...prev, year: v }));
        break;
      case 'transmission':
        setForm((prev) => ({ ...prev, transmission: v }));
        break;
      case 'fuel':
        setForm((prev) => ({ ...prev, fuelType: v }));
        break;
      default:
        break;
    }
    closePicker();
    Haptics.selectionAsync();
  }, [picker, closePicker]);

  const plateHint = useMemo<{ text: string; tone: 'ok' | 'warn' } | undefined>(() => {
    const raw = form.plate.trim();
    if (!raw) return undefined;
    const pn = normalizePlateNumber(raw);
    return pn.length >= 4 && pn.length <= 9
      ? { text: '✓ Valid plate format', tone: 'ok' }
      : { text: '4–9 letters/numbers (spaces ignored)', tone: 'warn' };
  }, [form.plate]);

  const reset = useCallback(() => {
    setForm(emptyVehicleGarageForm());
    setCustomBrandMode(false);
    setCustomModelMode(false);
    setColorOther(false);
    setSaving(false);
    setApiError('');
    setErrPlate('');
    setErrType('');
    setErrBrand('');
    setErrModel('');
    setPicker(null);
    setPickerSearch('');
    pickerAnim.setValue(0);
  }, [pickerAnim]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (picker) {
      closePicker();
      return;
    }
    setApiError('');
    const errors = validateVehicleGarageForm(form);
    setErrPlate(errors.plate || '');
    setErrBrand(errors.brand || '');
    setErrModel(errors.model || '');
    setErrType(errors.type || '');

    if (Object.keys(errors).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    const plateNorm = normalizePlateNumber(form.plate.trim());
    const brandTrim = form.brand.trim();
    const modelTrim = form.model.trim();

    setSaving(true);
    try {
      const { vehicle: newV, alreadyOwned } = await vehicleService.addVehicle({
        plateNumber: plateNorm,
        year: form.year || '',
        make: brandTrim,
        model: modelTrim,
        color: form.color.trim() || 'Unknown',
        vehicleType: form.type,
        transmission: form.transmission || undefined,
        fuelType: form.fuelType || undefined,
      });

      Toast.show(alreadyOwned ? 'Already in your list — selected!' : 'Vehicle added!', 'success');
      reset();
      onVehicleAdded(newV);
    } catch (e: unknown) {
      const msg = getApiErrorMessage(e, 'Failed to add vehicle. Please try again.');
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;

      if (code === 'PLATE_TAKEN' || msg.toLowerCase().includes('another account')) {
        setErrPlate('Plate already registered to another account');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setApiError(msg);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    } finally {
      setSaving(false);
    }
  };

  const hasPreview = Boolean(form.brand || form.model || form.plate.trim());
  const previewBg = form.color && !colorOther ? (COLOR_HEX[form.color] ?? '#334155') : '#334155';
  const isLightBg = ['White', 'Silver', 'Yellow'].includes(form.color) && !colorOther;
  const previewFg = isLightBg ? '#0f172a' : '#f8fafc';
  const previewName = [form.year, form.brand, form.model].filter(Boolean).join(' ') || 'Your Vehicle';

  const modelSelectDisabled =
    !form.brand || (!customBrandMode && knownBrandModels.length === 0);

  const modelPlaceholder = !form.brand
    ? 'Select brand first'
    : knownBrandModels.length === 0
      ? 'Select model'
      : 'Select model';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={picker ? closePicker : handleClose}
    >
      <View style={[s.root, { paddingTop: Math.max(insets.top, 14) }]}>

        <KeyboardAvoidingView
          style={s.kavWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.header}>
            <Text style={s.headerTitle}>Add Vehicle</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close-circle-outline" size={26} color={DIM} />
            </TouchableOpacity>
          </View>
          <View style={s.divider} />

          <ScrollView
            ref={scrollRef}
            style={s.scroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={!picker}
          >
            {apiError ? (
              <View style={s.apiBanner}>
                <Ionicons name="warning-outline" size={15} color={ERR_CLR} />
                <Text style={s.apiText}>{apiError}</Text>
              </View>
            ) : null}

            {hasPreview ? (
              <View style={[s.previewCard, { backgroundColor: previewBg }]}>
                <Ionicons name="car-sport" size={34} color={previewFg} style={{ opacity: 0.85 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.previewName, { color: previewFg }]} numberOfLines={1}>{previewName}</Text>
                  <View style={s.previewBadgeRow}>
                    {form.plate.trim() ? (
                      <View style={s.previewBadge}>
                        <Text style={[s.previewBadgeText, { color: previewFg }]}>
                          {normalizePlateNumber(form.plate)}
                        </Text>
                      </View>
                    ) : null}
                    {form.type ? (
                      <Text style={[s.previewType, { color: previewFg }]}>{form.type}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}

            <Text style={s.sectionMeta}>Required</Text>

            <View style={s.rowGap}>
              <DarkField
                label="Plate Number"
                required
                placeholder="e.g. ABC-1234"
                value={form.plate}
                autoCapitalize="characters"
                wrapStyle={{ flex: 0, alignSelf: 'stretch', width: '100%' }}
                onChangeText={(t) => {
                  setForm((prev) => ({ ...prev, plate: t.toUpperCase() }));
                  setErrPlate('');
                }}
                error={errPlate}
                hint={!errPlate ? plateHint : undefined}
                maxLength={12}
              />
            </View>

            <View style={[s.row, s.rowGap]}>
              {!customBrandMode ? (
                <SelectField
                  label="Brand"
                  required
                  value={form.brand}
                  placeholder="Select brand"
                  error={errBrand}
                  onPress={() => openPicker('brand')}
                />
              ) : (
                <DarkField
                  label="Brand"
                  required
                  placeholder="Enter brand name"
                  value={form.brand}
                  onChangeText={(t) => {
                    setForm((prev) => ({ ...prev, brand: t, model: '' }));
                    setErrBrand('');
                    setErrModel('');
                  }}
                  error={errBrand}
                />
              )}
              {showCustomModelInput ? (
                <DarkField
                  label="Model"
                  required
                  placeholder={customBrandMode ? 'e.g. Vios, Civic, Ranger' : 'Enter model name'}
                  value={form.model}
                  onChangeText={(t) => {
                    setForm((prev) => ({ ...prev, model: t }));
                    setErrModel('');
                  }}
                  error={errModel}
                />
              ) : (
                <SelectField
                  label="Model"
                  required
                  value={form.model}
                  placeholder={modelPlaceholder}
                  error={errModel}
                  disabled={modelSelectDisabled}
                  onPress={() => {
                    if (modelSelectDisabled) return;
                    openPicker('model');
                  }}
                />
              )}
            </View>

            <View style={[s.row, s.rowGap]}>
              <SelectField
                label="Year"
                optional
                value={form.year}
                placeholder="Year"
                onPress={() => openPicker('year')}
              />
              <SelectField
                label="Type"
                required
                value={form.type}
                placeholder="Select…"
                error={errType}
                onPress={() => openPicker('type')}
              />
            </View>

            {form.type ? (() => {
              const key = getPriceKey(form.type);
              return (
                <View style={pp.panel}>
                  <View style={pp.headRow}>
                    <Ionicons name="lock-closed" size={11} color="#f59e0b" />
                    <Text style={pp.headText}>{form.type} Pricing — Locked to this vehicle</Text>
                  </View>
                  <View style={pp.grid}>
                    {SPF_PACKAGES.map((pkg) => (
                      <View key={pkg.id} style={pp.card}>
                        <Text style={pp.pkgName}>{pkg.name}</Text>
                        <Text style={pp.pkgLabel}>{pkg.label}</Text>
                        <Text style={pp.pkgPrice}>
                          {formatPesoOrNA(pkg.prices[key])}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={pp.footer}>These prices will apply when you book for this vehicle</Text>
                </View>
              );
            })() : null}

            <View style={s.rowGap}>
              <Text style={lbl.text}>
                COLOR <Text style={lbl.opt}>(optional)</Text>
              </Text>
              <View style={s.swatches}>
                {VEHICLE_COLOR_SWATCHES.map((c) => {
                  const sel = form.color === c.name && !colorOther;
                  return (
                    <TouchableOpacity
                      key={c.name}
                      accessibilityLabel={c.name}
                      onPress={() => {
                        setColorOther(false);
                        setForm((prev) => ({ ...prev, color: c.name }));
                        Haptics.selectionAsync();
                      }}
                      style={[s.swatch, { backgroundColor: c.hex }, sel && s.swatchSel]}
                    />
                  );
                })}
                <TouchableOpacity
                  onPress={() => {
                    setColorOther(true);
                    setForm((prev) => ({ ...prev, color: '' }));
                    Haptics.selectionAsync();
                  }}
                  style={[s.otherPill, colorOther && s.otherPillSel]}
                >
                  <Text style={[s.otherPillText, colorOther && { color: TEXT }]}>Other</Text>
                </TouchableOpacity>
              </View>
              {colorOther ? (
                <TextInput
                  style={s.otherInput}
                  placeholder="e.g. Champagne Gold"
                  placeholderTextColor={MUTED}
                  value={form.color}
                  onChangeText={(t) => setForm((prev) => ({ ...prev, color: t }))}
                  autoCapitalize="words"
                  autoFocus
                  selectionColor={AMBER}
                />
              ) : form.color ? (
                <Text style={s.colorHint}>
                  Selected: <Text style={{ color: TEXT, fontWeight: '600' }}>{form.color}</Text>
                </Text>
              ) : null}
            </View>

            <View style={[s.row, s.rowGap]}>
              <SelectField
                label="Transmission"
                optional
                value={form.transmission}
                placeholder="Select…"
                onPress={() => openPicker('transmission')}
              />
              <SelectField
                label="Fuel Type"
                optional
                value={form.fuelType}
                placeholder="Select…"
                onPress={() => openPicker('fuel')}
              />
            </View>

            <View style={s.hintBox}>
              <Ionicons name="calendar-outline" size={14} color={GREEN} />
              <Text style={s.hintText}>
                After you save, open <Text style={{ fontWeight: '700' }}>Book</Text> on your vehicle card to schedule a service with these details pre-filled.
              </Text>
            </View>

            <View style={s.actions}>
              <TouchableOpacity style={s.btnCancel} onPress={handleClose} activeOpacity={0.8}>
                <Text style={s.btnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnPrimary, saving && { opacity: 0.6 }]}
                onPress={submit}
                disabled={saving}
                activeOpacity={0.88}
              >
                {saving
                  ? <ActivityIndicator color="#fafafa" size="small" />
                  : <Text style={s.btnPrimaryText}>Add Vehicle</Text>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {picker !== null ? (
          <>
            <TouchableWithoutFeedback onPress={closePicker}>
              <View style={s.pickerScrim} />
            </TouchableWithoutFeedback>

            <Animated.View style={[s.pickerSheet, { transform: [{ translateY: pickerTranslateY }] }]}>
              <View style={s.handle} />

              <View style={s.pickerHead}>
                <Text style={s.pickerTitle}>{pickerTitle}</Text>
                <TouchableOpacity onPress={closePicker}>
                  <Text style={s.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>

              {(picker === 'brand' || picker === 'model') ? (
                <View style={s.pickerSearchWrap}>
                  <Ionicons name="search" size={18} color={MUTED} />
                  <TextInput
                    style={s.pickerSearchInput}
                    placeholder={picker === 'brand' ? 'Search brand…' : 'Search model…'}
                    placeholderTextColor={MUTED}
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>
              ) : null}

              <ScrollView
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
              >
                {filteredPickerOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={s.pickerRow}
                    onPress={() => applyPick(opt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.pickerRowText, opt === currentPickerValue && s.pickerRowTextSel]}>
                      {opt}
                    </Text>
                    {opt === currentPickerValue ? (
                      <Ionicons name="checkmark" size={16} color={AMBER} />
                    ) : null}
                  </TouchableOpacity>
                ))}
                <View style={{ height: 24 }} />
              </ScrollView>
            </Animated.View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, paddingHorizontal: 20 },
  kavWrapper: { flex: 1 },
  scroll: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  divider: { height: 1, backgroundColor: BORDER, marginBottom: 16 },

  sectionMeta: {
    fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 8,
  },

  apiBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 10, borderRadius: 10,
    backgroundColor: ERR_BG, borderWidth: 1, borderColor: ERR_BD,
    marginBottom: 14,
  },
  apiText: { flex: 1, fontSize: 12, color: '#fca5a5', lineHeight: 17, fontWeight: '500' },

  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 12, padding: 14, marginBottom: 16, overflow: 'hidden',
  },
  previewName: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  previewBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  previewBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.18)' },
  previewBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  previewType: { fontSize: 11, fontWeight: '500', opacity: 0.75 },

  row:    { flexDirection: 'row', gap: 12 },
  rowGap: { marginTop: 14 },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 4 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' },
  swatchSel: { borderWidth: 3, borderColor: TEXT, shadowColor: '#fff', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  otherPill: {
    height: 32, paddingHorizontal: 13, borderRadius: 16,
    borderWidth: 1.5, borderColor: BORDER,
    justifyContent: 'center', backgroundColor: SURFACE,
  },
  otherPillSel: { borderColor: TEXT, backgroundColor: SURFACE2 },
  otherPillText: { fontSize: 12, fontWeight: '600', color: DIM },
  otherInput: {
    marginTop: 10, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14, color: TEXT, backgroundColor: SURFACE,
  },
  colorHint: { marginTop: 8, fontSize: 11, color: MUTED },

  hintBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 11, borderRadius: 10,
    backgroundColor: GREEN_BG, borderWidth: 1, borderColor: GREEN_BD,
    marginTop: 16, marginBottom: 20,
  },
  hintText: { flex: 1, fontSize: 12, color: GREEN, fontWeight: '500', lineHeight: 17 },

  actions: { flexDirection: 'row', gap: 10 },
  btnCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  btnCancelText: { fontSize: 14, fontWeight: '600', color: DIM },
  btnPrimary: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: TEXT },

  pickerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pickerSheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: '#111118',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderBottomWidth: 0, borderColor: BORDER,
  },
  handle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 10, marginBottom: 2,
  },
  pickerHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  pickerDone:  { fontSize: 15, fontWeight: '600', color: '#38bdf8' },
  pickerSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8, marginTop: 4,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE,
  },
  pickerSearchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 15, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  pickerRowText:    { fontSize: 16, color: '#e2e8f0' },
  pickerRowTextSel: { color: AMBER, fontWeight: '600' },
});

const pp = StyleSheet.create({
  panel: {
    marginTop: 10, borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)',
    padding: 12,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  headText: { fontSize: 10, fontWeight: '800', color: '#f59e0b', letterSpacing: 0.5, textTransform: 'uppercase', flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  card: {
    width: '47.5%', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8, padding: 10,
  },
  pkgName:  { fontSize: 12, fontWeight: '800', color: '#f8fafc', marginBottom: 1 },
  pkgLabel: { fontSize: 10, color: '#64748b', fontWeight: '600', marginBottom: 4 },
  pkgPrice: { fontSize: 16, fontWeight: '900', color: '#ffffff', letterSpacing: -0.3 },
  footer:   { fontSize: 10, color: '#475569', marginTop: 10, textAlign: 'center' },
});
