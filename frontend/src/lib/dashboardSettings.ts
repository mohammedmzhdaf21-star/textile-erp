import { normalizeStoredAmount } from './currency';

export type DashboardSectionKey =
  | 'dashboard'
  | 'itemPricing'
  | 'salesCommission'
  | 'commissionPayouts'
  | 'inventory'
  | 'itemConversion'
  | 'sales'
  | 'dailySales'
  | 'historySales'
  | 'owedMoney'
  | 'tasks'
  | 'taskEmployee'
  | 'dataAnalysis'
  | 'trusteeCommission'
  | 'exchange'
  | 'itemInput'
  | 'employeeAccounts';

export type ItemMinimumPrice = {
  itemId: string;
  unit: 'METER' | 'PIECE';
  minimumPrice: number;
  updatedAt: string;
};

export type EmployeeAccessRule = {
  email: string;
  sections: DashboardSectionKey[];
  assignedWork: string;
  updatedAt: string;
};

export type CommissionSettings = {
  ratePercent: number;
  baseAmountPerUnit: number;
};

const ITEM_PRICES_KEY = 'textile-erp-item-minimum-prices';
const EMPLOYEE_ACCESS_KEY = 'textile-erp-employee-access-rules';
const COMMISSION_SETTINGS_KEY = 'textile-erp-commission-settings';
const ALWAYS_VISIBLE_ROUTES = new Set(['/task-employee']);

export const dashboardSections: Array<{ key: DashboardSectionKey; labelKey: string; route: string }> = [
  { key: 'dashboard', labelKey: 'nav.dashboard', route: '/dashboard' },
  { key: 'itemPricing', labelKey: 'nav.itemPricing', route: '/item-pricing' },
  { key: 'salesCommission', labelKey: 'nav.salesCommission', route: '/sales-commission' },
  { key: 'commissionPayouts', labelKey: 'nav.commissionPayouts', route: '/commission-payouts' },
  { key: 'inventory', labelKey: 'nav.inventory', route: '/inventory' },
  { key: 'itemConversion', labelKey: 'nav.itemConversion', route: '/inventory/convert' },
  { key: 'sales', labelKey: 'nav.sales', route: '/sales' },
  { key: 'dailySales', labelKey: 'nav.dailySales', route: '/sales/daily' },
  { key: 'historySales', labelKey: 'nav.historySales', route: '/sales/history' },
  { key: 'owedMoney', labelKey: 'nav.owedMoney', route: '/sales/owed' },
  { key: 'tasks', labelKey: 'nav.tasks', route: '/tasks' },
  { key: 'taskEmployee', labelKey: 'nav.taskEmployee', route: '/task-employee' },
  { key: 'dataAnalysis', labelKey: 'nav.dataAnalysis', route: '/analytics' },
  { key: 'trusteeCommission', labelKey: 'nav.trusteeCommission', route: '/trustee-commission' },
  { key: 'exchange', labelKey: 'nav.exchange', route: '/exchange' },
  { key: 'itemInput', labelKey: 'nav.newItem', route: '/item-input' },
  { key: 'employeeAccounts', labelKey: 'nav.employeeAccounts', route: '/employee-accounts' },
];

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const readItemMinimumPrices = () =>
  readJson<Record<string, ItemMinimumPrice>>(ITEM_PRICES_KEY, {});

export const getItemMinimumPrice = (itemId: string) => {
  const entry = readItemMinimumPrices()[itemId.trim()];
  if (!entry) return undefined;
  return {
    ...entry,
    minimumPrice: normalizeStoredAmount(entry.minimumPrice),
  };
};

export const saveItemMinimumPrice = (price: ItemMinimumPrice) => {
  const prices = readItemMinimumPrices();
  prices[price.itemId] = price;
  writeJson(ITEM_PRICES_KEY, prices);
  window.dispatchEvent(new Event('dashboard-settings-updated'));
};

export const readEmployeeAccessRules = () =>
  readJson<Record<string, EmployeeAccessRule>>(EMPLOYEE_ACCESS_KEY, {});

export const saveEmployeeAccessRule = (rule: EmployeeAccessRule) => {
  const rules = readEmployeeAccessRules();
  rules[rule.email.toLowerCase()] = { ...rule, email: rule.email.toLowerCase() };
  writeJson(EMPLOYEE_ACCESS_KEY, rules);
  window.dispatchEvent(new Event('dashboard-settings-updated'));
};

export const getEmployeeAccessRule = (email?: string | null) => {
  if (!email) return undefined;
  return readEmployeeAccessRules()[email.toLowerCase()];
};

const userHasFullAccess = (user?: { role?: string } | null) =>
  user?.role === 'ADMIN' || user?.role === 'MANAGER';

export const canAccessRoute = (
  user: { email?: string; role?: string; allowedSections?: DashboardSectionKey[] | null } | null | undefined,
  route: string
) => {
  if (ALWAYS_VISIBLE_ROUTES.has(route)) return true;
  if (!user) return false;
  if (userHasFullAccess(user)) return true;

  const serverSections = user.allowedSections;
  if (serverSections && serverSections.length > 0) {
    return dashboardSections.some(
      (section) => section.route === route && serverSections.includes(section.key)
    );
  }

  const rule = getEmployeeAccessRule(user.email);
  if (!rule) return true;
  return dashboardSections.some(
    (section) => section.route === route && rule.sections.includes(section.key)
  );
};

export const ADMIN_ONLY_ROUTES = new Set([
  '/employee-accounts',
  '/item-pricing',
  '/sales-commission',
]);

export const canAccessAdminRoute = (user: { role?: string } | null | undefined, route: string) => {
  if (!ADMIN_ONLY_ROUTES.has(route)) return true;
  return user?.role === 'ADMIN' || user?.role === 'MANAGER';
};

export const readCommissionSettings = () => {
  const settings = readJson<CommissionSettings>(COMMISSION_SETTINGS_KEY, {
    ratePercent: 5,
    baseAmountPerUnit: 0,
  });
  return {
    ...settings,
    baseAmountPerUnit: normalizeStoredAmount(settings.baseAmountPerUnit),
  };
};

export const saveCommissionSettings = (settings: CommissionSettings) => {
  writeJson(COMMISSION_SETTINGS_KEY, settings);
  window.dispatchEvent(new Event('dashboard-settings-updated'));
};
