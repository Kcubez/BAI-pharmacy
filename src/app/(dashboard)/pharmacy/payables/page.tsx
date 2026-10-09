import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacyPayablesPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Payables..." />}>
      <PharmacyWorkspace workspace="payables" />
    </Suspense>
  );
}
