import { Suspense } from 'react';
import { ProductSalesWorkspace } from '@/components/product-sales-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function CustomerServicePage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Customer Service..." />}>
      <ProductSalesWorkspace workspace="customers" />
    </Suspense>
  );
}
