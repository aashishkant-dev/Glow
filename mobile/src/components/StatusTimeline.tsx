import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../utils/colors';
import { BellIcon, ClockIcon } from './CareIcons';
import { CheckCircleIcon, NavigateIcon, StarIcon, CloseCircleIcon } from './TabIcons';

type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

interface TimelineStep {
  key: string;
  label: string;
  sublabel: string;
  Icon: IconComp;
}

const STEPS: TimelineStep[] = [
  { key: 'REQUESTED', label: 'Booking Sent', sublabel: 'Finding your Provider', Icon: BellIcon },
  { key: 'ACCEPTED', label: 'Provider Accepted', sublabel: 'Provider confirmed the job', Icon: CheckCircleIcon },
  { key: 'ON_MY_WAY', label: 'On the Way', sublabel: 'Provider heading to you', Icon: NavigateIcon },
  { key: 'STARTED', label: 'Care Started', sublabel: 'Session in progress', Icon: ClockIcon },
  { key: 'COMPLETED', label: 'Completed', sublabel: 'Service finished', Icon: StarIcon },
];

const ORDER = ['REQUESTED', 'ACCEPTED', 'ON_MY_WAY', 'STARTED', 'COMPLETED'];

interface Props {
  status: string;
  compact?: boolean;
  animated?: boolean;
}

export function StatusTimeline({ status, compact = false, animated = true }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [animated]);

  if (status === 'CANCELLED') {
    return (
      <View style={styles.cancelledBox}>
        <CloseCircleIcon size={28} color={Colors.systemRed} />
        <View>
          <Text style={styles.cancelledTitle}>Booking Cancelled</Text>
          <Text style={styles.cancelledDesc}>This booking was cancelled.</Text>
        </View>
      </View>
    );
  }

  const currentIndex = ORDER.indexOf(status);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactTrack}>
          {ORDER.map((stepKey, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isLast = index === ORDER.length - 1;
            const step = STEPS.find(s => s.key === stepKey)!;

            return (
              <View key={stepKey} style={styles.compactStep}>
                <View
                  style={[
                    styles.compactDot,
                    isCompleted && styles.compactDotCompleted,
                    isCurrent && styles.compactDotCurrent,
                  ]}
                >
                  {isCurrent && animated && (
                    <Animated.View
                      style={[
                        styles.compactDotPulse,
                        { transform: [{ scale: pulseAnim }] },
                      ]}
                    />
                  )}
                  {isCompleted && <Text style={styles.compactCheck}>✓</Text>}
                  {isCurrent && !isCompleted && <View style={styles.compactDotInner} />}
                </View>
                {!isLast && (
                  <View
                    style={[
                      styles.compactLine,
                      isCompleted && styles.compactLineCompleted,
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.compactLabelsRow}>
          <Text style={[styles.compactLabel, currentIndex >= 0 && styles.compactLabelActive]}>
            {currentIndex >= 0 ? STEPS[currentIndex].label : 'Waiting'}
          </Text>
          <Text style={styles.compactSublabel}>
            {currentIndex >= 0 ? STEPS[currentIndex].sublabel : 'Finding Provider...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <View key={step.key} style={styles.stepRow}>
            <View style={styles.leftCol}>
              <View style={[
                styles.dot,
                isCompleted && styles.dotCompleted,
                isCurrent && styles.dotCurrent,
                isPending && styles.dotPending,
              ]}>
                {isCurrent && animated && (
                  <Animated.View
                    style={[
                      styles.dotPulse,
                      { transform: [{ scale: pulseAnim }] },
                    ]}
                  />
                )}
                {isCompleted && <Text style={styles.checkText}>✓</Text>}
                {isCurrent && <View style={styles.innerDot} />}
              </View>
              {index < STEPS.length - 1 && (
                <View style={[styles.line, isCompleted ? styles.lineCompleted : styles.linePending]} />
              )}
            </View>

            <View style={[styles.content, index < STEPS.length - 1 && { marginBottom: 4 }]}>
              <View style={[styles.stepIcon, isPending && { opacity: 0.35 }]}>
                <step.Icon size={18} color={isCurrent ? Colors.systemBlue : isCompleted ? Colors.systemGreen : Colors.tertiaryLabel} />
              </View>
              <View style={styles.stepText}>
                <Text style={[
                  styles.stepLabel,
                  isCurrent && styles.stepLabelCurrent,
                  isPending && styles.stepLabelPending,
                  isCompleted && styles.stepLabelCompleted,
                ]}>
                  {step.label}
                </Text>
                {(isCompleted || isCurrent) && (
                  <Text style={[styles.stepDesc, isCompleted && styles.stepDescCompleted]}>
                    {step.sublabel}
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  stepRow: { flexDirection: 'row', minHeight: 56 },
  leftCol: { width: 32, alignItems: 'center' },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dotCompleted: { backgroundColor: Colors.systemGreen },
  dotCurrent: {
    backgroundColor: Colors.systemBlue,
    shadowColor: Colors.systemBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  dotPending: { backgroundColor: Colors.systemGray5, borderWidth: 1.5, borderColor: Colors.systemGray4 },
  dotPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.systemBlue + '25',
  },
  checkText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  innerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  line: { width: 2, flex: 1, marginTop: 2, borderRadius: 1 },
  lineCompleted: { backgroundColor: Colors.systemGreen },
  linePending: { backgroundColor: Colors.systemGray5 },
  content: { flex: 1, flexDirection: 'row', paddingBottom: 20, paddingLeft: 12 },
  stepIcon: { marginRight: 10, marginTop: 1 },
  stepText: { flex: 1 },
  stepLabel: { fontSize: 15, fontWeight: '600', color: Colors.label, marginBottom: 2 },
  stepLabelCurrent: { color: Colors.systemBlue },
  stepLabelPending: { color: Colors.tertiaryLabel, fontWeight: '500' },
  stepLabelCompleted: { color: Colors.systemGreen },
  stepDesc: { fontSize: 13, color: Colors.secondaryLabel },
  stepDescCompleted: { color: Colors.secondaryLabel },
  cancelledBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  cancelledIcon: { fontSize: 28 },
  cancelledTitle: { fontSize: 15, fontWeight: '700', color: Colors.systemRed, marginBottom: 2 },
  cancelledDesc: { fontSize: 13, color: Colors.secondaryLabel },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  compactTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactDotCompleted: {
    backgroundColor: Colors.systemGreen,
  },
  compactDotCurrent: {
    backgroundColor: Colors.systemBlue,
  },
  compactDotPulse: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.systemBlue + '25',
  },
  compactDotInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  compactCheck: {
    color: '#fff',
    fontSize: 7,
    fontWeight: '800',
  },
  compactLine: {
    width: 16,
    height: 2,
    backgroundColor: '#E5E7EB',
  },
  compactLineCompleted: {
    backgroundColor: Colors.systemGreen,
  },
  compactLabelsRow: {
    flex: 1,
    gap: 2,
  },
  compactLabel: {
    fontSize: 13,
    color: Colors.secondaryLabel,
    fontWeight: '600',
  },
  compactLabelActive: {
    color: Colors.systemBlue,
  },
  compactSublabel: {
    fontSize: 11,
    color: Colors.tertiaryLabel,
  },
});
