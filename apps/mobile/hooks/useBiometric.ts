import { useCallback, useEffect, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';

export function useBiometric() {
  const [supported, setSupported] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const saved = await LocalAuthentication.isEnrolledAsync();
      setSupported(compatible);
      setEnrolled(saved);
    })();
  }, []);

  const authenticate = useCallback(
    async (promptMessage = 'Confirm your identity'): Promise<boolean> => {
      if (!supported || !enrolled) return false;
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Use password',
        disableDeviceFallback: false,
      });
      return result.success;
    },
    [supported, enrolled]
  );

  return { supported, enrolled, authenticate };
}
