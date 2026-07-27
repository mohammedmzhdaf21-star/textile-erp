"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restorePartialPackageSale = exports.restoreFullPackageSale = exports.deductPartialPackageSale = exports.deductFullPackageSale = exports.validatePartialPackageSale = exports.validateFullPackageSale = exports.formatPackageStockSummary = exports.countCompletePackages = exports.resolvePackageComponentStock = exports.buildPackageComponentStock = exports.parsePackageComponentStock = exports.parsePackageComponents = void 0;
const parsePackageComponents = (value) => {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => ({
        name: String(entry?.name ?? '').trim(),
        countPerPackage: Math.max(1, Math.floor(Number(entry?.countPerPackage) || 1)),
    }))
        .filter((entry) => entry.name.length > 0);
};
exports.parsePackageComponents = parsePackageComponents;
const parsePackageComponentStock = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    const stock = {};
    for (const [name, qty] of Object.entries(value)) {
        const quantity = Math.floor(Number(qty) || 0);
        if (quantity > 0)
            stock[name] = quantity;
    }
    return stock;
};
exports.parsePackageComponentStock = parsePackageComponentStock;
const buildPackageComponentStock = (components, packageCount) => {
    const stock = {};
    const packages = Math.max(0, Math.floor(packageCount));
    for (const component of components) {
        stock[component.name] = (stock[component.name] ?? 0) + component.countPerPackage * packages;
    }
    return stock;
};
exports.buildPackageComponentStock = buildPackageComponentStock;
const resolvePackageComponentStock = (input) => {
    const parsedStock = (0, exports.parsePackageComponentStock)(input.packageComponentStock);
    if (Object.keys(parsedStock).length > 0)
        return parsedStock;
    const components = (0, exports.parsePackageComponents)(input.packageComponents);
    if (components.length === 0)
        return {};
    return (0, exports.buildPackageComponentStock)(components, input.quantity);
};
exports.resolvePackageComponentStock = resolvePackageComponentStock;
const countCompletePackages = (components, stock) => {
    if (components.length === 0)
        return 0;
    return Math.min(...components.map((component) => Math.floor((stock[component.name] ?? 0) / component.countPerPackage)));
};
exports.countCompletePackages = countCompletePackages;
const formatPackageStockSummary = (stock) => Object.entries(stock)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => `${quantity}× ${name}`)
    .join(', ');
exports.formatPackageStockSummary = formatPackageStockSummary;
const validateFullPackageSale = (components, stock, packagesSold) => {
    if (packagesSold <= 0)
        return 'Enter at least one package to sell.';
    for (const component of components) {
        const available = stock[component.name] ?? 0;
        const required = component.countPerPackage * packagesSold;
        if (available < required) {
            return `Not enough ${component.name}. Available: ${available}, needed: ${required}.`;
        }
    }
    return null;
};
exports.validateFullPackageSale = validateFullPackageSale;
const validatePartialPackageSale = (stock, componentsSold) => {
    const selected = componentsSold.filter((component) => component.quantity > 0);
    if (selected.length === 0)
        return 'Select at least one package piece to sell.';
    for (const component of selected) {
        const available = stock[component.name] ?? 0;
        if (component.quantity > available) {
            return `Not enough ${component.name}. Available: ${available}, requested: ${component.quantity}.`;
        }
    }
    return null;
};
exports.validatePartialPackageSale = validatePartialPackageSale;
const deductFullPackageSale = (components, stock, packagesSold) => {
    const nextStock = { ...stock };
    for (const component of components) {
        nextStock[component.name] =
            (nextStock[component.name] ?? 0) - component.countPerPackage * packagesSold;
        if (nextStock[component.name] <= 0)
            delete nextStock[component.name];
    }
    return nextStock;
};
exports.deductFullPackageSale = deductFullPackageSale;
const deductPartialPackageSale = (stock, componentsSold) => {
    const nextStock = { ...stock };
    for (const component of componentsSold) {
        if (component.quantity <= 0)
            continue;
        nextStock[component.name] = (nextStock[component.name] ?? 0) - component.quantity;
        if (nextStock[component.name] <= 0)
            delete nextStock[component.name];
    }
    return nextStock;
};
exports.deductPartialPackageSale = deductPartialPackageSale;
const restoreFullPackageSale = (components, stock, packagesSold) => {
    const nextStock = { ...stock };
    for (const component of components) {
        nextStock[component.name] =
            (nextStock[component.name] ?? 0) + component.countPerPackage * packagesSold;
    }
    return nextStock;
};
exports.restoreFullPackageSale = restoreFullPackageSale;
const restorePartialPackageSale = (stock, componentsSold) => {
    const nextStock = { ...stock };
    for (const component of componentsSold) {
        if (component.quantity <= 0)
            continue;
        nextStock[component.name] = (nextStock[component.name] ?? 0) + component.quantity;
    }
    return nextStock;
};
exports.restorePartialPackageSale = restorePartialPackageSale;
//# sourceMappingURL=packageStock.js.map