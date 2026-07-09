export type PackageComponent = {
  name: string;
  countPerPackage: number;
};

export const emptyPackageComponent = (): PackageComponent => ({
  name: '',
  countPerPackage: 1,
});

export const normalizePackageComponents = (components: PackageComponent[]) =>
  components
    .map((component) => ({
      name: component.name.trim(),
      countPerPackage: Math.max(1, Math.floor(Number(component.countPerPackage) || 1)),
    }))
    .filter((component) => component.name.length > 0);

export const buildPackageKey = (components: PackageComponent[]) =>
  normalizePackageComponents(components)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((component) => `${component.name.toLowerCase()}:${component.countPerPackage}`)
    .join('|');

export const buildPackageIdSuffix = (components: PackageComponent[]) => {
  const initials = normalizePackageComponents(components)
    .map((component) =>
      component.name
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 2)
        .toUpperCase()
    )
    .join('');
  return `PKG${initials.slice(0, 10)}`;
};

export const formatPackageSummary = (components: PackageComponent[]) => {
  const normalized = normalizePackageComponents(components);
  if (normalized.length === 0) return 'No package pieces defined';
  return normalized.map((component) => `${component.countPerPackage}× ${component.name}`).join(', ');
};

export const totalPiecesPerPackage = (components: PackageComponent[]) =>
  normalizePackageComponents(components).reduce(
    (sum, component) => sum + component.countPerPackage,
    0
  );

export const validatePackageComponents = (components: PackageComponent[]): string | null => {
  const normalized = normalizePackageComponents(components);
  if (normalized.length < 2) {
    return 'Add at least 2 different pieces in the package (e.g. dress, coat, hijab).';
  }
  const names = normalized.map((component) => component.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    return 'Each piece name in the package must be unique.';
  }
  return null;
};

export const parsePackageComponents = (value: unknown): PackageComponent[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({
      name: String((entry as PackageComponent)?.name ?? '').trim(),
      countPerPackage: Math.max(1, Math.floor(Number((entry as PackageComponent)?.countPerPackage) || 1)),
    }))
    .filter((entry) => entry.name.length > 0);
};

export type PackageComponentSold = {
  name: string;
  quantity: number;
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

export const resolvePackageComponentStock = (input: {
  packageComponents?: unknown;
  packageComponentStock?: unknown;
  quantity: number;
}): Record<string, number> => {
  const parsedStock = parsePackageComponentStock(input.packageComponentStock);
  if (Object.keys(parsedStock).length > 0) return parsedStock;

  const components = parsePackageComponents(input.packageComponents);
  if (components.length === 0) return {};
  const stock: Record<string, number> = {};
  for (const component of components) {
    stock[component.name] = component.countPerPackage * Math.max(0, input.quantity);
  }
  return stock;
};

export const formatPackageStockSummary = (stock: Record<string, number>) =>
  Object.entries(stock)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => `${quantity}× ${name}`)
    .join(', ');

export const formatPackageComponentsSold = (components: PackageComponentSold[]) =>
  components
    .filter((component) => component.quantity > 0)
    .map((component) => `${component.quantity}× ${component.name}`)
    .join(', ');
