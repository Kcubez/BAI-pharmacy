import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacyArPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading AR Aging..." />}>
      <PharmacyWorkspace workspace="ar" />
    </Suspense>
  );
}
