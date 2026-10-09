import { Suspense } from 'react';
import { ProductSalesWorkspace } from '@/components/product-sales-workspace';
import { PageLoadingState } from '@/components/page-loading-state';

export default function InventoryPage() {
  return (
    <Suspense fallback={<PageLoadingState label="Loading Inventory..." />}>
      <ProductSalesWorkspace workspace="inventory" />
    </Suspense>
  );
}
