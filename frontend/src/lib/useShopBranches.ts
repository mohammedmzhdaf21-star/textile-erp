import { useEffect, useState } from 'react';
import { getSalesBranches, getShopBranches, type ShopBranch } from './inventoryCodes';

function snapshot(includeStorage: boolean): ShopBranch[] {
  return (includeStorage ? getShopBranches() : getSalesBranches()).map((branch) => ({ ...branch }));
}

export function useShopBranches(includeStorage = false) {
  const [branches, setBranches] = useState<ShopBranch[]>(() => snapshot(includeStorage));

  useEffect(() => {
    const sync = () => setBranches(snapshot(includeStorage));
    window.addEventListener('shop-branches-updated', sync);
    return () => window.removeEventListener('shop-branches-updated', sync);
  }, [includeStorage]);

  return branches;
}
