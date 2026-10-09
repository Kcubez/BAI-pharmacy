import { Suspense } from 'react';
import { ProductSalesWorkspace } from '@/components/product-sales-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function SalesPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Sales..." />}>
      <ProductSalesWorkspace workspace="sales" />
    </Suspense>
  );
}
