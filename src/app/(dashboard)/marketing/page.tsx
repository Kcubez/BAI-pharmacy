import { Suspense } from 'react';
import { ProductSalesWorkspace } from '@/components/product-sales-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function MarketingPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Marketing..." />}>
      <ProductSalesWorkspace workspace="marketing" />
    </Suspense>
  );
}
