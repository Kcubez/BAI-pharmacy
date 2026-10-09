import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacySalesPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Sales Analysis..." />}>
      <PharmacyWorkspace workspace="sales" />
    </Suspense>
  );
}
