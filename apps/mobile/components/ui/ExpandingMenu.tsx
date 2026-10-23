import { useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { Colors, FontSize, FontWeight, Motion, Radius, Shadow, Spacing, TapTarget } from '@/constants/theme';
import { isReducedMotion } from '@/hooks/useReducedMotion';

export interface MenuAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

interface Props {
  actions: MenuAction[];
  /** Accessible name of the button that opens the menu. */
  label?: string;
}

/**
 * Round "+" button that opens a small menu of actions with a short spring. The button keeps its place; the menu sits in
 * its own window above everything, closes on a tap outside or the back gesture, and ignores repeated taps while it
 * opens or closes so an action cannot be triggered twice.
 */
export function ExpandingMenu({ actions, label = 'Create' }: Props) {
  const [open, setOpen] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const show = () => {
    closing.current = false;
    setOpen(true);
    if (isReducedMotion()) { progress.setValue(1); return; }
    progress.setValue(0);
    Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: Motion.spring.damping, stiffness: Motion.spring.stiffness, mass: Motion.spring.mass }).start();
  };
  const hide = (then?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    const done = () => { setOpen(false); then?.(); };
    if (isReducedMotion()) { progress.setValue(0); done(); return; }
    Animated.timing(progress, { toValue: 0, duration: Motion.fast, useNativeDriver: true }).start(done);
  };

  return (
    <>
      <PressableScale
        onPress={show}
        guardMs={400}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        style={styles.trigger}
        hitSlop={6}
      >
        <Ionicons name="add" size={24} color={Colors.white} />
      </PressableScale>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => hide()} statusBarTranslucent>
        <Pressable style={styles.backdrop} onPress={() => hide()} accessibilityLabel="Close menu" accessibilityRole="button" />
        <Animated.View
          style={[styles.menu, { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] }]}
        >
          {actions.map((a, i) => (
            <PressableScale
              key={a.key}
              guardMs={500}
              onPress={() => hide(a.onPress)}
              accessibilityRole="menuitem"
              accessibilityLabel={a.label}
              style={[styles.item, i > 0 && styles.itemDivider]}
            >
              <View style={styles.itemIcon}><Ionicons name={a.icon} size={20} color={Colors.primaryDark} /></View>
              <Text style={styles.itemLabel}>{a.label}</Text>
            </PressableScale>
          ))}
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: TapTarget,
    height: TapTarget,
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.overlay },
  menu: {
    position: 'absolute',
    top: 96,
    right: Spacing.lg,
    minWidth: 220,
    maxWidth: '86%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.xs,
    ...Shadow.lg,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, minHeight: 52 },
  itemDivider: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  itemIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, flexShrink: 1 },
});
