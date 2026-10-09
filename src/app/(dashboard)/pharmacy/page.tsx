import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacyOverviewPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading CEO Overview..." />}>
      <PharmacyWorkspace workspace="overview" />
    </Suspense>
  );
}
