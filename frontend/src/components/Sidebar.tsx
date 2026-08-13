
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { canAccessRoute } from '../lib/dashboardSettings';
import { canManageEmployeeAccounts, getCurrentUser } from '../lib/auth';
import { countOpenTasks } from '../lib/taskSettings';
import LanguageSwitcher from './LanguageSwitcher';

type NavItem = {
  to: string;
  labelKey: string;
  end?: boolean;
  adminOnly?: boolean;
};

type NavGroup = {
  id: string;
  labelKey: string;
  items: NavItem[];
};

const navigation: Array<NavItem | NavGroup> = [
  { to: '/dashboard', labelKey: 'nav.dashboard', end: true },
  {
    id: 'pricing',
    labelKey: 'nav.pricing',
    items: [
      { to: '/item-pricing', labelKey: 'nav.itemPricing', end: true, adminOnly: true },
      { to: '/plain-cloth', labelKey: 'nav.plainClothPricing', end: true, adminOnly: true },
    ],
  },
  {
    id: 'commission',
    labelKey: 'nav.commission',
    items: [
      { to: '/sales-commission', labelKey: 'nav.salesCommission', end: true, adminOnly: true },
      { to: '/commission-payouts', labelKey: 'nav.commissionPayouts', end: true },
      { to: '/trustee-commission', labelKey: 'nav.trusteeCommission', end: true },
    ],
  },
  { to: '/inventory', labelKey: 'nav.inventory', end: true },
  { to: '/sales', labelKey: 'nav.sales', end: true },
  {
    id: 'accounting',
    labelKey: 'nav.accounting',
    items: [
      { to: '/sales/daily', labelKey: 'nav.dailySales', end: true },
      { to: '/sales/history', labelKey: 'nav.historySales', end: true },
      { to: '/sales/owed', labelKey: 'nav.owedMoney', end: true },
      { to: '/exchange', labelKey: 'nav.exchange', end: true },
    ],
  },
  { to: '/tasks', labelKey: 'nav.tasks', end: true },
  { to: '/task-employee', labelKey: 'nav.taskEmployee', end: true },
  { to: '/analytics', labelKey: 'nav.dataAnalysis', end: true },
  {
    id: 'item-input',
    labelKey: 'nav.itemInput',
    items: [
      { to: '/item-input', labelKey: 'nav.newItem', end: true },
      { to: '/inventory/convert', labelKey: 'nav.itemConversion', end: true },
    ],
  },
  { to: '/employee-accounts', labelKey: 'nav.employeeAccounts', end: true, adminOnly: true },
];

function isNavGroup(entry: NavItem | NavGroup): entry is NavGroup {
  return 'items' in entry;
}

function isGroupActive(pathname: string, group: NavGroup) {
  return group.items.some((item) => pathname.startsWith(item.to));
}

function initialExpandedGroups(pathname: string) {
  const expanded: Record<string, boolean> = {};
  for (const entry of navigation) {
    if (isNavGroup(entry) && isGroupActive(pathname, entry)) {
      expanded[entry.id] = true;
    }
  }
  return expanded;
}

type SidebarProps = {
  isOpen: boolean;
  onNavigate?: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onNavigate }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const user = getCurrentUser();
  const [openTaskCount, setOpenTaskCount] = useState(() => countOpenTasks());
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    initialExpandedGroups(location.pathname)
  );

  const canSeeNavItem = (nav: NavItem) => {
    if (nav.adminOnly && !canManageEmployeeAccounts(user)) return false;
    return canAccessRoute(user, nav.to);
  };

  const visibleNavigation = useMemo(() => {
    return navigation
      .map((entry) => {
        if (isNavGroup(entry)) {
          const items = entry.items.filter(canSeeNavItem);
          return items.length > 0 ? { ...entry, items } : null;
        }
        return canSeeNavItem(entry) ? entry : null;
      })
      .filter((entry): entry is NavItem | NavGroup => entry !== null);
  }, [user]);

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = { ...current };
      for (const entry of navigation) {
        if (isNavGroup(entry) && isGroupActive(location.pathname, entry)) {
          next[entry.id] = true;
        }
      }
      return next;
    });
  }, [location.pathname]);

  useEffect(() => {
    const refreshCount = () => setOpenTaskCount(countOpenTasks());
    refreshCount();
    window.addEventListener('branch-tasks-updated', refreshCount);
    return () => window.removeEventListener('branch-tasks-updated', refreshCount);
  }, []);

  const handleNavigate = () => {
    if (window.innerWidth < 1024) {
      onNavigate?.();
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  return (
    <aside
      className={`sidebar-panel ${isOpen ? 'sidebar-panel--open' : 'sidebar-panel--closed'}`}
      aria-hidden={!isOpen}
    >
      <div className="sidebar-panel__sheen" aria-hidden="true" />
      <div className="sidebar-panel__edge" aria-hidden="true" />
      <nav className="sidebar-panel__nav">
        {visibleNavigation.map((nav, index) => {
          if (isNavGroup(nav)) {
            const groupExpanded = Boolean(expandedGroups[nav.id]);
            const groupActive = isGroupActive(location.pathname, nav);

            return (
              <div
                key={nav.id}
                style={{ transitionDelay: isOpen ? `${index * 35}ms` : '0ms' }}
                className="sidebar-nav-item"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(nav.id)}
                  aria-expanded={groupExpanded}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${
                    groupActive
                      ? 'bg-gray-900 text-white font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span>{t(nav.labelKey)}</span>
                  <span
                    className={`text-xs transition-transform ${groupExpanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>
                {groupExpanded && (
                  <div className="mt-1 space-y-1 border-l-2 border-gray-200 pl-2 ml-2">
                    {nav.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={handleNavigate}
                        className={({ isActive }) =>
                          isActive
                            ? 'block rounded-md bg-black px-3 py-2 text-sm font-semibold text-white'
                            : 'block rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100'
                        }
                      >
                        {t(item.labelKey)}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={nav.to}
              to={nav.to}
              end={nav.end}
              onClick={handleNavigate}
              style={{ transitionDelay: isOpen ? `${index * 35}ms` : '0ms' }}
              className={({ isActive }) => {
                const motion = 'sidebar-nav-item';
                if (nav.to === '/sales') {
                  return isActive
                    ? `nav-liquid-sales scale-[1.02] ${motion}`
                    : `nav-liquid-sales opacity-95 hover:opacity-100 ${motion}`;
                }

                return isActive
                  ? `block px-3 py-2 rounded-md bg-black text-white font-semibold ${motion}`
                  : `block px-3 py-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors ${motion}`;
              }}
            >
              <span
                className={`flex items-center justify-between gap-2 ${
                  nav.to === '/sales' ? 'relative z-10' : ''
                }`}
              >
                <span>{t(nav.labelKey)}</span>
                {nav.to === '/task-employee' && openTaskCount > 0 && (
                  <span
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-none text-white"
                    aria-label={t('nav.openTasksBadge', { count: openTaskCount })}
                  >
                    {openTaskCount > 99 ? '99+' : openTaskCount}
                  </span>
                )}
              </span>
            </NavLink>
          );
        })}
      </nav>
      <LanguageSwitcher className="sidebar-panel__footer mt-4 border-t border-gray-100/80 pt-4" />
    </aside>
  );
};

export default Sidebar;
