import React, { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  REGISTER_COUNTRY_DIALS,
  REGISTER_PHONE_PRIORITY_ISO,
  type RegisterCountryDial,
} from '@/lib/countries-dial-data';

type Props = {
  countryIso: string;
  onCountryIsoChange: (iso: string) => void;
};

function orderedCountries(): { priority: RegisterCountryDial[]; rest: RegisterCountryDial[] } {
  const byIso = new Map(REGISTER_COUNTRY_DIALS.map((country) => [country.iso, country]));
  const priority = REGISTER_PHONE_PRIORITY_ISO.map((iso) => byIso.get(iso)).filter(
    (country): country is RegisterCountryDial => Boolean(country)
  );
  const prioritySet = new Set(REGISTER_PHONE_PRIORITY_ISO as readonly string[]);
  const rest = REGISTER_COUNTRY_DIALS.filter((country) => !prioritySet.has(country.iso));
  return { priority, rest };
}

export default function RegisterCountryCodePicker({ countryIso, onCountryIsoChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { priority, rest } = useMemo(() => orderedCountries(), []);

  const selected =
    REGISTER_COUNTRY_DIALS.find((country) => country.iso === countryIso) ?? REGISTER_COUNTRY_DIALS[0];
  const query = search.trim().toLowerCase();

  const filteredPriority = useMemo(() => {
    if (!query) return priority;
    return priority.filter(
      (country) =>
        country.name.toLowerCase().includes(query) ||
        country.iso.toLowerCase().includes(query) ||
        country.dial.includes(query)
    );
  }, [priority, query]);

  const filteredRest = useMemo(() => {
    if (!query) return rest;
    return rest.filter(
      (country) =>
        country.name.toLowerCase().includes(query) ||
        country.iso.toLowerCase().includes(query) ||
        country.dial.includes(query)
    );
  }, [rest, query]);

  const listData = useMemo(() => {
    const items: { type: 'header' | 'row'; country?: RegisterCountryDial; key: string }[] = [];
    if (filteredPriority.length) {
      items.push({ type: 'header', key: 'h-priority' });
      filteredPriority.forEach((country) =>
        items.push({ type: 'row', country, key: country.iso })
      );
    }
    if (filteredRest.length) {
      items.push({ type: 'header', key: 'h-rest' });
      filteredRest.forEach((country) =>
        items.push({ type: 'row', country, key: `r-${country.iso}` })
      );
    }
    return items;
  }, [filteredPriority, filteredRest]);

  const closePicker = () => {
    setPickerOpen(false);
    setSearch('');
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => {
          setSearch('');
          setPickerOpen(true);
        }}
        accessibilityLabel="Country code"
      >
        <Text pointerEvents="none" style={styles.triggerText}>
          +{selected.dial}
        </Text>
        <Ionicons
          pointerEvents="none"
          name="chevron-down"
          size={14}
          color="rgba(255,255,255,0.50)"
        />
      </TouchableOpacity>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={closePicker}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalRoot}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closePicker}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Country</Text>
              <TouchableOpacity onPress={closePicker} hitSlop={12}>
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

                const country = item.country!;
                const isSelected = country.iso === countryIso;
                return (
                  <TouchableOpacity
                    style={[styles.countryRow, isSelected && styles.countryRowSelected]}
                    onPress={() => {
                      onCountryIsoChange(country.iso);
                      closePicker();
                    }}
                  >
                    <Text style={styles.countryName} numberOfLines={1}>
                      {country.name}
                    </Text>
                    <Text style={styles.countryDial}>+{country.dial}</Text>
                    {isSelected ? <Ionicons name="checkmark" size={18} color="#F97316" /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.empty}>No country found.</Text>}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    alignSelf: 'stretch',
    gap: 5,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.10)',
  },
  triggerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
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
  modalTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  modalDone: { color: '#F97316', fontSize: 16, fontWeight: '700' },
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
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  countryRowSelected: { backgroundColor: 'rgba(255,255,255,0.08)' },
  countryName: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  countryDial: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  empty: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 24 },
});
