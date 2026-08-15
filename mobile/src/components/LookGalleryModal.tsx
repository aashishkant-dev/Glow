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
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Colors, Fonts } from '../utils/colors';
import { formatCurrency } from '../utils/format';
import { CloseCircleIcon } from './TabIcons';
import { LookMediaItem } from '../api/client';
import { shareLookPhoto } from '../utils/shareLook';

const { width: SCREEN_W } = Dimensions.get('window');

interface Props {
  visible: boolean;
  media: LookMediaItem[];
  name: string;
  vibe?: string;
  price?: number;
  onClose: () => void;
  onBook: () => void;
}

function GalleryVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.play(); });
  return <VideoView player={player} style={{ width: SCREEN_W, height: '100%' }} contentFit="cover" nativeControls />;
}

export function LookGalleryModal({ visible, media, name, vibe, price, onClose, onBook }: Props) {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState(0);

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
          renderItem={({ item }) => (
            item.type === 'video'
              ? <GalleryVideo uri={item.url} />
              : <Image source={{ uri: item.url }} style={{ width: SCREEN_W, height: '100%' }} contentFit="cover" cachePolicy="memory-disk" />
          )}
        />

        <View style={[styles.dotRow, { top: insets.top + 18 }]} pointerEvents="none">
          {media.map((_, i) => (
            <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
          ))}
        </View>

        <Pressable style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={onClose} hitSlop={10}>
          <CloseCircleIcon size={30} color="#fff" />
        </Pressable>
        <Pressable
          style={[styles.shareBtn, { top: insets.top + 12 }]}
          onPress={() => shareLookPhoto(media[active]?.url, `${name} — see it on Glow ✨`)}
          hitSlop={10}
        >
          <Text style={styles.shareBtnText}>↗ Share</Text>
        </Pressable>

        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.footerGradient} pointerEvents="none" />
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{name}</Text>
            {!!vibe && <Text style={styles.vibe} numberOfLines={1}>{vibe}</Text>}
          </View>
          <Pressable style={styles.bookBtn} onPress={onBook}>
            <Text style={styles.bookBtnText}>
              {price != null ? `Book · ${formatCurrency(price, { decimals: 0 })}` : 'Book this look'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  closeBtn: { position: 'absolute', right: 14, zIndex: 2 },
  shareBtn: {
    position: 'absolute', left: 14, zIndex: 2,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  shareBtnText: { color: '#fff', fontSize: 13, fontFamily: Fonts.semibold },
  dotRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 14 },
  footerGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 160 },
  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
    paddingHorizontal: 18, paddingTop: 40,
  },
  name: { color: '#fff', fontSize: 19, fontFamily: Fonts.semibold, letterSpacing: -0.3 },
  vibe: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: Fonts.regular, marginTop: 2 },
  bookBtn: { backgroundColor: Colors.brand, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12 },
  bookBtnText: { color: '#fff', fontSize: 14, fontFamily: Fonts.semibold },
});
