import { parsePackageComponents } from './packageStock';

export type InventoryItemType = 'ROLL' | 'PIECE' | 'REMANENT';

type PackageComponent = { name: string; countPerPackage: number };

export const typeCode = (type: InventoryItemType) =>
  type === 'ROLL' ? 'R' : type === 'PIECE' ? 'P' : 'M';

export const colorCodeFromName = (name: string, fallbackId = '') =>
  name
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3) || fallbackId.slice(0, 3).toUpperCase();

export const padFamilyCode = (familyCode: number) => String(familyCode).padStart(3, '0');

export const padSubCode = (subCode: number) => {
  const rounded = Math.round(subCode * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded).padStart(3, '0');
  }
  return rounded.toFixed(2).replace('.', '');
};

export const padLengthCode = (meters: number) => {
  const rounded = Math.round(meters * 100) / 100;
  const encoded = Math.round(rounded * 100);
  return String(encoded).padStart(4, '0');
};

export const meteredInstanceKeyPrefix = (type: 'ROLL' | 'REMANENT') =>
  type === 'ROLL' ? 'roll' : 'remnant';

export const formatMeteredInstanceIdSuffix = (
  instanceKey: string,
  type: 'ROLL' | 'REMANENT'
) => {
  const prefix = meteredInstanceKeyPrefix(type);
  const match = instanceKey.match(new RegExp(`^${prefix}-(\\d+)$`));
  if (!match) return '';
  const letter = type === 'ROLL' ? 'R' : 'M';
  return `${letter}${match[1].padStart(2, '0')}`;
};

export const resolveMeteredInstanceKey = (input: {
  type: 'ROLL' | 'REMANENT';
  items: Array<{
    branchId: string;
    code: number;
    subCode?: number | string | { toString(): string };
    costPrice?: number | string | { toString(): string };
    colorId: string;
    type: InventoryItemType;
    packageKey?: string;
  }>;
  branchId: string;
  familyCode: number;
  subCode: number;
  colorId: string;
}) => {
  const prefix = meteredInstanceKeyPrefix(input.type);
  const matching = input.items.filter((item) => {
    const itemPrice = Number(item.subCode ?? item.costPrice ?? 0);
    return (
      item.branchId === input.branchId &&
      Number(item.code) === Number(input.familyCode) &&
      Math.abs(itemPrice - input.subCode) < 0.001 &&
      item.colorId === input.colorId &&
      item.type === input.type
    );
  });

  let maxInstance = 0;
  for (const item of matching) {
    const key = item.packageKey ?? '';
    if (!key) {
      maxInstance = Math.max(maxInstance, 1);
      continue;
    }
    const match = key.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      maxInstance = Math.max(maxInstance, Number(match[1]));
    }
  }

  const nextInstance = maxInstance + 1;
  return nextInstance === 1 ? '' : `${prefix}-${nextInstance}`;
};

const buildPackageIdSuffix = (components: PackageComponent[]) => {
  const initials = components
    .map((component) =>
      component.name
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 2)
        .toUpperCase()
    )
    .join('');
  return `PKG${initials.slice(0, 10)}`;
};

export const buildInventoryItemId = (input: {
  branchId: string;
  familyCode: number;
  subCode: number;
  colorName: string;
  colorId?: string;
  type: InventoryItemType;
  pieceLength?: number;
  packageComponents?: PackageComponent[];
  isPiecePackage?: boolean;
  instanceKey?: string;
}) => {
  const colorCode = colorCodeFromName(input.colorName, input.colorId);
  const typeLetter = typeCode(input.type);

  if (input.isPiecePackage && input.packageComponents?.length) {
    const packageSuffix = buildPackageIdSuffix(input.packageComponents);
    return `${input.branchId}-${padFamilyCode(input.familyCode)}-${padSubCode(input.subCode)}-${colorCode}${typeLetter}-${packageSuffix}`;
  }

  const lengthSuffix =
    input.type === 'PIECE' && input.pieceLength && input.pieceLength > 0
      ? padLengthCode(input.pieceLength)
      : '';
  const instanceSuffix =
    (input.type === 'ROLL' || input.type === 'REMANENT') && input.instanceKey
      ? `-${formatMeteredInstanceIdSuffix(input.instanceKey, input.type)}`
      : '';
  return `${input.branchId}-${padFamilyCode(input.familyCode)}-${padSubCode(input.subCode)}-${colorCode}${typeLetter}${lengthSuffix}${instanceSuffix}`;
};

export const resolveInventoryItemId = (input: {
  branchId: string;
  code: number;
  subCode: number;
  colorName: string;
  colorId: string;
  type: InventoryItemType;
  pieceLength: number;
  isPiecePackage: boolean;
  packageComponents: unknown;
}) => {
  const packageComponents = input.isPiecePackage
    ? parsePackageComponents(input.packageComponents)
    : [];

  return buildInventoryItemId({
    branchId: input.branchId,
    familyCode: input.code,
    subCode: input.subCode,
    colorName: input.colorName,
    colorId: input.colorId,
    type: input.type,
    pieceLength: input.isPiecePackage ? undefined : input.pieceLength,
    packageComponents,
    isPiecePackage: input.isPiecePackage,
  });
};
