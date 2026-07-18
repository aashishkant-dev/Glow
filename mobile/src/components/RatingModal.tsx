import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors } from '../utils/colors';
import { Radius, Shadow, Spacing, Typography } from '../utils/theme';
import { StarIcon, CheckCircleIcon } from './CareIcons';
import { tapLight, tapSuccess } from '../utils/haptics';

interface Props {
  visible: boolean;
  title: string;
  subtitle: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onDismiss: () => void;
}

// Short word cue under the stars so the rating feels intentional, not arbitrary.
const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export function RatingModal({ visible, title, subtitle, onSubmit, onDismiss }: Props) {
  const [stars, setStars]     = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false); // thank-you state after a successful submit
  const [error, setError]     = useState<string | null>(null);

  // Reset internal state whenever the sheet is reopened, so a fresh booking
  // doesn't inherit the previous session's stars / thank-you screen.
  useEffect(() => {
    if (visible) { setStars(0); setComment(''); setLoading(false); setDone(false); setError(null); }
  }, [visible]);

  function pickStar(n: number) {
    tapLight();
    setStars(n);
  }

  async function handleSubmit() {
    if (stars === 0) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(stars, comment);
      tapSuccess();
      setDone(true); // show thank-you; parent typically closes the sheet shortly after
    } catch (e: any) {
      // Previously onSubmit could reject and the spinner hung forever ("rating
      // broken") — surface the error and let the user retry.
      setError(e?.message || 'Could not submit rating. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          {done ? (
            // ── Thank-you state ──
            <View style={styles.thankYou}>
              <CheckCircleIcon size={56} color={Colors.brand} />
              <Text style={styles.thankYouTitle}>Thank you!</Text>
              <Text style={styles.thankYouSub}>Your feedback helps families find great care.</Text>
              <Pressable style={styles.doneBtn} onPress={onDismiss}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>

              {/* Stars — brand StarIcon, large 44pt tap targets */}
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Pressable
                    key={n}
                    onPress={() => pickStar(n)}
                    style={styles.starBtn}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                  >
                    <StarIcon size={40} color={Colors.accentGold} filled={n <= stars} />
                  </Pressable>
                ))}
              </View>
              {stars > 0 && <Text style={styles.ratingWord}>{RATING_WORDS[stars]}</Text>}

              {/* Comment */}
              <TextInput
                style={styles.input}
                placeholder="Add a comment (optional)"
                placeholderTextColor={Colors.tertiaryLabel}
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={3}
                maxLength={500}
              />

              {error && <Text style={styles.errorText}>{error}</Text>}

              {/* Actions */}
              <View style={styles.actions}>
                <Pressable style={styles.skipBtn} onPress={onDismiss} disabled={loading}>
                  <Text style={styles.skipText}>Skip</Text>
                </Pressable>
                <Pressable
                  style={[styles.submitBtn, stars === 0 && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={stars === 0 || loading}
                >
                  {loading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.submitText}>Submit Rating</Text>}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.systemBackground,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.xxl,
    paddingBottom: Spacing.xxxl,
    ...Shadow.lg,
  },
  title:    { ...Typography.title2, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { ...Typography.subheadline, color: Colors.secondaryLabel, textAlign: 'center', marginBottom: Spacing.xl },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  starBtn:  { padding: Spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  ratingWord: { ...Typography.headline, color: Colors.accentGold, textAlign: 'center', marginBottom: Spacing.lg },
  input: {
    borderWidth: 1,
    borderColor: Colors.separator,
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Typography.body,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: Spacing.xl,
    backgroundColor: Colors.systemGroupedBackground,
  },
  errorText: { ...Typography.subheadline, color: '#DC2626', textAlign: 'center', marginBottom: Spacing.md },
  actions: { flexDirection: 'row', gap: Spacing.md },
  skipBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  skipText:        { ...Typography.headline, color: Colors.secondaryLabel },
  submitBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    ...Shadow.brand,
  },
  submitBtnDisabled: { backgroundColor: Colors.systemGray4 },
  submitText:        { ...Typography.headline, color: '#fff' },
  // ── Thank-you state ──
  thankYou: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  thankYouTitle: { ...Typography.title2, marginTop: Spacing.sm },
  thankYouSub: { ...Typography.subheadline, color: Colors.secondaryLabel, textAlign: 'center', marginBottom: Spacing.md },
  doneBtn: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
    ...Shadow.brand,
  },
  doneBtnText: { ...Typography.headline, color: '#fff' },
});
