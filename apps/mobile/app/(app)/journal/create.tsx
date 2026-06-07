import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useCreateJournal } from '@/hooks/useJournals';
import { uploadPostPhotoFromUri } from '@/utils/storageUpload';
import { pickImageFromLibrary, resizeImage } from '@/utils/imageUtils';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const MAX_TITLE = 120;
const MAX_BODY = 10000;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function CreateJournalScreen() {
  const user = useAuthStore((s) => s.user);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [uploadingCover, setUploadingCover] = useState(false);

  const { create, creating } = useCreateJournal();

  const pickCover = useCallback(async () => {
    const uri = await pickImageFromLibrary();
    if (!uri) return;
    setCoverUri(uri);
  }, []);

  const addHashtag = useCallback(() => {
    const tag = hashtagInput.replace(/^#/, '').trim().toLowerCase();
    if (!tag || hashtags.includes(tag) || hashtags.length >= 20) return;
    setHashtags((prev) => [...prev, tag]);
    setHashtagInput('');
  }, [hashtagInput, hashtags]);

  const handlePublish = useCallback(async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please add a title for your journal.'); return; }
    if (!body.trim()) { Alert.alert('Content required', 'Please write your journal content.'); return; }
    if (!user) return;

    let coverImageURL: string | null = null;
    if (coverUri) {
      setUploadingCover(true);
      try {
        const { uri: resized } = await resizeImage(coverUri);
        coverImageURL = await uploadPostPhotoFromUri(user.uid, resized);
      } catch (e) {
        Alert.alert('Cover upload failed', (e as Error).message);
        setUploadingCover(false);
        return;
      }
      setUploadingCover(false);
    }

    const wordCount = countWords(body);
    const readTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    const journalId = await create({
      title: title.trim(),
      subtitle: subtitle.trim(),
      body: body.trim(),
      coverImageURL,
      images: [],
      location: location.trim(),
      country: country.trim(),
      tripId: null,
      hashtags,
      readTimeMinutes,
      visibility,
    });

    if (journalId) {
      router.replace(`/(app)/journal/${journalId}` as never);
    }
  }, [title, subtitle, body, coverUri, location, country, hashtags, visibility, user, create]);

  const isPublishing = uploadingCover || creating;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Journal</Text>
        <TouchableOpacity
          onPress={handlePublish}
          disabled={isPublishing}
          style={[styles.publishBtn, isPublishing && { opacity: 0.6 }]}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.publishText}>Publish</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          {/* ── Cover Image ── */}
          <TouchableOpacity style={styles.coverPicker} onPress={pickCover}>
            {coverUri ? (
              <Image source={{ uri: coverUri }} style={styles.coverPreview} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image-outline" size={36} color={Colors.border} />
                <Text style={styles.coverPlaceholderText}>Add cover image</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* ── Title ── */}
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={(t) => t.length <= MAX_TITLE && setTitle(t)}
            placeholder="Title your journey..."
            placeholderTextColor={Colors.placeholder}
            maxLength={MAX_TITLE}
          />

          <TextInput
            style={styles.subtitleInput}
            value={subtitle}
            onChangeText={setSubtitle}
            placeholder="A short subtitle (optional)"
            placeholderTextColor={Colors.placeholder}
          />

          {/* ── Location ── */}
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
              value={location}
              onChangeText={setLocation}
              placeholder="City / Place"
              placeholderTextColor={Colors.placeholder}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={country}
              onChangeText={setCountry}
              placeholder="Country"
              placeholderTextColor={Colors.placeholder}
            />
          </View>

          {/* ── Body ── */}
          <View style={styles.bodySection}>
            <Text style={styles.label}>Your Story</Text>
            <TextInput
              style={styles.bodyInput}
              value={body}
              onChangeText={(t) => t.length <= MAX_BODY && setBody(t)}
              placeholder="Write your travel story... Use blank lines between paragraphs."
              placeholderTextColor={Colors.placeholder}
              multiline
              maxLength={MAX_BODY}
              textAlignVertical="top"
            />
            <Text style={styles.wordCount}>{countWords(body)} words · ~{Math.max(1, Math.ceil(countWords(body) / 200))} min read</Text>
          </View>

          {/* ── Hashtags ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Hashtags</Text>
            <View style={styles.hashInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={hashtagInput}
                onChangeText={setHashtagInput}
                placeholder="#travel"
                placeholderTextColor={Colors.placeholder}
                onSubmitEditing={addHashtag}
                returnKeyType="done"
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.addTagBtn} onPress={addHashtag}>
                <Ionicons name="add" size={20} color={Colors.white} />
              </TouchableOpacity>
            </View>
            {hashtags.length > 0 && (
              <View style={styles.tagRow}>
                {hashtags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={styles.tag}
                    onPress={() => setHashtags((h) => h.filter((t) => t !== tag))}
                  >
                    <Text style={styles.tagText}>#{tag}</Text>
                    <Ionicons name="close" size={12} color={Colors.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* ── Visibility ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Visibility</Text>
            <View style={styles.visRow}>
              {(['public', 'private'] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.visChip, visibility === v && styles.visChipActive]}
                  onPress={() => setVisibility(v)}
                >
                  <Ionicons
                    name={v === 'public' ? 'globe-outline' : 'lock-closed-outline'}
                    size={14}
                    color={visibility === v ? Colors.white : Colors.textSecondary}
                  />
                  <Text style={[styles.visText, visibility === v && { color: Colors.white }]}>
                    {v === 'public' ? 'Public' : 'Private'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  publishBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  publishText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  body: { padding: Spacing['2xl'], gap: Spacing.lg },
  coverPicker: {
    width: '100%',
    height: 180,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.borderLight,
  },
  coverPreview: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: Radius.xl,
  },
  coverPlaceholderText: { fontSize: FontSize.sm, color: Colors.placeholder },
  titleInput: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: Spacing.sm,
  },
  subtitleInput: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: Spacing.sm,
  },
  row: { flexDirection: 'row' },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    height: 46,
  },
  bodySection: {},
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  bodyInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    minHeight: 240,
    textAlignVertical: 'top',
    lineHeight: 24,
  },
  wordCount: { fontSize: FontSize.xs, color: Colors.placeholder, textAlign: 'right', marginTop: 4 },
  section: {},
  hashInputRow: { flexDirection: 'row', gap: Spacing.sm },
  addTagBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  tagText: { fontSize: FontSize.sm, color: Colors.primary },
  visRow: { flexDirection: 'row', gap: Spacing.md },
  visChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  visChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  visText: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
