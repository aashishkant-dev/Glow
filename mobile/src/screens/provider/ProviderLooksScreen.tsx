/**
 * Provider "Looks" tab — self-serve version of what onboarding's step 3 only
 * let an artist set once. Two halves:
 *  1. Curated catalog (data/looks.ts) — toggle which ones you can create,
 *     editable any time now instead of locked after onboarding.
 *  2. Your own looks (ProviderLook) — build a themed, priced package with a
 *     photo or a gradient theme, the same editorial presentation the curated
 *     catalog gets, shown on your public profile next to it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  apiGetProfile,
  apiGetProviderServices,
  apiGetMyLooks,
  apiCreateLook,
  apiDeleteLook,
  apiUpdateLook,
  apiGetMyPosts,
  ProviderServiceItem,
  ProviderLookItem,
  Post,
} from '../../api/client';
import { Colors, Fonts } from '../../utils/colors';
import { formatCurrency } from '../../utils/format';
import { LOOKS, LOOK_OCCASIONS, Look } from '../../data/looks';
import { LookTile } from '../../components/LookTile';
import { CameraCapture, CapturedAsset } from '../../components/CameraCapture';
import { FilterPreview } from '../../components/FilterPreview';
import { PHOTO_FILTERS } from '../../data/photoFilters';
import { SparkleIcon } from '../../components/BeautyIcons';
import { ShareIcon, PencilIcon, TrashIcon } from '../../components/CareIcons';
import { shareLookPhoto } from '../../utils/shareLook';


// A media item staged for a look — either a fresh shot (needs uploading) or
// a reference to something the artist already posted (reused as-is). The
// same post can back several looks, and a look isn't limited to fresh shots.
type StagedMediaItem =
  | { source: 'new'; type: 'photo' | 'video'; uri: string; base64: string; mimeType?: string }
  | { source: 'existing'; type: 'photo' | 'video'; uri: string };

const THEME_PRESETS: { name: string; from: string; to: string }[] = [
  { name: 'Rose',       from: '#E9A0B1', to: '#A34D63' },
  { name: 'Gold',       from: '#D4AF37', to: '#8E6F1E' },
  { name: 'Ocean',      from: '#7FA6B5', to: '#3E5866' },
  { name: 'Blush',      from: '#F0C9B4', to: '#C08A6E' },
  { name: 'Lilac',      from: '#A78BFA', to: '#5B3E9E' },
  { name: 'Terracotta', from: '#D99A6C', to: '#A3541E' },
  { name: 'Wine',       from: '#8E4257', to: '#3B1520' },
  { name: 'Teal',       from: '#5EAAA8', to: '#2E5F5E' },
  { name: 'Emerald',    from: '#6FBF9E', to: '#276B4E' },
  { name: 'Sunset',     from: '#F0956B', to: '#B34A2E' },
  { name: 'Berry',      from: '#C46B9A', to: '#6B2E52' },
  { name: 'Slate',      from: '#8B97A8', to: '#3E4A5E' },
  { name: 'Peach',      from: '#F5C9A8', to: '#D98A5E' },
  { name: 'Mauve',      from: '#C9A0C4', to: '#6E4570' },
  { name: 'Sage',       from: '#A8BFA0', to: '#4E6B47' },
  { name: 'Champagne',  from: '#EAD9B0', to: '#B89A5E' },
  { name: 'Plum',       from: '#9B6B8C', to: '#4A2B44' },
  { name: 'Sky',        from: '#A8D0E6', to: '#4C7FA0' },
  { name: 'Coral',      from: '#F0847A', to: '#B3423A' },
  { name: 'Mint',       from: '#A0DBC0', to: '#3E8265' },
  { name: 'Amber',      from: '#F0B45E', to: '#B3721E' },
  { name: 'Orchid',     from: '#D89BD4', to: '#7A3E77' },
  { name: 'Steel',      from: '#9DAEC2', to: '#485A73' },
  { name: 'Cocoa',      from: '#B98D6F', to: '#5E3E2B' },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function customLookToLook(item: ProviderLookItem): Look {
  return {
    id: `custom-${item.id}`,
    name: item.name,
    vibe: item.vibe || '',
    collection: 'Trending',
    occasion: '',
    serviceType: item.serviceType,
    includes: item.includes,
    durationMin: item.durationMin ?? 60,
    fromPrice: item.price,
    products: [],
    from: item.themeFrom || Colors.brand,
    to: item.themeTo || Colors.brandAccent,
    // A video cover is handled separately via LookTile's coverVideo prop
    // (see coverVideoFor below) — Look.photo stays photo-only here.
    photo: item.media[0]?.type === 'photo' ? item.media[0].url : undefined,
  };
}

// LookTile can play a muted looping video as the card background instead of
// a static photo — used when a look's cover slot is a video clip.
function coverVideoFor(item: ProviderLookItem): string | undefined {
  return item.media[0]?.type === 'video' ? item.media[0].url : undefined;
}

function MediaGridVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export function ProviderLooksScreen() {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [specialties, setSpecialties] = useState<string[]>([]);

  const [services, setServices] = useState<ProviderServiceItem[]>([]);
  const [myLooks, setMyLooks] = useState<ProviderLookItem[]>([]);
  // The artist's own post library — a look can reuse any of these instead of
  // shooting fresh, and the same photo can back several looks at once.
  const [myPosts, setMyPosts] = useState<Post[]>([]);

  async function loadAll() {
    try {
      const [profileRes, servicesRes, looksRes, postsRes] = await Promise.all([
        apiGetProfile(),
        apiGetProviderServices(),
        apiGetMyLooks(),
        apiGetMyPosts(),
      ]);
      setSpecialties(profileRes.user.providerProfile?.specialties ?? []);
      setServices(servicesRes.services.filter(s => s.active));
      setMyLooks(looksRes.looks);
      setMyPosts(postsRes.posts);
    } catch (err) {
      console.error('Failed to load Looks tab', err);
    }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function deleteCustomLook(look: ProviderLookItem) {
    const doDelete = async () => {
      const prev = myLooks;
      setMyLooks(list => list.filter(l => l.id !== look.id));
      try {
        await apiDeleteLook(look.id);
      } catch (err: any) {
        setMyLooks(prev);
        Alert.alert('Could not delete', err?.message || 'Please try again.');
      }
    };
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Remove "${look.name}"? This cannot be undone.`)) doDelete();
      return;
    }
    Alert.alert(`Remove "${look.name}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: doDelete },
    ]);
  }

  // Badge only kicks in once something has at least one like — an empty
  // gallery where everything ties at 0 has no "most loved" to call out.
  const mostLovedLookId = myLooks.reduce<string | null>((bestId, item) => {
    if (!item.likeCount) return bestId;
    const best = myLooks.find(l => l.id === bestId);
    return !best || item.likeCount > (best.likeCount || 0) ? item.id : bestId;
  }, null);

  // Optional starting templates inside the create sheet ("1. Start from a
  // Glow look") — a prefill shortcut for a look the artist then fully
  // customizes. The FULL catalog is offered, not just this artist's
  // onboarding specialties — an artist who does more than they originally
  // ticked (or wants to branch into a new category) shouldn't be limited to
  // templates from their old specialty list. Specialty matches just float
  // first since they're the most likely starting point, same relevance
  // ordering Explore already uses for artist matching.
  const catalogLooks = [
    ...LOOKS.filter(l => specialties.includes(l.serviceType)),
    ...LOOKS.filter(l => !specialties.includes(l.serviceType)),
  ];

  const [createOpen, setCreateOpen] = useState(false);
  const [editingLook, setEditingLook] = useState<ProviderLookItem | null>(null);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.secondarySystemBackground }} contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 100 }}>
      <LinearGradient
        colors={[Colors.brandAccent, Colors.brand, Colors.brandDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroGlow} pointerEvents="none" />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <SparkleIcon size={19} color="#fff" />
            <Text style={styles.title}>Your Looks</Text>
          </View>
          <Text style={styles.subtitle}>
            What clients see as "Looks you create" on your profile
          </Text>
        </View>
        <Pressable onPress={() => setCreateOpen(true)} style={({ pressed }) => [styles.newBtn, pressed && { transform: [{ scale: 0.96 }] }]}>
          <Text style={styles.newBtnPlus}>+</Text>
          <Text style={styles.newBtnText}>Create a look</Text>
        </Pressable>
      </LinearGradient>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 40 }} color={Colors.brand} />
      ) : (
        <>
          {/* ── Your own looks ── */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionAccent} />
              <Text style={styles.sectionTitle}>Your looks</Text>
            </View>
            {myLooks.length === 0 ? (
              <Pressable onPress={() => setCreateOpen(true)} style={styles.empty}>
                <View style={styles.emptySparkleLeft}><SparkleIcon size={16} color={Colors.brandAccent} /></View>
                <View style={styles.emptyIconWrap}><SparkleIcon size={24} color={Colors.brand} /></View>
                <View style={styles.emptySparkleRight}><SparkleIcon size={12} color={Colors.brandAccent} /></View>
                <Text style={styles.emptyText}>Build a themed, priced package clients can book directly</Text>
                <Text style={styles.emptyHint}>Tap "+ Create a look" to make your first one</Text>
              </Pressable>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16, alignItems: 'flex-start' }}>
                {myLooks.map(item => {
                  const mostLoved = item.id === mostLovedLookId;
                  return (
                    <View key={item.id} style={{ width: 150 }}>
                      {mostLoved && (
                        <View style={styles.mostLovedBadge}>
                          <Text style={styles.mostLovedBadgeText}>♥ Most Loved</Text>
                        </View>
                      )}
                      <LookTile
                        look={customLookToLook(item)}
                        price={item.price}
                        onPress={() => setEditingLook(item)}
                        height={130}
                        fitToPhoto
                        likeOverride={{ liked: false, count: item.likeCount || 0, onToggle: () => {} }}
                        photoCount={item.media.length}
                        coverVideo={coverVideoFor(item)}
                        badge={item.badge}
                      />
                      <View style={styles.cardActionRow}>
                        <Pressable
                          style={styles.cardActionBtn}
                          hitSlop={6}
                          accessibilityLabel="Share this look"
                          onPress={() => {
                            const cover = item.media[0];
                            if (!cover) { Alert.alert('Add a photo first', 'This look needs at least one photo to share.'); return; }
                            shareLookPhoto(cover.url, `${item.name} — see it on Glow ✨`);
                          }}
                        >
                          <ShareIcon size={16} color={Colors.brand} />
                        </Pressable>
                        <Pressable style={styles.cardActionBtn} hitSlop={6} accessibilityLabel="Edit this look" onPress={() => setEditingLook(item)}>
                          <PencilIcon size={15} color={Colors.brand} />
                        </Pressable>
                        <Pressable style={[styles.cardActionBtn, styles.cardActionBtnDanger]} hitSlop={6} accessibilityLabel="Remove this look" onPress={() => deleteCustomLook(item)}>
                          <TrashIcon size={15} color={Colors.systemRed} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

        </>
      )}

      <CreateLookSheet
        visible={createOpen || !!editingLook}
        services={services}
        templates={catalogLooks}
        editingLook={editingLook}
        onClose={() => { setCreateOpen(false); setEditingLook(null); }}
        myPosts={myPosts}
        onCreated={(look) => { setMyLooks(prev => [look, ...prev]); setCreateOpen(false); }}
        onUpdated={(look) => { setMyLooks(prev => prev.map(l => l.id === look.id ? look : l)); setEditingLook(null); }}
      />
    </ScrollView>
  );
}

