import { Suspense } from 'react';
import { ProductSalesWorkspace } from '@/components/product-sales-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function FinancePage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Finance..." />}>
      <ProductSalesWorkspace workspace="finance" />
    </Suspense>
  );
}
