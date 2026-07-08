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
