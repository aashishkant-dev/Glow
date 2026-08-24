/**
 * Self-contained "what you charge" editor — services list with inline price
 * editing, add-a-service, and the open-to-negotiation toggle. Originally
 * lived inline in ProfileScreen's Business tab; moved here so the Portfolio
 * tab's Specialties section can host the real, functional editor directly
 * instead of a read-only summary that just linked back to Profile.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  apiGetProfile,
  apiGetProviderServices,
  apiSetProviderServices,
  apiUpdateProviderPricing,
  ProviderServiceItem,
} from '../api/client';
import { Colors, Fonts } from '../utils/colors';
import { getCurrencySymbol } from '../utils/format';

const BRAND = Colors.brandDark;
const R_WELL = 14;
const R_PILL = 999;

// Kept separate from any onboarding/catalog service list on purpose — the
// backend's PUT /services full-replace accepts any name, this is just the
// curated set offered in the "Add a service" picker.
const ADDABLE_SERVICE_OPTIONS = [
  'Makeup', 'Bridal Makeup', 'Party Makeup',
  'Threading', 'Lashes', 'Hair Styling', 'Hair Coloring',
  'Facial', 'Waxing', 'Nails',
  'Mehendi', 'Massage', 'Saree Draping',
];

function Divider() { return <View style={styles.divider} />; }

export function ProviderPricingEditor() {
  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [durationEdits, setDurationEdits] = useState<Record<string, string>>({});
  const [pricesSaving, setPricesSaving] = useState(false);
  const [priceNegotiable, setPriceNegotiable] = useState(false);
  const [negotiableSaving, setNegotiableSaving] = useState(false);

  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState<string | null>(null);
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('60');
  const [addingService, setAddingService] = useState(false);

  useEffect(() => {
    setServicesLoading(true);
    Promise.all([apiGetProviderServices(), apiGetProfile()])
      .then(([svcRes, profileRes]) => {
        setServices(svcRes.services);
        if (typeof profileRes.user.providerProfile?.priceNegotiable === 'boolean') {
          setPriceNegotiable(profileRes.user.providerProfile.priceNegotiable);
        }
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
  }, []);

  const hasPriceEdits = Object.keys(priceEdits).length > 0 || Object.keys(durationEdits).length > 0;

  function priceValueFor(s: ProviderServiceItem) {
    return priceEdits[s.id] ?? String(s.price);
  }
  function durationValueFor(s: ProviderServiceItem) {
    return durationEdits[s.id] ?? String(s.durationMin);
  }

  async function savePriceEdits() {
    setPricesSaving(true);
    try {
      const updated = services.map(s => ({
        name: s.name,
        price: priceEdits[s.id] !== undefined ? (Number(priceEdits[s.id]) || 0) : s.price,
        durationMin: durationEdits[s.id] !== undefined ? (Number(durationEdits[s.id]) || s.durationMin) : s.durationMin,
      }));
      const { services: saved } = await apiSetProviderServices(updated);
      setServices(saved.map((s, i) => ({ ...s, id: services[i]?.id ?? String(i) })));
      setPriceEdits({});
      setDurationEdits({});
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not save prices', e?.message || 'Please try again.');
    }
    setPricesSaving(false);
  }

  const availableNewServices = ADDABLE_SERVICE_OPTIONS.filter(
    name => !services.some(s => s.name.toLowerCase() === name.toLowerCase()),
  );

  async function addService() {
    if (!newServiceName) return;
    const price = Number(newServicePrice);
    if (!Number.isFinite(price) || price <= 0) {
      Alert.alert('Invalid price', 'Enter a valid price for this service.');
      return;
    }
    setAddingService(true);
    try {
      const updated = [
        ...services.map(s => ({ name: s.name, price: s.price, durationMin: s.durationMin })),
        { name: newServiceName, price, durationMin: Number(newServiceDuration) || 60 },
      ];
      const { services: saved } = await apiSetProviderServices(updated);
      setServices(saved.map((s, i) => ({ ...s, id: String(i) })));
      setAddServiceOpen(false);
      setNewServiceName(null);
      setNewServicePrice('');
      setNewServiceDuration('60');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not add service', e?.message || 'Please try again.');
    }
    setAddingService(false);
  }

  return (
    <>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={styles.sectionAccent} />
          <Text style={styles.headerTitle}>Specialties &amp; pricing</Text>
        </View>
        {hasPriceEdits && (
          <Pressable onPress={savePriceEdits} disabled={pricesSaving} style={styles.saveChangesBtn}>
            {pricesSaving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveChangesBtnText}>Save changes</Text>}
          </Pressable>
        )}
      </View>
      <View style={styles.card}>
        {servicesLoading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator color={BRAND} />
          </View>
        ) : services.length === 0 ? (
          <View style={styles.emptyNote}>
            <Text style={styles.emptyNoteText}>
              You haven't added any priced services yet. Tap "Add a service" below to add your first one.
            </Text>
          </View>
        ) : (
          services.map((s, i) => (
            <View key={s.id}>
              {i > 0 && <Divider />}
              <View style={styles.priceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.priceRowName} numberOfLines={1}>{s.name}</Text>
                  <View style={styles.durationRow}>
                    <Text style={styles.durationEditHint}>Time</Text>
                    <TextInput
                      style={styles.durationInput}
                      value={durationValueFor(s)}
                      onChangeText={v => setDurationEdits(prev => ({ ...prev, [s.id]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      placeholder="60"
                      placeholderTextColor={Colors.tertiaryLabel}
                    />
                    <Text style={styles.priceRowDuration}>min (optional)</Text>
                  </View>
                </View>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.priceInputDollar}>{getCurrencySymbol()}</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={priceValueFor(s)}
                    onChangeText={v => setPriceEdits(prev => ({ ...prev, [s.id]: v.replace(/[^0-9.]/g, '') }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.tertiaryLabel}
                  />
                </View>
              </View>
            </View>
          ))
        )}
        {availableNewServices.length > 0 && (
          <>
            <Divider />
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}
              onPress={() => { setNewServiceName(availableNewServices[0]); setAddServiceOpen(true); }}
            >
              <Text style={{ fontSize: 15, fontFamily: Fonts.semibold, color: BRAND }}>+ Add a service</Text>
            </Pressable>
          </>
        )}
        {services.length > 0 && (
          <>
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Open to negotiation</Text>
                <Text style={styles.infoSub}>Let clients propose a different price when booking</Text>
              </View>
              <Switch
                value={priceNegotiable}
                disabled={negotiableSaving}
                onValueChange={async (next) => {
                  setPriceNegotiable(next);
                  setNegotiableSaving(true);
                  try {
                    await apiUpdateProviderPricing({ pricingModel: 'PER_SERVICE', priceNegotiable: next });
                  } catch (e: any) {
                    setPriceNegotiable(!next);
                    Alert.alert('Could not save', e?.message || 'Please try again.');
                  }
                  setNegotiableSaving(false);
                }}
                trackColor={{ false: '#D1D5DB', true: '#E9A0B1' }}
                thumbColor={priceNegotiable ? BRAND : '#F4F4F5'}
              />
            </View>
          </>
        )}
      </View>

      <Modal_ addServiceOpen={addServiceOpen} setAddServiceOpen={setAddServiceOpen}
        availableNewServices={availableNewServices}
        newServiceName={newServiceName} setNewServiceName={setNewServiceName}
        newServicePrice={newServicePrice} setNewServicePrice={setNewServicePrice}
        newServiceDuration={newServiceDuration} setNewServiceDuration={setNewServiceDuration}
        addingService={addingService} addService={addService}
      />
    </>
  );
}

// Split out purely to keep the main component body readable — same Modal,
// just not inlined at the bottom of a 200-line function.
function Modal_({
  addServiceOpen, setAddServiceOpen, availableNewServices,
  newServiceName, setNewServiceName, newServicePrice, setNewServicePrice,
  newServiceDuration, setNewServiceDuration, addingService, addService,
}: {
  addServiceOpen: boolean; setAddServiceOpen: (v: boolean) => void;
  availableNewServices: string[];
  newServiceName: string | null; setNewServiceName: (v: string) => void;
  newServicePrice: string; setNewServicePrice: (v: string) => void;
  newServiceDuration: string; setNewServiceDuration: (v: string) => void;
  addingService: boolean; addService: () => void;
}) {
  return (
    <Modal visible={addServiceOpen} transparent animationType="slide" onRequestClose={() => setAddServiceOpen(false)}>
      <View style={specStyles.overlay}>
        <View style={specStyles.sheet}>
          <Text style={specStyles.title}>Add a service</Text>
          <Text style={specStyles.sub}>Pick what you're adding, then set your price.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
            {availableNewServices.map(name => {
              const on = newServiceName === name;
              return (
                <Pressable key={name} onPress={() => setNewServiceName(name)} style={[specStyles.chip, on && specStyles.chipOn]}>
                  <Text style={[specStyles.chipText, on && specStyles.chipTextOn]}>{name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[specStyles.sub, { marginBottom: 0 }]}>Price</Text>
              <TextInput
                style={specStyles.input}
                value={newServicePrice}
                onChangeText={v => setNewServicePrice(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.tertiaryLabel}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[specStyles.sub, { marginBottom: 0 }]}>Duration (min, optional)</Text>
              <TextInput
                style={specStyles.input}
                value={newServiceDuration}
                onChangeText={v => setNewServiceDuration(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="60"
                placeholderTextColor={Colors.tertiaryLabel}
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable style={[specStyles.btn, specStyles.btnGhost]} onPress={() => setAddServiceOpen(false)}>
              <Text style={specStyles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[specStyles.btn, specStyles.btnPrimary]} onPress={addService} disabled={addingService || !newServiceName}>
              {addingService ? <ActivityIndicator color="#fff" /> : <Text style={specStyles.btnPrimaryText}>Add</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 8,
  },
  headerTitle: { fontSize: 17.5, fontFamily: Fonts.display, color: Colors.label },
  sectionAccent: { width: 4, height: 16, borderRadius: 2, backgroundColor: Colors.brand },
  saveChangesBtn: {
    backgroundColor: Colors.brand, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  saveChangesBtnText: { color: '#fff', fontSize: 12.5, fontFamily: Fonts.semibold },
  card: {
    backgroundColor: '#fff', borderRadius: 18, marginHorizontal: 16,
    paddingHorizontal: 16, paddingVertical: 6,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  emptyNote: { paddingVertical: 18 },
  emptyNoteText: { fontSize: 13.5, color: Colors.secondaryLabel, lineHeight: 19 },
  divider: { height: 1, backgroundColor: Colors.separatorSoft },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, gap: 12,
  },
  priceRowName: { fontSize: 14.5, fontFamily: Fonts.semibold, color: Colors.label },
  priceRowDuration: { fontSize: 12, color: Colors.tertiaryLabel },
  durationRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, marginTop: 4 },
  durationEditHint: { fontSize: 11, color: Colors.tertiaryLabel, fontFamily: Fonts.regular },
  durationInput: {
    fontSize: 13, color: Colors.label, fontFamily: Fonts.semibold,
    padding: 0, paddingVertical: 3, width: 34, textAlign: 'right',
    borderBottomWidth: 1.5, borderBottomColor: Colors.brandAccent,
  },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 0,
    backgroundColor: Colors.surfaceCream, borderRadius: R_WELL,
    paddingHorizontal: 12, borderWidth: 1, borderColor: Colors.separator,
    width: 92,
  },
  priceInputDollar: { fontSize: 14, fontFamily: Fonts.semibold, color: Colors.secondaryLabel },
  priceInput: {
    width: 54, fontSize: 14, fontFamily: Fonts.semibold, color: Colors.label,
    paddingVertical: 8, paddingHorizontal: 4, textAlign: 'right',
  },
  infoLabel: { fontSize: 15, fontFamily: Fonts.medium, color: Colors.label },
  infoSub: { fontSize: 12, color: Colors.tertiaryLabel, marginTop: 2 },
});

const specStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(61,35,41,0.42)', justifyContent: 'flex-end' },
  sheet:   { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 34 },
  title:   { fontSize: 19, fontFamily: Fonts.bold, color: Colors.label, letterSpacing: -0.5 },
  sub:     { fontSize: 13.5, fontFamily: Fonts.regular, color: Colors.tertiaryLabel, marginTop: 5, marginBottom: 8 },
  input:   { borderWidth: 1, borderColor: Colors.separator, backgroundColor: Colors.surfaceCream, borderRadius: R_WELL, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: Fonts.regular, color: Colors.label, marginTop: 8 },
  chip:    { paddingHorizontal: 14, paddingVertical: 9, borderRadius: R_PILL, backgroundColor: Colors.surfaceCream, borderWidth: 1, borderColor: 'transparent' },
  chipOn:  { backgroundColor: Colors.brandLight, borderColor: Colors.brandAccent },
  chipText:   { fontSize: 12.5, fontFamily: Fonts.medium, color: Colors.secondaryLabel },
  chipTextOn: { fontFamily: Fonts.semibold, color: Colors.brand },
  btn:        { flex: 1, height: 50, borderRadius: R_WELL, alignItems: 'center', justifyContent: 'center' },
  btnGhost:   { backgroundColor: Colors.surfaceCream },
  btnGhostText: { fontSize: 15, fontFamily: Fonts.semibold, color: Colors.label },
  btnPrimary: { backgroundColor: Colors.brand },
  btnPrimaryText: { fontSize: 15, fontFamily: Fonts.semibold, color: '#fff' },
});
