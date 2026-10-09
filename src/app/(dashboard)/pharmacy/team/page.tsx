import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacyTeamPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Team KPI..." />}>
      <PharmacyWorkspace workspace="team" />
    </Suspense>
  );
}
