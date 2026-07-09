export type PackageComponent = {
  name: string;
  countPerPackage: number;
};

export type PackageComponentSold = {
  name: string;
  quantity: number;
};

export const parsePackageComponents = (value: unknown): PackageComponent[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      name: String((entry as PackageComponent)?.name ?? '').trim(),
      countPerPackage: Math.max(
        1,
        Math.floor(Number((entry as PackageComponent)?.countPerPackage) || 1)
      ),
    }))
    .filter((entry) => entry.name.length > 0);
};

export const parsePackageComponentStock = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const stock: Record<string, number> = {};
  for (const [name, qty] of Object.entries(value as Record<string, unknown>)) {
    const quantity = Math.floor(Number(qty) || 0);
    if (quantity > 0) stock[name] = quantity;
  }
  return stock;
};

export const buildPackageComponentStock = (
  components: PackageComponent[],
  packageCount: number
): Record<string, number> => {
  const stock: Record<string, number> = {};
  const packages = Math.max(0, Math.floor(packageCount));
  for (const component of components) {
    stock[component.name] = (stock[component.name] ?? 0) + component.countPerPackage * packages;
  }
  return stock;
};

export const resolvePackageComponentStock = (input: {
  packageComponents: unknown;
  packageComponentStock: unknown;
  quantity: number;
}): Record<string, number> => {
  const parsedStock = parsePackageComponentStock(input.packageComponentStock);
  if (Object.keys(parsedStock).length > 0) return parsedStock;

  const components = parsePackageComponents(input.packageComponents);
  if (components.length === 0) return {};
  return buildPackageComponentStock(components, input.quantity);
};

export const countCompletePackages = (
  components: PackageComponent[],
  stock: Record<string, number>
): number => {
  if (components.length === 0) return 0;
  return Math.min(
    ...components.map((component) =>
      Math.floor((stock[component.name] ?? 0) / component.countPerPackage)
    )
  );
};

export const formatPackageStockSummary = (stock: Record<string, number>) =>
  Object.entries(stock)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => `${quantity}× ${name}`)
    .join(', ');

export const validateFullPackageSale = (
  components: PackageComponent[],
  stock: Record<string, number>,
  packagesSold: number
): string | null => {
  if (packagesSold <= 0) return 'Enter at least one package to sell.';
  for (const component of components) {
    const available = stock[component.name] ?? 0;
    const required = component.countPerPackage * packagesSold;
    if (available < required) {
      return `Not enough ${component.name}. Available: ${available}, needed: ${required}.`;
    }
  }
  return null;
};

export const validatePartialPackageSale = (
  stock: Record<string, number>,
  componentsSold: PackageComponentSold[]
): string | null => {
  const selected = componentsSold.filter((component) => component.quantity > 0);
  if (selected.length === 0) return 'Select at least one package piece to sell.';
  for (const component of selected) {
    const available = stock[component.name] ?? 0;
    if (component.quantity > available) {
      return `Not enough ${component.name}. Available: ${available}, requested: ${component.quantity}.`;
    }
  }
  return null;
};

export const deductFullPackageSale = (
  components: PackageComponent[],
  stock: Record<string, number>,
  packagesSold: number
): Record<string, number> => {
  const nextStock = { ...stock };
  for (const component of components) {
    nextStock[component.name] =
      (nextStock[component.name] ?? 0) - component.countPerPackage * packagesSold;
    if (nextStock[component.name] <= 0) delete nextStock[component.name];
  }
  return nextStock;
};

export const deductPartialPackageSale = (
  stock: Record<string, number>,
  componentsSold: PackageComponentSold[]
): Record<string, number> => {
  const nextStock = { ...stock };
  for (const component of componentsSold) {
    if (component.quantity <= 0) continue;
    nextStock[component.name] = (nextStock[component.name] ?? 0) - component.quantity;
    if (nextStock[component.name] <= 0) delete nextStock[component.name];
  }
  return nextStock;
};

export const restoreFullPackageSale = (
  components: PackageComponent[],
  stock: Record<string, number>,
  packagesSold: number
): Record<string, number> => {
  const nextStock = { ...stock };
  for (const component of components) {
    nextStock[component.name] =
      (nextStock[component.name] ?? 0) + component.countPerPackage * packagesSold;
  }
  return nextStock;
};

export const restorePartialPackageSale = (
  stock: Record<string, number>,
  componentsSold: PackageComponentSold[]
): Record<string, number> => {
  const nextStock = { ...stock };
  for (const component of componentsSold) {
    if (component.quantity <= 0) continue;
    nextStock[component.name] = (nextStock[component.name] ?? 0) + component.quantity;
  }
  return nextStock;
};
