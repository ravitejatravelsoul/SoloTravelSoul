import { useState, useCallback } from 'react';
import { pickImageFromLibrary, pickImageFromCamera, resizeAndBlob } from '@/utils/imageUtils';

type UploadStatus = 'idle' | 'picking' | 'processing' | 'uploading' | 'done' | 'error';
type ImageSource = 'library' | 'camera';

interface UseUploadOptions {
  uploadFn: (blob: Blob) => Promise<string>;
  onSuccess?: (url: string) => void;
  onError?: (message: string) => void;
  maxSizeMB?: number;
  source?: ImageSource;
}

const MAX_SIZE_DEFAULT = 5;

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

    const uri = source === 'camera'
      ? await pickImageFromCamera()
      : await pickImageFromLibrary();

    if (!uri) {
      setStatus('idle');
      return;
    }

    setPreviewUri(uri);
    setStatus('processing');

    let blob: Blob;
    try {
      blob = await resizeAndBlob(uri);
    } catch {
      const msg = 'Could not process image.';
      setErrorMessage(msg);
      setStatus('error');
      onError?.(msg);
      return;
    }

    const sizeMB = blob.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      const msg = `Image must be under ${maxSizeMB}MB.`;
      setErrorMessage(msg);
      setStatus('error');
      onError?.(msg);
      return;
    }

    setStatus('uploading');
    try {
      const url = await uploadFn(blob);
      setStatus('done');
      onSuccess?.(url);
    } catch {
      const msg = 'Upload failed. Please try again.';
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
