import { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Button } from '@/components/ui';
import { Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🌍',
    title: 'Your World\nAwaits',
    body: 'SoloTravelSoul is your personal travel companion — built for the independent explorer in you.',
    gradient: ['#1A7FD4', '#083F72'] as const,
    accentLight: 'rgba(255,255,255,0.12)',
  },
  {
    emoji: '📅',
    title: 'Plan Every\nAdventure',
    body: 'Build day-by-day itineraries with ease. Stay organized from first inspiration to final landing.',
    gradient: ['#10B981', '#047857'] as const,
    accentLight: 'rgba(255,255,255,0.10)',
  },
  {
    emoji: '📖',
    title: 'Journal Every\nMemory',
    body: 'Capture every moment with words and photos. Your travel story, beautifully preserved forever.',
    gradient: ['#6366F1', '#4338CA'] as const,
    accentLight: 'rgba(255,255,255,0.10)',
  },
  {
    emoji: '🧭',
    title: 'Discover New\nPlaces',
    body: 'Browse curated destinations across the US. Save your favorites and build the trip of a lifetime.',
    gradient: ['#F59E0B', '#D97706'] as const,
    accentLight: 'rgba(255,255,255,0.10)',
  },
];

export default function OnboardingScreen() {
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const slide = SLIDES[page];

  const goTo = useCallback((next: number) => {
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setPage(next);
  }, []);

  const handleNext = useCallback(async () => {
    if (page < SLIDES.length - 1) {
      goTo(page + 1);
    } else {
      await AsyncStorage.setItem('onboarded', '1');
      router.replace('/(auth)/login');
    }
  }, [page, goTo]);

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem('onboarded', '1');
    router.replace('/(auth)/login');
  }, []);

  return (
    <LinearGradient
      colors={slide.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />

      {/* Decorative circles */}
      <View style={[styles.decCircle1, { backgroundColor: slide.accentLight }]} />
      <View style={[styles.decCircle2, { backgroundColor: slide.accentLight }]} />
      <View style={[styles.decCircle3, { backgroundColor: slide.accentLight }]} />

      {/* Skip */}
      {page < SLIDES.length - 1 && (
        <TouchableOpacity style={styles.skip} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const newPage = Math.round(e.nativeEvent.contentOffset.x / width);
          setPage(newPage);
        }}
        style={styles.scroll}
        scrollEnabled
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={styles.slide}>
            <Text style={styles.emoji}>{s.emoji}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <View style={[styles.dot, i === page ? styles.dotActive : styles.dotInactive]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* CTA button */}
        <TouchableOpacity style={styles.ctaBtn} onPress={handleNext} activeOpacity={0.88}>
          <Text style={styles.ctaText}>
            {page === SLIDES.length - 1 ? 'Get Started ✈️' : 'Next'}
          </Text>
        </TouchableOpacity>

        {/* Tagline */}
        {page === SLIDES.length - 1 && (
          <Text style={styles.tagline}>Your adventure starts now</Text>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Decorative background elements
  decCircle1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -80,
    right: -80,
  },
  decCircle2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    bottom: 180,
    left: -60,
  },
  decCircle3: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    bottom: 80,
    right: 40,
  },
  skip: {
    position: 'absolute',
    top: Spacing['4xl'],
    right: Spacing.xl,
    zIndex: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
  },
  skipText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  scroll: { flex: 1 },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing['3xl'],
    paddingTop: Spacing['4xl'],
    gap: Spacing.lg,
  },
  emoji: {
    fontSize: 72,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.extrabold,
    color: 'rgba(255,255,255,0.97)',
    lineHeight: 44,
  },
  body: {
    fontSize: FontSize.lg,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 26,
  },
  footer: {
    padding: Spacing['2xl'],
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  ctaBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.50)',
    borderRadius: Radius.xl,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: 'rgba(255,255,255,0.97)',
    letterSpacing: 0.3,
  },
  tagline: {
    textAlign: 'center',
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.55)',
    marginTop: -Spacing.sm,
  },
});