function CreateLookSheet({
  visible, services, templates, editingLook, myPosts, onClose, onCreated, onUpdated,
}: {
  visible: boolean;
  services: ProviderServiceItem[];
  templates: Look[];
  editingLook?: ProviderLookItem | null;
  myPosts: Post[];
  onClose: () => void;
  onCreated: (look: ProviderLookItem) => void;
  // Everything (text fields + staged media) commits in one call, on "Create"
  // or "Save changes" — nothing hits the server before that.
  onUpdated?: (look: ProviderLookItem) => void;
}) {
  const insets = useSafeAreaInsets();
  const isEditing = !!editingLook;
  const [name, setName] = useState('');
  const [vibe, setVibe] = useState('');
  const [selectedService, setSelectedService] = useState<ProviderServiceItem | null>(null);
  const [price, setPrice] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [includesText, setIncludesText] = useState('');
  const [theme, setTheme] = useState(THEME_PRESETS[0]);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // Up to MAX_MEDIA, in order — [0] is the cover. A look is a portfolio
  // moment, not a single shot — can mix photos and short video clips.
  // Create mode stages media locally, uploaded together on submit; edit mode
  // (editingLook set) already has real uploaded media, and add/remove there
  // happen immediately against the server — see addMedia/removeMedia below.
  // Every photo/video/crop/reorder — for BOTH create and edit — stages here
  // locally first. Nothing touches the server until "Create"/"Save changes"
  // is tapped: editing used to commit each add/remove straight to the live
  // look immediately, which read as the look silently changing mid-edit
  // before the artist was done. One save point, like everything else in
  // this sheet, fixes that.
  const [media, setMedia] = useState<StagedMediaItem[]>([]);
  const [postPickerOpen, setPostPickerOpen] = useState(false);
  const [filter, setFilter] = useState('original');
  const [badge, setBadge] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Which occasion category the template row is browsing — same chip list
  // Explore's own "Looks" tab filters by, so an artist picking a starting
  // point sees it grouped the same way a client would find it.
  const [templateCategory, setTemplateCategory] = useState<'All' | typeof LOOK_OCCASIONS[number]>('All');
  const MAX_MEDIA = 5;
  const activeMediaCount = media.length;

  // Pre-fill everything from the look being edited — "customize" means
  // adjusting a real look, not retyping it from scratch.
  useEffect(() => {
    if (!editingLook) return;
    setName(editingLook.name);
    setVibe(editingLook.vibe || '');
    setIncludesText(editingLook.includes.join(', '));
    setBadge(editingLook.badge || '');
    setPrice(String(editingLook.price));
    setDurationMin(editingLook.durationMin != null ? String(editingLook.durationMin) : '');
    const matched = services.find(s => s.name === editingLook.serviceType);
    setSelectedService(matched || null);
    if (editingLook.themeFrom && editingLook.themeTo) {
      setTheme({ name: 'Custom', from: editingLook.themeFrom, to: editingLook.themeTo });
    }
    setMedia(editingLook.media.map(m => ({ source: 'existing', type: m.type, uri: m.url })));
  }, [editingLook]);

  function reset() {
    setName(''); setVibe(''); setSelectedService(null); setPrice(''); setDurationMin('');
    setIncludesText(''); setTheme(THEME_PRESETS[0]); setCustomFrom(''); setCustomTo('');
    setMedia([]); setFilter('original'); setBadge(''); setSubmitting(false);
  }

  // Live-applies as soon as both fields are valid hex — no separate "apply"
  // step, since a half-typed hex just leaves the last valid theme in place.
  function applyCustomHex(from: string, to: string) {
    if (HEX_RE.test(from) && HEX_RE.test(to)) setTheme({ name: 'Custom', from, to });
  }

  function pickService(s: ProviderServiceItem) {
    setSelectedService(s);
    setPrice(String(s.price));
    setDurationMin(String(s.durationMin));
  }

  // Starting from one of Glow's curated looks pre-fills the whole form — name,
  // vibe, theme, included items, and (when this artist has already priced the
  // matching service) price/duration too — so "customize" means editing a
  // real starting point instead of typing a package from a blank sheet.
  function applyTemplate(look: Look) {
    setName(look.name);
    setVibe(look.vibe);
    setIncludesText(look.includes.join(', '));
    setTheme({ name: look.name, from: look.from, to: look.to });
    setCustomFrom(''); setCustomTo('');
    setMedia([]); setFilter('original');
    const matched = services.find(s => s.name === look.serviceType);
    if (matched) {
      pickService(matched);
    } else {
      setSelectedService(null);
      setPrice(String(look.fromPrice));
      setDurationMin(String(look.durationMin));
    }
  }

  function addStagedMedia(item: StagedMediaItem) {
    setMedia(prev => prev.length >= MAX_MEDIA ? prev : [...prev, item]);
  }
  function addMedia(a: CapturedAsset) {
    addStagedMedia({ source: 'new', type: a.type, uri: a.uri, base64: a.base64, mimeType: a.mimeType });
  }
  function addExistingPost(post: Post) {
    if (post.videoUrl) addStagedMedia({ source: 'existing', type: 'video', uri: post.videoUrl });
    else if (post.photoUrl) addStagedMedia({ source: 'existing', type: 'photo', uri: post.photoUrl });
    setPostPickerOpen(false);
  }
  function removeMedia(index: number) {
    setMedia(prev => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    const cleanName = name.trim();
    const cleanPrice = Number(price);
    if (!cleanName) { Alert.alert('Name your look', 'Give this package a name clients will recognize.'); return; }
    if (!selectedService) { Alert.alert('Pick a service', 'Choose which of your priced services this look is built on.'); return; }
    if (Number.isNaN(cleanPrice) || cleanPrice < 0) { Alert.alert('Invalid price', 'Enter a valid price for this look.'); return; }

    setSubmitting(true);
    try {
      const mediaPayload = media.length > 0
        ? media.map(m => m.source === 'existing' ? { type: m.type, url: m.uri } : { type: m.type, base64: m.base64, mimeType: m.mimeType })
        : undefined;
      const useAutoTheme = theme.name === 'Auto';
      if (isEditing && editingLook) {
        const { look } = await apiUpdateLook(editingLook.id, {
          name: cleanName,
          vibe: vibe.trim() || undefined,
          serviceType: selectedService.name,
          price: cleanPrice,
          durationMin: durationMin ? Number(durationMin) : undefined,
          includes: includesText.split(',').map(s => s.trim()).filter(Boolean),
          badge: badge.trim() || undefined,
          media: mediaPayload,
          filter: media.length > 0 && filter !== 'original' ? filter : undefined,
          autoTheme: useAutoTheme || undefined,
          themeFrom: useAutoTheme ? undefined : theme.from,
          themeTo: useAutoTheme ? undefined : theme.to,
        });
        onUpdated?.(look);
        reset();
      } else {
        const { look } = await apiCreateLook({
          name: cleanName,
          vibe: vibe.trim() || undefined,
          serviceType: selectedService.name,
          price: cleanPrice,
          durationMin: durationMin ? Number(durationMin) : undefined,
          includes: includesText.split(',').map(s => s.trim()).filter(Boolean),
          media: mediaPayload,
          filter: media.length > 0 && filter !== 'original' ? filter : undefined,
          autoTheme: useAutoTheme || undefined,
          themeFrom: useAutoTheme ? undefined : theme.from,
          themeTo: useAutoTheme ? undefined : theme.to,
          badge: badge.trim() || undefined,
        });
        onCreated(look);
        reset();
      }
    } catch (err: any) {
      Alert.alert(isEditing ? 'Could not save changes' : 'Could not create look', err?.message || 'Please try again.');
    }
    setSubmitting(false);
  }

  const gridItems: { key: string; type: 'photo' | 'video'; uri: string; source: 'new' | 'existing' }[] =
    media.map((m, i) => ({ key: `${m.uri}-${i}`, type: m.type, uri: m.uri, source: m.source }));

  // Pull-down-to-dismiss: only fires from an overscroll past the very top
  // (native bounce / web rubber-banding reports negative contentOffset.y
  // there), not from an ordinary downward scroll mid-content — so scrolling
  // back up through the form never accidentally closes it. Checked on
  // release (onScrollEndDrag), not on every onScroll tick, so a small bounce
  // that springs back on its own doesn't close the sheet out from under a
  // still-scrolling thumb.
  const scrollYRef = useRef(0);
  const PULL_TO_CLOSE_THRESHOLD = 70;
  function handleScrollEndDrag() {
    if (scrollYRef.current < -PULL_TO_CLOSE_THRESHOLD) onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <ScrollView
          style={[styles.sheet, { maxHeight: '88%' }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={16}
        >
          <Pressable style={styles.sheetHandleWrap} onPress={onClose} hitSlop={8}>
            <View style={styles.sheetHandle} />
          </Pressable>
          <Text style={styles.sheetTitle}>{isEditing ? 'Edit look' : 'Create a look'}</Text>

          {services.length === 0 ? (
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>
                Set up priced services in your Profile first — a look is a themed package built on top of one.
              </Text>
            </View>
          ) : (
            <>
              {templates.length > 0 && !isEditing && (
                <>
                  <Text style={styles.formSectionTitle}>1. Start from a Glow look</Text>
                  <Text style={styles.fieldLabel}>Optional — tap one to fill in a starting point, then customize everything below.</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
                    {(['All', ...LOOK_OCCASIONS] as const).map(cat => (
                      <Pressable
                        key={cat}
                        style={[styles.chip, templateCategory === cat && styles.chipActive]}
                        onPress={() => setTemplateCategory(cat)}
                      >
                        <Text style={[styles.chipText, templateCategory === cat && styles.chipTextActive]}>{cat}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {/* width 150/height 130 matches the "Your looks" row above —
                      the previous 110/90 box left only ~82px for a 19px bold
                      serif title, too narrow for a single word like
                      "Traditional" or "Rajasthani" to fit on one line, so RN
                      broke it mid-word ("Traditio" / "nal Bridal") instead of
                      at the space. */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
                    {templates.filter(l => templateCategory === 'All' || l.occasion === templateCategory).map(look => (
                      <View key={look.id} style={{ width: 150 }}>
                        <LookTile look={look} onPress={() => applyTemplate(look)} height={130} />
                      </View>
                    ))}
                  </ScrollView>
                  <View style={styles.formDivider} />
                </>
              )}

              <Text style={styles.formSectionTitle}>{templates.length > 0 && !isEditing ? '2. ' : ''}Photos, videos &amp; theme</Text>
              {activeMediaCount > 0 ? (
                <Text style={styles.fieldLabel}>First item is the cover — the rest become a swipeable gallery clients flip through. Switch to Video mode to shoot a short clip.</Text>
              ) : null}

              <View style={styles.photoGrid}>
                {gridItems.map((m, i) => (
                  <View key={m.key} style={styles.photoGridTile}>
                    {m.type === 'video' ? (
                      <MediaGridVideo uri={m.uri} />
                    ) : (
                      <Image source={{ uri: m.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    )}
                    {/* Filter only actually applies server-side to freshly
                        shot/picked items — a reused post's photo keeps
                        whatever look it already has — so the live preview
                        overlay only shows on "new" tiles to match. */}
                    {m.source === 'new' && (() => {
                      const active = PHOTO_FILTERS.find(f => f.id === filter);
                      return active?.previewOverlay ? (
                        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: active.previewOverlay }]} />
                      ) : null;
                    })()}
                    {i === 0 && (
                      <View style={styles.coverPill}><Text style={styles.coverPillText}>Cover</Text></View>
                    )}
                    {m.type === 'video' && (
                      <View style={styles.videoBadge} pointerEvents="none"><Text style={styles.videoBadgeText}>▶</Text></View>
                    )}
                    <Pressable style={styles.photoRemoveBtn} onPress={() => removeMedia(i)} hitSlop={6}>
                      <Text style={styles.photoRemoveBtnText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                {activeMediaCount < MAX_MEDIA && (
                  <Pressable onPress={() => setCameraOpen(true)} style={[styles.photoGridTile, styles.photoGridAddTile]}>
                    <Text style={styles.photoGridAddText}>+</Text>
                    <Text style={styles.photoGridAddSubtext}>Shoot</Text>
                  </Pressable>
                )}
                {activeMediaCount < MAX_MEDIA && myPosts.length > 0 && (
                  <Pressable onPress={() => setPostPickerOpen(true)} style={[styles.photoGridTile, styles.photoGridAddTile]}>
                    <Text style={styles.photoGridAddText}>🖼</Text>
                    <Text style={styles.photoGridAddSubtext}>From posts</Text>
                  </Pressable>
                )}
              </View>

              {activeMediaCount > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                    Filter — applies to new photos (reused ones keep their own look)
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {PHOTO_FILTERS.map(f => {
                      const active = filter === f.id;
                      const firstPhoto = gridItems.find(m => m.type === 'photo');
                      return (
                        <Pressable key={f.id} onPress={() => setFilter(f.id)} style={{ alignItems: 'center', gap: 4 }}>
                          <View style={[styles.filterSwatch, active && styles.filterSwatchActive]}>
                            {firstPhoto ? (
                              <FilterPreview uri={firstPhoto.uri} overlay={f.previewOverlay} size={52} />
                            ) : (
                              <View style={[styles.videoFilterDot, { backgroundColor: f.previewOverlay || '#8A8A8A' }]} />
                            )}
                          </View>
                          <Text style={[styles.filterSwatchLabel, active && styles.filterSwatchLabelActive]}>{f.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* Theme is a persistent card style now, not just a fallback —
                  LookTile draws it as a color overlay on top of photos/video
                  too, so it's always worth picking one. */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                {activeMediaCount > 0 ? 'Card theme — tints your photos too' : 'Pick a card theme'}
              </Text>

              {/* Live preview of exactly what the card's gradient will look
                  like — picking a color from a tiny swatch and only seeing
                  the result on the finished card was the "still basic" gap;
                  this closes the loop immediately. */}
              <LinearGradient
                colors={theme.name === 'Auto' ? [Colors.brandAccent, Colors.brandDeep] : [theme.from, theme.to]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.themePreview}
              >
                <Text style={styles.themePreviewText}>{theme.name === 'Auto' ? '✨ Sampled from your photo' : theme.name}</Text>
              </LinearGradient>

              <View style={styles.themeGrid}>
                {/* Samples the cover photo's own colors instead of a preset —
                    only offered when there's a FRESH (not reused/existing)
                    photo staged, since extraction runs on the upload itself;
                    available in both create and edit now that both stage
                    locally the same way. */}
                {media.some(m => m.type === 'photo' && m.source === 'new') && (
                  <Pressable
                    onPress={() => setTheme({ name: 'Auto', from: '', to: '' })}
                    style={[styles.autoThemeChip, theme.name === 'Auto' && styles.themeSwatchActive]}
                  >
                    <Text style={styles.autoThemeChipText}>✨ Auto</Text>
                  </Pressable>
                )}
                {THEME_PRESETS.map(t => {
                  const active = t.from === theme.from && t.to === theme.to && theme.name !== 'Auto';
                  return (
                    <Pressable
                      key={t.name}
                      onPress={() => { setTheme(t); setCustomFrom(''); setCustomTo(''); }}
                      style={[styles.themeSwatch, { backgroundColor: t.from }, active && styles.themeSwatchActive]}
                    >
                      {active && <Text style={styles.themeSwatchCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </View>
              {theme.name === 'Auto' ? (
                <Text style={styles.fieldLabel}>Colors will be sampled from your first photo when you create the look.</Text>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Or use your own colors</Text>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginTop: 0 }]}
                      value={customFrom}
                      onChangeText={t => { setCustomFrom(t); applyCustomHex(t, customTo); }}
                      placeholder="#A34D63"
                      placeholderTextColor={Colors.tertiaryLabel}
                      autoCapitalize="none"
                      maxLength={7}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, marginTop: 0 }]}
                      value={customTo}
                      onChangeText={t => { setCustomTo(t); applyCustomHex(customFrom, t); }}
                      placeholder="#3B1520"
                      placeholderTextColor={Colors.tertiaryLabel}
                      autoCapitalize="none"
                      maxLength={7}
                    />
                    <View style={[styles.customSwatchPreview, { backgroundColor: theme.from, borderColor: theme.name === 'Custom' ? Colors.label : 'transparent' }]} />
                  </View>
                </>
              )}

              <View style={styles.formDivider} />
              <Text style={styles.formSectionTitle}>{templates.length > 0 && !isEditing ? '3. ' : '2. '}Details</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Look name (e.g. Golden Hour Glam)" placeholderTextColor={Colors.tertiaryLabel} maxLength={60} />
              <TextInput style={styles.input} value={vibe} onChangeText={setVibe} placeholder="One-line vibe (optional)" placeholderTextColor={Colors.tertiaryLabel} maxLength={140} />
              <TextInput style={styles.input} value={includesText} onChangeText={setIncludesText} placeholder="Includes, comma separated (e.g. Makeup, Lashes)" placeholderTextColor={Colors.tertiaryLabel} />

              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Package it — a promo label on the card (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
                {['Bestseller', 'New', 'Limited spots', 'Bridal Special', 'Trending'].map(b => (
                  <Pressable key={b} style={[styles.chip, badge === b && styles.chipActive]} onPress={() => setBadge(badge === b ? '' : b)}>
                    <Text style={[styles.chipText, badge === b && styles.chipTextActive]}>{b}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <TextInput style={styles.input} value={badge} onChangeText={setBadge} placeholder="Or write your own (max 24 chars)" placeholderTextColor={Colors.tertiaryLabel} maxLength={24} />

              <View style={styles.formDivider} />
              <Text style={styles.formSectionTitle}>{templates.length > 0 && !isEditing ? '4. ' : '3. '}Service &amp; price</Text>
              <Text style={styles.fieldLabel}>Built on which service?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                {services.map(s => {
                  const active = selectedService?.id === s.id;
                  return (
                    <Pressable key={s.id} style={[styles.chip, active && styles.chipActive]} onPress={() => pickService(s)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{s.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                {/* Persistent labels, not just placeholders — a placeholder
                    vanishes the moment a number is typed, and two bare
                    numeric boxes side by side then look like two price
                    fields with no way to tell which is which. */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Price</Text>
                  <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="0" placeholderTextColor={Colors.tertiaryLabel} keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput style={styles.input} value={durationMin} onChangeText={setDurationMin} placeholder="60" placeholderTextColor={Colors.tertiaryLabel} keyboardType="number-pad" />
                </View>
              </View>
            </>
          )}

          <View style={styles.sheetBtnRow}>
            <Pressable style={styles.cancelBtn} onPress={() => { reset(); onClose(); }} disabled={submitting}>
              <Text style={styles.cancelBtnText}>{isEditing ? 'Close' : 'Cancel'}</Text>
            </Pressable>
            {services.length > 0 && (
              <Pressable style={styles.postBtn} onPress={submit} disabled={submitting}>
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>{isEditing ? 'Save changes' : 'Create'}</Text>}
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CameraCapture
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(asset) => { addMedia(asset); setCameraOpen(false); }}
      />

      {/* Reuse an already-posted photo/video instead of shooting again — the
          same post can back this look and others at once. */}
      <Modal visible={postPickerOpen} transparent animationType="slide" onRequestClose={() => setPostPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '75%' }]}>
            <Text style={styles.sheetTitle}>Choose from your posts</Text>
            {myPosts.length === 0 && (
              <Text style={styles.infoBoxText}>No posts yet — shoot one from the Posts tab first.</Text>
            )}
            {/* A bare ScrollView inside a maxHeight (not fixed-height) parent
                can collapse to near-zero height on web — give it its own
                bound so the grid actually has room to render. */}
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={styles.postPickerGrid}>
                {myPosts.map(post => (
                  <Pressable key={post.id} style={styles.postPickerTile} onPress={() => addExistingPost(post)}>
                    {post.videoUrl ? (
                      <MediaGridVideo uri={post.videoUrl} />
                    ) : (
                      <Image source={{ uri: post.photoUrl ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    )}
                    {post.videoUrl && (
                      <View style={styles.videoBadge} pointerEvents="none"><Text style={styles.videoBadgeText}>▶</Text></View>
                    )}
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Pressable style={styles.cancelBtn} onPress={() => setPostPickerOpen(false)}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginHorizontal: 16, marginBottom: 22, borderRadius: 30, padding: 20, gap: 12,
    overflow: 'hidden',
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 8,
  },
  heroGlow: {
    position: 'absolute', top: -50, right: -40, width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  title: { fontSize: 21, fontFamily: Fonts.display, color: '#fff', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 6, fontFamily: Fonts.medium, lineHeight: 16.5 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  newBtnPlus: { color: Colors.brand, fontSize: 15, fontFamily: Fonts.bold, marginTop: -1 },
  newBtnText: { color: Colors.brand, fontSize: 12.5, fontFamily: Fonts.bold },

  section: { marginBottom: 26 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 6 },
  sectionAccent: { width: 4, height: 16, borderRadius: 2, backgroundColor: Colors.brand },
  sectionTitle: { fontSize: 17.5, fontFamily: Fonts.display, color: Colors.label },

  empty: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 6,
    marginHorizontal: 16, borderRadius: 26,
    backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.separator,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16, elevation: 2,
    position: 'relative',
  },
  emptySparkleLeft: { position: 'absolute', top: 24, left: '28%', fontSize: 14, opacity: 0.7, transform: [{ rotate: '-12deg' }] },
  emptySparkleRight: { position: 'absolute', top: 38, right: '28%', fontSize: 11, opacity: 0.55, transform: [{ rotate: '14deg' }] },
  emptyIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.brandLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyText: { fontSize: 14, fontWeight: '600', color: Colors.secondaryLabel, textAlign: 'center' },
  emptyHint: { fontSize: 12.5, color: Colors.tertiaryLabel },

  // Real circular icon buttons instead of three cramped text pills squeezed
  // into a 150px card — each one is a proper ~44pt touch target (visual
  // circle is 34px, hitSlop makes up the rest) instead of paddingVertical:7
  // pills that were too small to comfortably tap, especially the
  // destructive one.
  cardActionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cardActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brandLight,
  },
  // A red border, not just a red tint fill (which alone was too close to
  // Share/Edit's pink tint at a glance) — the clearest possible break from
  // the two non-destructive actions beside it.
  cardActionBtnDanger: {
    backgroundColor: Colors.systemRed + '12',
    borderWidth: 1.5, borderColor: Colors.systemRed + '55',
  },

  mostLovedBadge: {
    position: 'absolute', top: -8, left: 8, zIndex: 1,
    backgroundColor: Colors.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    shadowColor: Colors.gold, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 3,
  },
  mostLovedBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  infoBox: {
    flexDirection: 'row', gap: 8, backgroundColor: Colors.brandLight, borderRadius: 14,
    padding: 12, marginHorizontal: 16,
  },
  infoBoxText: { flex: 1, fontSize: 12.5, color: Colors.secondaryLabel, lineHeight: 17 },

  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16,
    backgroundColor: Colors.systemGray6, borderWidth: 1, borderColor: Colors.separator,
  },
  chipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.secondaryLabel },
  chipTextActive: { color: '#fff' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.systemBackground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  // Signals "this scrolls closed" before anyone tries it — a plain grabber
  // bar, tappable too as a fallback for anyone who doesn't think to scroll.
  sheetHandleWrap: { alignItems: 'center', paddingBottom: 12, marginTop: -6 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.separator },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.label, marginBottom: 14 },

  formSectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.label, marginBottom: 4 },
  formDivider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.separator, marginVertical: 18 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoGridTile: { width: '31%', aspectRatio: 4 / 5, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.systemGray6 },
  photoGridAddTile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.brandAccent, borderStyle: 'dashed' },
  photoGridAddText: { fontSize: 26, color: Colors.brand, fontWeight: '300' },
  photoGridAddSubtext: { fontSize: 9.5, color: Colors.brand, fontWeight: '600', marginTop: 2 },
  postPickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  postPickerTile: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.systemGray6 },
  coverPill: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(29,29,31,0.55)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  coverPillText: { color: '#fff', fontSize: 9.5, fontWeight: '700' },
  photoRemoveBtn: { position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(29,29,31,0.6)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveBtnText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  videoBadge: { position: 'absolute', bottom: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(29,29,31,0.6)', alignItems: 'center', justifyContent: 'center' },
  videoBadgeText: { color: '#fff', fontSize: 8 },
  themePreview: {
    height: 44, borderRadius: 14, marginTop: 10, marginBottom: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  themePreviewText: { color: '#fff', fontSize: 13, fontFamily: Fonts.semibold, textShadowColor: 'rgba(0,0,0,0.25)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeSwatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  themeSwatchCheck: { color: '#fff', fontSize: 15, fontFamily: Fonts.bold, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  autoThemeChip: {
    height: 38, paddingHorizontal: 12, borderRadius: 19, borderWidth: 2, borderColor: 'transparent',
    backgroundColor: Colors.brandLight, alignItems: 'center', justifyContent: 'center',
  },
  autoThemeChipText: { fontSize: 12.5, fontWeight: '700', color: Colors.brand },
  themeSwatchActive: { borderColor: Colors.label },
  customSwatchPreview: { width: 40, height: 40, borderRadius: 10, borderWidth: 2 },

  filterSwatch: { borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  filterSwatchActive: { borderColor: Colors.brand },
  videoFilterDot: { width: 52, height: 52, borderRadius: 12 },
  filterSwatchLabel: { fontSize: 11, fontWeight: '600', color: Colors.secondaryLabel },
  filterSwatchLabelActive: { color: Colors.brand, fontWeight: '700' },

  input: {
    fontSize: 14, color: Colors.label, minHeight: 44,
    backgroundColor: Colors.systemGray6, borderRadius: 14, borderWidth: 1, borderColor: Colors.brandAccent,
    paddingHorizontal: 14, paddingVertical: 11, marginTop: 12,
  },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.secondaryLabel, marginTop: 16, marginBottom: 8 },

  sheetBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: Colors.systemGray6 },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.secondaryLabel },
  postBtn: { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: Colors.brand },
  postBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
