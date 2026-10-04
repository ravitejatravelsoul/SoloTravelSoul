import { useLocalSearchParams, router } from 'expo-router';
import { ReportModal } from '@/components/community/ReportModal';
import type { ReportTargetType } from '@solotravelsoul/shared';

export default function ReportScreen() {
  const { targetType, targetId } = useLocalSearchParams<{ targetType: string; targetId: string }>();

  return (
    <ReportModal
      visible
      targetType={(targetType ?? 'user') as ReportTargetType}
      targetId={targetId ?? ''}
      onClose={() => router.back()}
    />
  );
}
