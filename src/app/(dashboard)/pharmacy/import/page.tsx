import { Suspense } from 'react';
import { PharmacyWorkspace } from '@/components/pharmacy-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function PharmacyImportPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Import..." />}>
      <PharmacyWorkspace workspace="import" />
    </Suspense>
  );
}
