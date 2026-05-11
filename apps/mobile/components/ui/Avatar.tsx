import { useState } from 'react';
import {
  View,
  Image,
  Text as RNText,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontWeight, Radius } from '@/constants/theme';

interface AvatarProps {
  uri?: string | null;
  initials: string;
  size?: number;
  onPress?: () => void;
  showEditBadge?: boolean;
  loading?: boolean;
}

export function Avatar({
  uri,
  initials,
  size = 80,
  onPress,
  showEditBadge = false,
  loading = false,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = !!uri && !imgError;

  const fontSize = Math.round(size * 0.35);
  const lineHeight = Math.round(size * 0.42);

  const inner = (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.white} />
      ) : showImage ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          onError={() => setImgError(true)}
        />
      ) : (
        <RNText
          style={[
            styles.initials,
            { fontSize, lineHeight },
          ]}
        >
          {initials}
        </RNText>
      )}

      {showEditBadge && !loading && (
        <View
          style={[
            styles.badge,
            {
              width: Math.max(20, size * 0.28),
              height: Math.max(20, size * 0.28),
              borderRadius: size * 0.14,
              bottom: 0,
              right: 0,
            },
          ]}
        >
          <Ionicons name="camera" size={Math.max(10, size * 0.15)} color={Colors.white} />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: Colors.white,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  badge: {
    position: 'absolute',
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
});
