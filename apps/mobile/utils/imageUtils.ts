import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

// Uses the system photo picker (Android Photo Picker / iOS PHPicker), which
// needs no media-library permission. Google Play's Photo and Video Permissions
// policy forbids READ_MEDIA_IMAGES for apps that only pick occasional photos.
export async function pickImageFromLibrary(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    // expo-image-picker 17.x (Expo SDK 54): use string array instead of deprecated MediaTypeOptions
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    if (__DEV__) console.log('[ImagePicker] selection cancelled or no asset');
    return null;
  }

  const uri = result.assets[0].uri;
  if (__DEV__) console.log('[ImagePicker] selected uri (truncated):', uri.slice(0, 60) + '...');
  return uri;
}

export async function pickImageFromCamera(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (__DEV__) console.log('[ImagePicker] camera permission status:', status);
  if (status !== 'granted') {
    if (__DEV__) console.warn('[ImagePicker] camera permission denied');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    if (__DEV__) console.log('[ImagePicker] camera cancelled or no asset');
    return null;
  }

  const uri = result.assets[0].uri;
  if (__DEV__) console.log('[ImagePicker] camera uri (truncated):', uri.slice(0, 60) + '...');
  return uri;
}

export interface ResizedImageResult {
  // Local file:// URI written by ImageManipulator — pass directly to
  // FileSystem.uploadAsync so no JS Blob/ArrayBuffer is ever created.
  uri: string;
  approxBytes: number;
  contentType: 'image/jpeg';
}

// Resize + compress the image and return a local file URI to the result.
//
// WHY return uri instead of base64:
//   Both firebase/storage uploadString() AND the old Blob path internally call
//   `new Blob([Uint8Array])` inside the Firebase JS SDK, which throws
//   "Creating blobs from ArrayBufferView are not supported" on iOS Expo Go.
//   Returning the file:// URI lets the caller use FileSystem.uploadAsync(),
//   which delegates file reading and HTTP to iOS URLSession — zero Blob involved.
export async function resizeImage(uri: string): Promise<ResizedImageResult> {
  if (__DEV__) console.log('[ImageUtils] resizeImage started, uri length:', uri.length);

  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION, height: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  // base64 is requested only to estimate size; the uri is what gets uploaded.
  const base64 = manipulated.base64;
  if (!base64 || base64.length === 0) {
    throw new Error('ImageManipulator returned no data');
  }

  const approxBytes = Math.round(base64.length * 0.75);
  if (__DEV__) console.log('[ImageUtils] resized uri:', manipulated.uri.slice(0, 60), 'approx KB:', Math.round(approxBytes / 1024));

  return { uri: manipulated.uri, approxBytes, contentType: 'image/jpeg' };
}
