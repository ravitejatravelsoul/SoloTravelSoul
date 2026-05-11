import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  searchUserByEmail,
  getOrCreateDirectChat,
} from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import type { UserLookup } from '@solotravelsoul/shared';

export default function NewChatScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [email, setEmail] = useState('');
  const [result, setResult] = useState<UserLookup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (trimmed === user?.email?.toLowerCase()) {
      setError("That's your own email address.");
      return;
    }

    setSearching(true);
    setResult(null);
    setNotFound(false);
    setError(null);

    try {
      const found = await searchUserByEmail(trimmed);
      if (found) {
        setResult(found);
      } else {
        setNotFound(true);
      }
    } catch {
      setError('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  }, [email, user?.email]);

  const handleStartChat = useCallback(async () => {
    if (!result || !user) return;
    setStarting(true);
    try {
      const myName = profile?.name ?? user.email ?? 'Traveler';
      const myInitials = getUserInitials(myName) || myName[0]?.toUpperCase() || 'T';
      const chatId = await getOrCreateDirectChat(
        user.uid,
        { name: myName, initials: myInitials },
        result.uid,
        { name: result.displayName, initials: result.initials },
      );
      router.replace(`/chats/${chatId}`);
    } catch {
      setError('Could not start chat. Please try again.');
      setStarting(false);
    }
  }, [result, user, profile, router]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>New Message</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Find by email address</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(t) => { setEmail(t); setResult(null); setNotFound(false); setError(null); }}
            placeholder="fellow@explorer.com"
            placeholderTextColor={Colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={[styles.searchBtn, searching && styles.searchBtnLoading]}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching
              ? <ActivityIndicator color={Colors.white} size="small" />
              : <Ionicons name="search" size={20} color={Colors.white} />
            }
          </TouchableOpacity>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {notFound && (
          <View style={styles.notFound}>
            <Text style={styles.notFoundText}>No account found with that email.</Text>
            <Text style={styles.notFoundSub}>They need to have the app installed and signed in.</Text>
          </View>
        )}

        {result && (
          <View style={styles.resultCard}>
            <View style={styles.resultAvatar}>
              <Text style={styles.resultInitials}>{result.initials}</Text>
            </View>
            <View style={styles.resultInfo}>
              <Text style={styles.resultName}>{result.displayName}</Text>
              <Text style={styles.resultEmail}>{result.email}</Text>
            </View>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={handleStartChat}
              disabled={starting}
            >
              {starting
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={styles.startBtnText}>Chat</Text>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  body: { padding: Spacing.lg, gap: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  searchRow: { flexDirection: 'row', gap: Spacing.sm },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  searchBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnLoading: { opacity: 0.7 },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginTop: -4 },
  notFound: { padding: Spacing.lg, alignItems: 'center' },
  notFoundText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  notFoundSub: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  resultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInitials: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.md },
  resultInfo: { flex: 1 },
  resultName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  resultEmail: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  startBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 64,
    alignItems: 'center',
  },
  startBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
});
