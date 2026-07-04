export type DashboardSectionKey =
  | 'dashboard'
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
  | 'itemInput';

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
};

const ITEM_PRICES_KEY = 'textile-erp-item-minimum-prices';
const EMPLOYEE_ACCESS_KEY = 'textile-erp-employee-access-rules';
const COMMISSION_SETTINGS_KEY = 'textile-erp-commission-settings';
const ALWAYS_VISIBLE_ROUTES = new Set(['/task-employee']);

export const dashboardSections: Array<{ key: DashboardSectionKey; label: string; route: string }> = [
  { key: 'dashboard', label: 'Dashboard', route: '/dashboard' },
  { key: 'inventory', label: 'Inventory', route: '/inventory' },
  { key: 'itemConversion', label: 'Item Conversion', route: '/inventory/convert' },
  { key: 'sales', label: 'Sales', route: '/sales' },
  { key: 'dailySales', label: 'Daily Sales', route: '/sales/daily' },
  { key: 'historySales', label: 'History Sales', route: '/sales/history' },
  { key: 'owedMoney', label: 'Owed Money', route: '/sales/owed' },
  { key: 'tasks', label: 'Tasks', route: '/tasks' },
  { key: 'taskEmployee', label: 'Task Employee', route: '/task-employee' },
  { key: 'dataAnalysis', label: 'Data Analysis', route: '/analytics' },
  { key: 'trusteeCommission', label: 'Trustee Commission', route: '/trustee-commission' },
  { key: 'exchange', label: 'Exchange', route: '/exchange' },
  { key: 'itemInput', label: 'New Item', route: '/item-input' },
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

export const getItemMinimumPrice = (itemId: string) =>
  readItemMinimumPrices()[itemId.trim()];

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

export const canAccessRoute = (email: string | undefined, route: string) => {
  if (ALWAYS_VISIBLE_ROUTES.has(route)) return true;
  const rule = getEmployeeAccessRule(email);
  if (!rule) return true;
  return dashboardSections.some(
    (section) => section.route === route && rule.sections.includes(section.key)
  );
};

export const readCommissionSettings = () =>
  readJson<CommissionSettings>(COMMISSION_SETTINGS_KEY, { ratePercent: 5 });

export const saveCommissionSettings = (settings: CommissionSettings) => {
  writeJson(COMMISSION_SETTINGS_KEY, settings);
  window.dispatchEvent(new Event('dashboard-settings-updated'));
};
