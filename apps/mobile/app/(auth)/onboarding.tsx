import { useCallback, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, PressableScale, LocalCover } from '@/components/ui';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/constants/theme';
import { isReducedMotion } from '@/hooks/useReducedMotion';

interface Slide {
  emoji: string;
  title: string;
  body: string;
  tint: string;
  blob: string;
  photo?: boolean;
}

// First-launch introduction. Photography is used once, on the first card; the others are friendly illustrated panels.
const SLIDES: Slide[] = [
  { emoji: '🌍', title: 'Your world awaits', body: 'SoloTravelSoul is a place to plan trips and meet travelers who want the same kind of trip: built for the independent explorer in you.', tint: Colors.tealSoft, blob: Colors.accent, photo: true },
  { emoji: '🗓️', title: 'Plan every adventure', body: 'Build day-by-day itineraries, packing lists and reminders. Stay organized from first idea to landing.', tint: Colors.coralSoft, blob: Colors.coral },
  { emoji: '📖', title: 'Keep every memory', body: 'Capture moments with words and photos. Share a post, or keep the journal just for you.', tint: '#FFF1CC', blob: Colors.sun },
  { emoji: '🧭', title: 'Find your people', body: 'Ask to join public trips and see what you have in common. You choose what to share, and you can leave any time.', tint: '#E9E6FB', blob: Colors.catMountain },
];

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const finishing = useRef(false);
  const last = page === SLIDES.length - 1;

  const goTo = useCallback((next: number) => {
    scrollRef.current?.scrollTo({ x: next * width, animated: !isReducedMotion() });
    setPage(next);
  }, [width]);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try { await AsyncStorage.setItem('onboarded', '1'); } catch { /* the introduction simply shows again next time */ }
    router.replace('/(auth)/login');
  }, []);

  const handleNext = useCallback(() => { if (last) void finish(); else goTo(page + 1); }, [last, page, goTo, finish]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topRow}>
        {!last ? (
          <PressableScale onPress={() => void finish()} guardMs={500} accessibilityRole="button" accessibilityLabel="Skip" style={styles.skip} hitSlop={8}>
            <Text style={styles.skipText}>Skip</Text>
          </PressableScale>
        ) : <View style={styles.skip} />}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={styles.pager}
      >
        {SLIDES.map((s, i) => (
          <ScrollView key={i} style={{ width }} contentContainerStyle={styles.slide} showsVerticalScrollIndicator={false}>
            <View style={[styles.art, { backgroundColor: s.tint }, Shadow.md]}>
              {s.photo ? (
                <LocalCover source={require('../../assets/images/hero-hiker.jpg')} focalX={0.25} />
              ) : (
                <>
                  <View style={[styles.blob, styles.blobA, { backgroundColor: s.blob }]} />
                  <View style={[styles.blob, styles.blobB, { backgroundColor: s.blob }]} />
                  <Text style={styles.emoji}>{s.emoji}</Text>
                </>
              )}
            </View>
            <Text variant="h1" style={styles.title} accessibilityRole="header">{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </ScrollView>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.lg) + Spacing.sm }]}>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, i) => <Dot key={i} active={i === page} onPress={() => goTo(i)} />)}
        </View>
        <Button label={last ? 'Get started' : 'Next'} onPress={handleNext} fullWidth size="lg" />
      </View>
    </View>
  );
}

/** Progress dot: the active one stretches into a pill with a short spring (transform only). */
function Dot({ active, onPress }: { active: boolean; onPress: () => void }) {
  const v = useRef(new Animated.Value(active ? 1 : 0)).current;
  const prev = useRef(active);
  if (prev.current !== active) {
    prev.current = active;
    if (isReducedMotion()) v.setValue(active ? 1 : 0);
    else Animated.spring(v, { toValue: active ? 1 : 0, useNativeDriver: false, damping: 12, stiffness: 200, mass: 0.7 }).start();
  }
  return (
    <PressableScale onPress={onPress} hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Go to this page" accessibilityState={{ selected: active }}>
      <Animated.View style={[styles.dot, { width: v.interpolate({ inputRange: [0, 1], outputRange: [8, 26] }), backgroundColor: active ? Colors.primary : Colors.border }]} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  topRow: { height: 52, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: Spacing.xl },
  skip: { minWidth: 64, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  skipText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primaryDark },
  pager: { flex: 1 },
  slide: { flexGrow: 1, paddingHorizontal: Spacing['2xl'], paddingTop: Spacing['2xl'], paddingBottom: Spacing.xl, gap: Spacing.lg, justifyContent: 'flex-start' },
  art: { height: 260, borderRadius: Radius['2xl'], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', opacity: 0.35 },
  blobA: { width: 220, height: 220, borderRadius: 110, top: -60, right: -50 },
  blobB: { width: 150, height: 150, borderRadius: 75, bottom: -40, left: -30 },
  emoji: { fontSize: 96, lineHeight: 120 },
  title: { fontSize: FontSize['4xl'], lineHeight: 42 },
  body: { fontSize: FontSize.lg, lineHeight: 27, color: Colors.textSecondary },
  footer: { paddingHorizontal: Spacing['2xl'], gap: Spacing.xl },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  dot: { height: 8, borderRadius: 4 },
});
