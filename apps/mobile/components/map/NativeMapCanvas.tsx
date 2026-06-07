import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

// ── Public types ──────────────────────────────────────────────────────

export interface NativeMapPin {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  color: string;
  label?: string; // text rendered inside the circle (day number etc.)
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

interface Props {
  pins: NativeMapPin[];
  userLocation?: UserLocation | null;
  onPinTap?: (pin: NativeMapPin) => void;
  showConnections?: boolean; // draw route lines between pins in label order
}

// ── Constants ─────────────────────────────────────────────────────────

const EDGE_PAD = 0.13;      // 13 % padding each side before pin projection
const PIN_SIZE = 18;         // unlabelled pin diameter
const PIN_SIZE_LABELED = 26; // day-number pin diameter
const USER_DOT = 14;         // user location dot diameter
const LINE_H = 1.5;          // connection line thickness
const GRID_COLOR = 'rgba(48,90,155,0.07)';
const LINE_COLOR = 'rgba(18,112,194,0.20)';
const BG = ['#EDF2F8', '#E2EBF4'] as const;
const GRID_FRACS = [0.25, 0.5, 0.75];

// ── Coordinate helpers ────────────────────────────────────────────────

interface Bounds {
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
}

function computeBounds(pins: NativeMapPin[]): Bounds | null {
  if (pins.length === 0) return null;
  const lats = pins.map(p => p.latitude);
  const lngs = pins.map(p => p.longitude);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  // Expand degenerate (single-point or clustered) bounds to give a visible spread
  if (maxLat - minLat < 0.01) { minLat -= 0.5; maxLat += 0.5; }
  if (maxLng - minLng < 0.01) { minLng -= 0.5; maxLng += 0.5; }
  return { minLat, maxLat, minLng, maxLng };
}

function projectPt(
  lat: number, lng: number,
  b: Bounds, w: number, h: number,
): { x: number; y: number } {
  const px = w * EDGE_PAD, py = h * EDGE_PAD;
  const uw = w - 2 * px, uh = h - 2 * py;
  return {
    x: (lng - b.minLng) / (b.maxLng - b.minLng) * uw + px,
    y: (b.maxLat - lat) / (b.maxLat - b.minLat) * uh + py,
  };
}

interface LineStyle {
  position: 'absolute';
  left: number; top: number;
  width: number; height: number;
  transform: { rotate: string }[];
}

function connLineStyle(ax: number, ay: number, bx: number, by: number): LineStyle {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const deg = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    position: 'absolute',
    left: (ax + bx) / 2 - len / 2,
    top: (ay + by) / 2 - LINE_H / 2,
    width: len,
    height: LINE_H,
    transform: [{ rotate: `${deg}deg` }],
  };
}

// ── Component ─────────────────────────────────────────────────────────

interface Projected { pin: NativeMapPin; x: number; y: number; }

export function NativeMapCanvas({ pins, userLocation, onPinTap, showConnections }: Props) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setDims({ w: width, h: height });
  }, []);

  const bounds = useMemo(() => computeBounds(pins), [pins]);

  const projected = useMemo((): Projected[] => {
    if (!bounds || dims.w === 0) return [];
    return pins.map(pin => ({ pin, ...projectPt(pin.latitude, pin.longitude, bounds, dims.w, dims.h) }));
  }, [pins, bounds, dims]);

  const userDotPos = useMemo(() => {
    if (!userLocation || !bounds || dims.w === 0) return null;
    const pos = projectPt(userLocation.latitude, userLocation.longitude, bounds, dims.w, dims.h);
    if (pos.x < -24 || pos.x > dims.w + 24 || pos.y < -24 || pos.y > dims.h + 24) return null;
    return pos;
  }, [userLocation, bounds, dims]);

  // Connection lines — sorted by label (day number) for trip maps
  const lines = useMemo(() => {
    if (!showConnections || projected.length < 2) return [];
    const sorted = [...projected].sort((a, b) => {
      const na = a.pin.label ? parseInt(a.pin.label, 10) : 0;
      const nb = b.pin.label ? parseInt(b.pin.label, 10) : 0;
      return na - nb;
    });
    return sorted.slice(0, -1).map((p, i) => ({
      key: `ln_${i}`,
      style: connLineStyle(p.x, p.y, sorted[i + 1].x, sorted[i + 1].y),
    }));
  }, [projected, showConnections]);

  const handlePinPress = useCallback((pin: NativeMapPin) => {
    setSelectedId(pin.id);
    onPinTap?.(pin);
  }, [onPinTap]);

  return (
    <View style={styles.root} onLayout={handleLayout}>

      {/* Background gradient — map-style pale blue */}
      <LinearGradient colors={BG} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* Lat/lng grid lines */}
      {dims.h > 0 && GRID_FRACS.map(f => (
        <View key={`gh${f}`} style={[styles.gridH, { top: dims.h * f }]} />
      ))}
      {dims.w > 0 && GRID_FRACS.map(f => (
        <View key={`gv${f}`} style={[styles.gridV, { left: dims.w * f }]} />
      ))}

      {/* Route lines (trip map) */}
      {lines.map(l => (
        <View key={l.key} style={[styles.connLine, l.style]} />
      ))}

      {/* User location dot */}
      {userDotPos && (
        <View style={[styles.userDot, {
          left: userDotPos.x - USER_DOT / 2,
          top: userDotPos.y - USER_DOT / 2,
        }]} />
      )}

      {/* Pin markers */}
      {projected.map(({ pin, x, y }) => {
        const sz = pin.label ? PIN_SIZE_LABELED : PIN_SIZE;
        const half = sz / 2;
        const active = selectedId === pin.id;
        return (
          <TouchableOpacity
            key={pin.id}
            activeOpacity={0.75}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            onPress={() => handlePinPress(pin)}
            style={[
              styles.pin,
              {
                left: x - half,
                top: y - half,
                width: sz,
                height: sz,
                borderRadius: half,
                backgroundColor: pin.color,
                borderWidth: active ? 3 : 2,
              },
            ]}
          >
            {pin.label ? <Text style={styles.pinLabel}>{pin.label}</Text> : null}
          </TouchableOpacity>
        );
      })}

      {/* Preview badge — bottom-left, unobtrusive */}
      {pins.length > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {pins.length} pin{pins.length !== 1 ? 's' : ''} · Map preview
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: GRID_COLOR,
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: GRID_COLOR,
  },
  connLine: {
    backgroundColor: LINE_COLOR,
  },
  userDot: {
    position: 'absolute',
    width: USER_DOT,
    height: USER_DOT,
    borderRadius: USER_DOT / 2,
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadow.sm,
  },
  pin: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: Colors.white,
    ...Shadow.sm,
  },
  pinLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: 13,
    includeFontPadding: false,
  },
  badge: {
    position: 'absolute',
    bottom: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeText: {
    fontSize: FontSize.xs - 1,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
