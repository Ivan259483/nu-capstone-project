import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  REGISTER_COUNTRY_DIALS,
  REGISTER_PHONE_PRIORITY_ISO,
  type RegisterCountryDial,
} from '@/lib/countries-dial-data';
import { iso2ToFlagEmoji } from '@/lib/phoneRegister';

function orderedCountries(): { priority: RegisterCountryDial[]; rest: RegisterCountryDial[] } {
  const byIso = new Map(REGISTER_COUNTRY_DIALS.map((c) => [c.iso, c]));
  const priority = REGISTER_PHONE_PRIORITY_ISO.map((iso) => byIso.get(iso)).filter(
    (c): c is RegisterCountryDial => Boolean(c)
  );
  const prioritySet = new Set(REGISTER_PHONE_PRIORITY_ISO as readonly string[]);
  const rest = REGISTER_COUNTRY_DIALS.filter((c) => !prioritySet.has(c.iso));
  return { priority, rest };
}

type Props = {
  label?: string;
  countryIso: string;
  onCountryIsoChange: (iso: string) => void;
  nationalDigits: string;
  onNationalDigitsChange: (value: string) => void;
  hasError?: boolean;
  error?: string;
};

export function RegisterPhoneField({
  label = 'PHONE NUMBER *',
  countryIso,
  onCountryIsoChange,
  nationalDigits,
  onNationalDigitsChange,
  hasError,
  error,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { priority, rest } = useMemo(() => orderedCountries(), []);

  const selected = REGISTER_COUNTRY_DIALS.find((c) => c.iso === countryIso) ?? REGISTER_COUNTRY_DIALS[0];
  const isPh = selected.dial === '63';
  const placeholder = isPh ? '9XXXXXXXXX' : 'Phone number';

  const onNationalChange = useCallback(
    (raw: string) => {
      let digits = raw.replace(/\D/g, '');
      if (isPh) {
        if (digits.startsWith('0')) digits = digits.slice(1);
        digits = digits.slice(0, 10);
      } else {
        digits = digits.slice(0, 15);
      }
      onNationalDigitsChange(digits);
    },
    [isPh, onNationalDigitsChange]
  );

  const q = search.trim().toLowerCase();
  const filteredPriority = useMemo(() => {
    if (!q) return priority;
    return priority.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        c.dial.includes(q)
    );
  }, [priority, q]);

  const filteredRest = useMemo(() => {
    if (!q) return rest;
    return rest.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        c.dial.includes(q)
    );
  }, [rest, q]);

  const listData = useMemo(() => {
    const items: { type: 'header' | 'row'; country?: RegisterCountryDial; key: string }[] = [];
    if (filteredPriority.length) {
      items.push({ type: 'header', key: 'h-priority' });
      filteredPriority.forEach((c) => items.push({ type: 'row', country: c, key: c.iso }));
    }
    if (filteredRest.length) {
      items.push({ type: 'header', key: 'h-rest' });
      filteredRest.forEach((c) => items.push({ type: 'row', country: c, key: `r-${c.iso}` }));
    }
    return items;
  }, [filteredPriority, filteredRest]);

  const borderColor = hasError || error ? 'rgba(239,68,68,0.7)' : 'rgba(255,255,255,0.08)';
  const bg = hasError || error ? 'rgba(239,68,68,0.06)' : '#111111';

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, { borderColor, backgroundColor: bg }]}>
        <TouchableOpacity
          style={styles.dialBtn}
          onPress={() => {
            setSearch('');
            setPickerOpen(true);
          }}
          accessibilityLabel="Country code"
        >
          <Text style={styles.flag}>{iso2ToFlagEmoji(selected.iso)}</Text>
          <Text style={styles.dialText}>+{selected.dial}</Text>
          <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.55)" />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TextInput
          style={styles.nationalInput}
          value={nationalDigits}
          onChangeText={onNationalChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.28)"
          keyboardType="phone-pad"
          autoComplete="tel-national"
          textContentType="telephoneNumber"
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Country</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Text style={styles.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="Search country..."
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              data={listData}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                if (item.type === 'header') {
                  return (
                    <Text style={styles.sectionLabel}>
                      {item.key === 'h-priority' ? 'Common' : 'All countries'}
                    </Text>
                  );
                }
                const c = item.country!;
                const sel = c.iso === countryIso;
                return (
                  <TouchableOpacity
                    style={[styles.countryRow, sel && styles.countryRowSelected]}
                    onPress={() => {
                      onCountryIsoChange(c.iso);
                      setPickerOpen(false);
                      setSearch('');
                    }}
                  >
                    <Text style={styles.countryFlag}>{iso2ToFlagEmoji(c.iso)}</Text>
                    <Text style={styles.countryName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.countryDial}>+{c.dial}</Text>
                    {sel ? <Ionicons name="checkmark" size={18} color="#F97316" /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>No country found.</Text>}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', marginBottom: 20 },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.40)',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 50,
    overflow: 'hidden',
  },
  dialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  flag: { fontSize: 18, lineHeight: 22 },
  dialText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.10)' },
  nationalInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    marginLeft: 4,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    maxHeight: '78%',
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  modalDone: { fontSize: 16, fontWeight: '700', color: '#F97316' },
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  countryRowSelected: { backgroundColor: 'rgba(255,255,255,0.08)' },
  countryFlag: { fontSize: 20, width: 32 },
  countryName: { flex: 1, fontSize: 15, color: '#FFFFFF', fontWeight: '500' },
  countryDial: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontVariant: ['tabular-nums'] },
  empty: { textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: 24 },
});
