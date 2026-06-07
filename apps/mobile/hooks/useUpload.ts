import { useState, useCallback } from 'react';
import { pickImageFromLibrary, pickImageFromCamera, resizeImage } from '@/utils/imageUtils';

type UploadStatus = 'idle' | 'picking' | 'processing' | 'uploading' | 'done' | 'error';
type ImageSource = 'library' | 'camera';

interface UseUploadOptions {
  // Receives the local file:// URI of the resized image — not a Blob.
  uploadFn: (uri: string) => Promise<string>;
  onSuccess?: (url: string) => void;
  onError?: (message: string) => void;
  maxSizeMB?: number;
  source?: ImageSource;
}

const MAX_SIZE_DEFAULT = 5;

function storageErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  const message = (err as { message?: string }).message ?? '';
  if (__DEV__) console.error('[useUpload] upload error — code:', code, '| message:', message);

  // Codes thrown by storageUpload.ts with already-friendly messages
  if (
    code === 'storage/billing-not-enabled' ||
    code === 'upload/disabled' ||
    code === 'auth/expired' ||
    code === 'upload/too-large' ||
    code === 'upload/unsupported-type' ||
    code === 'upload/server-error'
  ) {
    return message;
  }

  // Firebase Storage SDK error codes
  if (code.includes('unauthorized') || code.includes('permission-denied')) {
    return 'Storage permission denied. Check Firebase Storage rules.';
  }
  if (code.includes('bucket') || code.includes('not-found')) {
    return 'Storage bucket not found. Check Firebase Storage configuration.';
  }
  if (code.includes('network') || code.includes('unavailable')) {
    return 'Network error. Check your connection and try again.';
  }
  if (code.includes('canceled')) {
    return 'Upload cancelled. Please try again.';
  }
  if (message.includes('quota') || code.includes('quota')) {
    return 'Storage quota exceeded.';
  }
  return 'Upload failed. Please try again.';
}

export function useUpload({
  uploadFn,
  onSuccess,
  onError,
  maxSizeMB = MAX_SIZE_DEFAULT,
  source = 'library',
}: UseUploadOptions) {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const trigger = useCallback(async () => {
    setStatus('picking');
    setErrorMessage(null);

    if (__DEV__) console.log('[useUpload] trigger started, source:', source);

    const pickedUri = source === 'camera'
      ? await pickImageFromCamera()
      : await pickImageFromLibrary();

    if (!pickedUri) {
      if (__DEV__) console.log('[useUpload] no URI returned — picker cancelled or permission denied');
      setStatus('idle');
      return;
    }

    if (__DEV__) console.log('[useUpload] picker returned URI, starting processing');
    setPreviewUri(pickedUri);
    setStatus('processing');

    let fileUri: string;
    let approxBytes: number;
    try {
      const result = await resizeImage(pickedUri);
      fileUri = result.uri;
      approxBytes = result.approxBytes;
      if (__DEV__) console.log('[useUpload] resize done, approx KB:', Math.round(approxBytes / 1024));
    } catch (err: unknown) {
      const detail = (err as Error).message ?? 'unknown';
      if (__DEV__) console.error('[useUpload] resizeImage failed:', detail);
      const msg = `Could not process image: ${detail}`;
      setErrorMessage(msg);
      setStatus('error');
      onError?.(msg);
      return;
    }

    const sizeMB = approxBytes / (1024 * 1024);
    if (__DEV__) console.log('[useUpload] approx size MB:', sizeMB.toFixed(2));
    if (sizeMB > maxSizeMB) {
      const msg = `Image must be under ${maxSizeMB}MB (got ${sizeMB.toFixed(1)}MB).`;
      if (__DEV__) console.warn('[useUpload] image too large:', msg);
      setErrorMessage(msg);
      setStatus('error');
      onError?.(msg);
      return;
    }

    if (__DEV__) console.log('[useUpload] starting upload...');
    setStatus('uploading');
    try {
      const url = await uploadFn(fileUri);
      if (__DEV__) console.log('[useUpload] upload succeeded');
      setStatus('done');
      onSuccess?.(url);
    } catch (err: unknown) {
      const msg = storageErrorMessage(err);
      setErrorMessage(msg);
      setStatus('error');
      onError?.(msg);
    }
  }, [uploadFn, onSuccess, onError, maxSizeMB, source]);

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorMessage(null);
    setPreviewUri(null);
  }, []);

  return {
    status,
    errorMessage,
    previewUri,
    trigger,
    reset,
    isLoading: status === 'picking' || status === 'processing' || status === 'uploading',
    isDone: status === 'done',
    isError: status === 'error',
  };
}
