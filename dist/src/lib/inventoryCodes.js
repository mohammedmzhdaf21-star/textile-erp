"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInventoryItemId = exports.buildInventoryItemId = exports.padLengthCode = exports.padSubCode = exports.padFamilyCode = exports.colorCodeFromName = exports.typeCode = void 0;
const packageStock_1 = require("./packageStock");
const typeCode = (type) => type === 'ROLL' ? 'R' : type === 'PIECE' ? 'P' : 'M';
exports.typeCode = typeCode;
const colorCodeFromName = (name, fallbackId = '') => name
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3) || fallbackId.slice(0, 3).toUpperCase();
exports.colorCodeFromName = colorCodeFromName;
const padFamilyCode = (familyCode) => String(familyCode).padStart(3, '0');
exports.padFamilyCode = padFamilyCode;
const padSubCode = (subCode) => {
    const rounded = Math.round(subCode * 100) / 100;
    if (Number.isInteger(rounded)) {
        return String(rounded).padStart(3, '0');
    }
    return rounded.toFixed(2).replace('.', '');
};
exports.padSubCode = padSubCode;
const padLengthCode = (meters) => {
    const rounded = Math.round(meters * 100) / 100;
    const encoded = Math.round(rounded * 100);
    return String(encoded).padStart(4, '0');
};
exports.padLengthCode = padLengthCode;
const buildPackageIdSuffix = (components) => {
    const initials = components
        .map((component) => component.name
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 2)
        .toUpperCase())
        .join('');
    return `PKG${initials.slice(0, 10)}`;
};
const buildInventoryItemId = (input) => {
    const colorCode = (0, exports.colorCodeFromName)(input.colorName, input.colorId);
    const typeLetter = (0, exports.typeCode)(input.type);
    if (input.isPiecePackage && input.packageComponents?.length) {
        const packageSuffix = buildPackageIdSuffix(input.packageComponents);
        return `${input.branchId}-${(0, exports.padFamilyCode)(input.familyCode)}-${(0, exports.padSubCode)(input.subCode)}-${colorCode}${typeLetter}-${packageSuffix}`;
    }
    const lengthSuffix = input.type === 'PIECE' && input.pieceLength && input.pieceLength > 0
        ? (0, exports.padLengthCode)(input.pieceLength)
        : '';
    return `${input.branchId}-${(0, exports.padFamilyCode)(input.familyCode)}-${(0, exports.padSubCode)(input.subCode)}-${colorCode}${typeLetter}${lengthSuffix}`;
};
exports.buildInventoryItemId = buildInventoryItemId;
const resolveInventoryItemId = (input) => {
    const packageComponents = input.isPiecePackage
        ? (0, packageStock_1.parsePackageComponents)(input.packageComponents)
        : [];
    return (0, exports.buildInventoryItemId)({
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
exports.resolveInventoryItemId = resolveInventoryItemId;
//# sourceMappingURL=inventoryCodes.js.map