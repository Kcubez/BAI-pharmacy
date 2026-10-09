import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacyInventoryPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Inventory..." />}>
      <PharmacyWorkspace workspace="inventory" />
    </Suspense>
  );
}
