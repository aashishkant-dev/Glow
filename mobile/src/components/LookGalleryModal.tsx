/**
 * Full-screen swipeable gallery for a multi-media Look (ProviderLook) — an
 * artist's own portfolio moment shown as more than one shot, mixing photos
 * and short video clips. Opens instead of booking directly when a look has
 * more than one item; a single photo/video (or theme-only) look skips this
 * and books straight away (see ProviderPublicProfileScreen).
 */
import React, { useState } from 'react';
import { Image } from 'expo-image';
import {
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Colors, Fonts } from '../utils/colors';
import { formatCurrency } from '../utils/format';
import { CloseCircleIcon, ChevronForwardIcon } from './TabIcons';
import { LookMediaItem } from '../api/client';
import { shareLookMedia } from '../utils/shareLook';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function formatDuration(durationMin?: number | null): string | null {
  if (!durationMin || durationMin <= 0) return null;
  const h = Math.floor(durationMin / 60);
  const m = durationMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface Props {
  visible: boolean;
  media: LookMediaItem[];
  name: string;
  vibe?: string;
  price?: number;
  durationMin?: number | null;
  // Package contents — "what's included" chips, so a browsing customer sees
  // the whole package before booking, not just a cover photo and a price.
  includes?: string[];
  // Shown as a tappable "by {name}" row above the look name — Explore has no
  // other way to reach the artist once tapping the look opens this instead of
  // their profile directly, so this is the replacement path there. Omitted on
  // an artist's own profile screen, since the customer is already on it.
  providerName?: string;
  onViewProvider?: () => void;
  // "Send a message request" — a question before committing to a date,
  // distinct from onBook. Omitted where there's no logged-in customer
  // identity to message from.
  onMessageArtist?: () => void;
  onClose: () => void;
  onBook: () => void;
}

function GalleryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.play(); });
  return <VideoView player={player} style={{ width: SCREEN_W, height: SCREEN_H }} contentFit="cover" nativeControls />;
}

export function LookGalleryModal({ visible, media, name, vibe, price, durationMin, includes, providerName, onViewProvider, onMessageArtist, onClose, onBook }: Props) {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(0);
  const duration = formatDuration(durationMin);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setActive(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <FlatList
          data={media}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          renderItem={({ item }) => (
            item.type === 'video'
              ? <GalleryVideo uri={item.url} />
              : <Image source={{ uri: item.url }} style={{ width: SCREEN_W, height: SCREEN_H }} contentFit="cover" cachePolicy="memory-disk" />
          )}
        />

        <View style={[styles.dotRow, { top: insets.top + 18 }]} pointerEvents="none">
          {media.map((_, i) => (
            <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>

        <Pressable style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={onClose} hitSlop={10}>
          {/* A solid white circle here would draw the icon's own X in white-on-white
              (CloseCircleIcon always strokes the X white) — match Share's glass
              backing instead so the X reads against it. */}
          <CloseCircleIcon size={30} color="rgba(0,0,0,0.45)" />
        </Pressable>
        <Pressable
          style={[styles.shareBtn, { top: insets.top + 12 }]}
          onPress={() => {
            const item = media[active];
            if (item) shareLookMedia(item.url, `${name} — see it on Glow ✨`, item.type === 'video' ? 'video' : 'photo');
          }}
          hitSlop={10}
        >
          <Text style={styles.shareBtnText}>↗ Share</Text>
        </Pressable>

        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.footerGradient} pointerEvents="none" />
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          {!!providerName && (
            <Pressable
              style={styles.providerRow}
              onPress={onViewProvider}
              disabled={!onViewProvider}
              hitSlop={6}
            >
              <Text style={styles.providerRowText} numberOfLines={1}>by {providerName}</Text>
              {!!onViewProvider && <ChevronForwardIcon size={13} color="rgba(255,255,255,0.75)" />}
            </Pressable>
          )}

          {(!!duration || (includes && includes.length > 0)) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              {!!duration && (
                <View style={[styles.chip, styles.chipDuration]}>
                  <Text style={styles.chipDurationText}>⏱ {duration}</Text>
                </View>
              )}
              {(includes ?? []).map((item, i) => (
                <View key={i} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>{item}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">{name}</Text>
              {!!vibe && <Text style={styles.vibe} numberOfLines={1}>{vibe}</Text>}
            </View>
            {!!onMessageArtist && (
              <Pressable style={styles.messageBtn} onPress={onMessageArtist}>
                <Text style={styles.messageBtnText}>Message</Text>
              </Pressable>
            )}
            <Pressable style={styles.bookBtn} onPress={onBook}>
              <Text style={styles.bookBtnText}>
                {price != null ? `Book · ${formatCurrency(price, { decimals: 0 })}` : 'Book this look'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute', right: 14, zIndex: 2, borderRadius: 15, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  shareBtn: {
    position: 'absolute', left: 14, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  shareBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.semibold },
  dotRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 14 },
  footerGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 220 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 18, paddingTop: 40, gap: 10,
  },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start' },
  providerRowText: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontFamily: Fonts.medium },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: 7, paddingRight: 18 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 100,
    paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  chipText: { color: '#fff', fontSize: 12, fontFamily: Fonts.medium },
  chipDuration: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipDurationText: { color: '#fff', fontSize: 12, fontFamily: Fonts.semibold },
  name: { color: '#fff', fontSize: 19, fontFamily: Fonts.semibold, letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  vibe: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: Fonts.regular, marginTop: 2 },
  bookBtn: {
    backgroundColor: Colors.brand, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: Colors.brand, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 6,
  },
  bookBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },
  messageBtn: {
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  messageBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },
});
