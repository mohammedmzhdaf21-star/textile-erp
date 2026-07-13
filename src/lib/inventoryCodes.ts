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
  return `${input.branchId}-${padFamilyCode(input.familyCode)}-${padSubCode(input.subCode)}-${colorCode}${typeLetter}${lengthSuffix}`;
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
