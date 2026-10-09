import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@/components/ui';
import { useCreatePost } from '@/hooks/usePosts';
import { uploadPostPhotoFromUri } from '@/utils/storageUpload';
import { pickImageFromLibrary, resizeImage } from '@/utils/imageUtils';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { PostType } from '@solotravelsoul/shared';

const POST_TYPES: Array<{ type: PostType; label: string; icon: string }> = [
  { type: 'photo', label: 'Photo', icon: 'camera' },
  { type: 'hidden_gem', label: 'Hidden Gem', icon: 'diamond' },
  { type: 'food', label: 'Food', icon: 'restaurant' },
  { type: 'hotel', label: 'Hotel', icon: 'bed' },
  { type: 'memory', label: 'Memory', icon: 'albums' },
];

const MAX_IMAGES = 10;
const MAX_CAPTION = 500;
const MAX_HASHTAGS = 20;

export default function CreatePostScreen() {
  const user = useAuthStore((s) => s.user);
  const [images, setImages] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [postType, setPostType] = useState<PostType>('photo');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [uploading, setUploading] = useState(false);

  const { create, creating } = useCreatePost();

  const pickImage = useCallback(async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert('Maximum photos', `You can add up to ${MAX_IMAGES} photos.`);
      return;
    }
    const uri = await pickImageFromLibrary();
    if (!uri) return;
    setImages((prev) => [...prev, uri]);
  }, [images.length]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addHashtag = useCallback(() => {
    const tag = hashtagInput.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!tag || hashtags.includes(tag) || hashtags.length >= MAX_HASHTAGS) return;
    setHashtags((prev) => [...prev, tag]);
    setHashtagInput('');
  }, [hashtagInput, hashtags]);

  const handlePost = useCallback(async () => {
    if (!caption.trim() && images.length === 0) {
      Alert.alert('Add content', 'Please add at least a photo or caption.');
      return;
    }
    if (!user) return;

    setUploading(true);
    let uploadedUrls: string[] = [];
    try {
      uploadedUrls = await Promise.all(
        images.map(async (uri) => {
          const { uri: resized } = await resizeImage(uri);
          return uploadPostPhotoFromUri(user.uid, resized);
        })
      );
    } catch (e) {
      Alert.alert('Upload failed', (e as Error).message);
      setUploading(false);
      return;
    }

    const postId = await create({
      caption: caption.trim(),
      location: location.trim(),
      country: country.trim(),
      images: uploadedUrls,
      hashtags,
      postType: images.length > 1 ? 'carousel' : postType,
      visibility,
    });

    setUploading(false);

    if (postId) {
      // This screen stays mounted after navigating away; start the next post empty.
      setImages([]);
      setCaption('');
      setLocation('');
      setCountry('');
      setHashtagInput('');
      setHashtags([]);
      setPostType('photo');
      setVisibility('public');
      router.replace(`/(app)/post/${postId}` as never);
    } else {
      // e.g. refused by the rules (suspended account, blocked terms): keep the draft and say so.
      Alert.alert('Post not shared', 'Your post could not be shared. Please try again later.');
    }
  }, [caption, images, location, country, hashtags, postType, visibility, user, create]);

  const isPosting = uploading || creating;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={isPosting}
          style={[styles.shareBtn, isPosting && styles.shareBtnDisabled]}
        >
          {isPosting ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.shareBtnText}>Share</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

          {/* ── Photos ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Photos ({images.length}/{MAX_IMAGES})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
              {images.map((uri, i) => (
                <View key={i} style={styles.thumbWrap}>
                  <Image source={{ uri }} style={styles.thumb} />
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(i)}>
                    <Ionicons name="close-circle" size={20} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <TouchableOpacity style={styles.addPhoto} onPress={pickImage}>
                  <Ionicons name="add-circle-outline" size={32} color={Colors.primary} />
                  <Text style={styles.addPhotoText}>Add</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* ── Caption ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Caption</Text>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={(t) => t.length <= MAX_CAPTION && setCaption(t)}
              placeholder="Share your travel story..."
              placeholderTextColor={Colors.placeholder}
              multiline
              maxLength={MAX_CAPTION}
            />
            <Text style={styles.charCount}>{caption.length}/{MAX_CAPTION}</Text>
          </View>

          {/* ── Location ── */}
          <View style={styles.row}>
            <View style={[styles.section, { flex: 1, marginRight: Spacing.sm }]}>
              <Text style={styles.label}>City / Place</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="e.g. Santorini"
                placeholderTextColor={Colors.placeholder}
              />
            </View>
            <View style={[styles.section, { flex: 1 }]}>
              <Text style={styles.label}>Country</Text>
              <TextInput
                style={styles.input}
                value={country}
                onChangeText={setCountry}
                placeholder="e.g. Greece"
                placeholderTextColor={Colors.placeholder}
              />
            </View>
          </View>

          {/* ── Post Type ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Post Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
              {POST_TYPES.map(({ type, label, icon }) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, postType === type && styles.typeChipActive]}
                  onPress={() => setPostType(type)}
                >
                  <Ionicons
                    name={icon as never}
                    size={14}
                    color={postType === type ? Colors.white : Colors.textSecondary}
                  />
                  <Text style={[styles.typeChipText, postType === type && styles.typeChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ── Hashtags ── */}
          <View style={styles.section}>
            <Text style={styles.label}>Hashtags</Text>
            <View style={styles.hashtagInputRow}>
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
              {(['public', 'followers'] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.visChip, visibility === v && styles.visChipActive]}
                  onPress={() => setVisibility(v)}
                >
                  <Ionicons
                    name={v === 'public' ? 'globe-outline' : 'people-outline'}
                    size={14}
                    color={visibility === v ? Colors.white : Colors.textSecondary}
                  />
                  <Text style={[styles.visText, visibility === v && styles.visTextActive]}>
                    {v === 'public' ? 'Everyone' : 'Followers'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

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
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  shareBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  body: { padding: Spacing['2xl'], gap: Spacing.lg },
  section: {},
  row: { flexDirection: 'row' },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  imageRow: { flexDirection: 'row' },
  thumbWrap: { position: 'relative', marginRight: Spacing.sm },
  thumb: { width: 80, height: 80, borderRadius: Radius.md, backgroundColor: Colors.borderLight },
  removeBtn: { position: 'absolute', top: -6, right: -6 },
  addPhoto: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: { fontSize: FontSize.xs, color: Colors.primary },
  captionInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.placeholder,
    textAlign: 'right',
    marginTop: 4,
  },
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
  typeRow: { flexDirection: 'row' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  typeChipTextActive: { color: Colors.white, fontWeight: FontWeight.semibold },
  hashtagInputRow: { flexDirection: 'row', gap: Spacing.sm },
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
  visTextActive: { color: Colors.white, fontWeight: FontWeight.semibold },
});
