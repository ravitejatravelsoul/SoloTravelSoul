import { useLocalSearchParams, router } from 'expo-router';
import { ReportModal } from '@/components/community/ReportModal';

export default function ReportScreen() {
  const { targetType, targetId } = useLocalSearchParams<{ targetType: string; targetId: string }>();

  return (
    <ReportModal
      visible
      targetType={(targetType ?? 'user') as 'user' | 'trip' | 'group' | 'message'}
      targetId={targetId ?? ''}
      onClose={() => router.back()}
    />
  );
}
