import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../lib/currency';

type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';

type Sale = {
  id: string;
  total?: number | string;
  totalPrice?: number | string;
  createdAt: string;
  paymentMethod?: string;
  notes?: string;
};

type TrusteeRule = {
  id: string;
  trusteeName: string;
  contactInfo: string;
  branches: BranchCode[];
  percentage: number;
  isActive: boolean;
  updatedAt: string;
};

type LegacyTrusteeRule = Omit<TrusteeRule, 'branches'> & {
  branch?: BranchCode;
  branches?: BranchCode[];
};

type TrusteeResult = TrusteeRule & {
  salesCount: number;
  branchRevenue: number;
  commissionAmount: number;
};

type BranchBreakdown = {
  branch: BranchCode;
  salesCount: number;
  revenue: number;
};

const branches: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];
const TRUSTEE_RULES_KEY = 'textile-erp-trustee-commission-rules';

const BRANCH_MAP: Record<BranchCode, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};

const toMoneyNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const saleCashAmount = (sale: Sale) => {
  const notes = sale.notes || '';
  const refundMatch = /Refunded\s+([0-9]+(?:\.[0-9]+)?)/i.exec(notes);
  const paidMatch = /Paid\s+(-?[0-9]+(?:\.[0-9]+)?)/i.exec(notes);

  if (refundMatch) return -toMoneyNumber(refundMatch[1]);
  if (paidMatch) return toMoneyNumber(paidMatch[1]);
  return toMoneyNumber(sale.total ?? sale.totalPrice ?? 0);
};

const extractSales = (data: unknown): Sale[] => {
  if (Array.isArray(data)) return data as Sale[];
  if (data && typeof data === 'object' && Array.isArray((data as { sales?: unknown }).sales)) {
    return (data as { sales: Sale[] }).sales;
  }
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Sale[] }).items;
  }
  return [];
};

const uniqueBranches = (values: BranchCode[]) =>
  branches.filter((branch) => values.includes(branch));

const branchBreakdownForRule = (
  ruleBranches: BranchCode[],
  salesByBranch: Record<BranchCode, Sale[]>
): BranchBreakdown[] =>
  ruleBranches.map((branch) => {
    const sales = salesByBranch[branch] || [];
    return {
      branch,
      salesCount: sales.length,
      revenue: sales.reduce((sum, sale) => sum + saleCashAmount(sale), 0),
    };
  });

const isBranchCode = (value: unknown): value is BranchCode =>
  typeof value === 'string' && branches.includes(value as BranchCode);

const normalizeRule = (rule: LegacyTrusteeRule): TrusteeRule => {
  const rawBranches = rule.branches?.length
    ? rule.branches
    : rule.branch
    ? [rule.branch]
    : ['A'];
  const assignedBranches = rawBranches.filter(isBranchCode);

  return {
    id: rule.id,
    trusteeName: rule.trusteeName,
    contactInfo: rule.contactInfo,
    branches: uniqueBranches(assignedBranches.length ? assignedBranches : ['A']),
    percentage: rule.percentage,
    isActive: true,
    updatedAt: rule.updatedAt,
  };
};

const readTrusteeRules = (): TrusteeRule[] => {
  try {
    const raw = localStorage.getItem(TRUSTEE_RULES_KEY);
    if (raw) return (JSON.parse(raw) as LegacyTrusteeRule[]).map(normalizeRule);
  } catch {
    // Ignore invalid local settings and reset to defaults below.
  }

  return [
    {
      id: 'default-main-investor-ace',
      trusteeName: 'Mr. Investor',
      contactInfo: 'investor@example.com',
      branches: ['A', 'C', 'E'],
      percentage: 15,
      isActive: true,
      updatedAt: new Date().toISOString(),
    },
  ];
};

const writeTrusteeRules = (rules: TrusteeRule[]) => {
  localStorage.setItem(TRUSTEE_RULES_KEY, JSON.stringify(rules));
};

const TrusteeCommission: React.FC = () => {
  const { t } = useTranslation();
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 7);

  const [fromDate, setFromDate] = useState(formatDate(weekAgo));
  const [toDate, setToDate] = useState(formatDate(today));
  const [rules, setRules] = useState<TrusteeRule[]>(() => readTrusteeRules());
  const [trusteeName, setTrusteeName] = useState('Mr. Investor');
  const [contactInfo, setContactInfo] = useState('investor@example.com');
  const [assignedBranches, setAssignedBranches] = useState<BranchCode[]>(['A', 'C', 'E']);
  const [percentage, setPercentage] = useState('15');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [salesByBranch, setSalesByBranch] = useState<Record<BranchCode, Sale[]>>({
    A: [],
    B: [],
    C: [],
    E: [],
    F: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

  const activeRules = rules.filter((rule) => rule.isActive);

  const revenueForBranches = (ruleBranches: BranchCode[]) =>
    ruleBranches.reduce(
      (sum, branch) =>
        sum + (salesByBranch[branch] || []).reduce((branchSum, sale) => branchSum + saleCashAmount(sale), 0),
      0
    );

  const salesCountForBranches = (ruleBranches: BranchCode[]) =>
    ruleBranches.reduce((sum, branch) => sum + (salesByBranch[branch] || []).length, 0);

  const trusteeResults = useMemo<TrusteeResult[]>(
    () =>
      activeRules.map((rule) => {
        const branchRevenue = revenueForBranches(rule.branches);
        return {
          ...rule,
          salesCount: salesCountForBranches(rule.branches),
          branchRevenue,
          commissionAmount: branchRevenue * (rule.percentage / 100),
        };
      }),
    [activeRules, salesByBranch]
  );

  const totalBranchRevenue = trusteeResults.reduce((sum, result) => sum + result.branchRevenue, 0);
  const totalTrusteeCommission = trusteeResults.reduce(
    (sum, result) => sum + result.commissionAmount,
    0
  );

  const saveRules = (nextRules: TrusteeRule[]) => {
    setRules(nextRules);
    writeTrusteeRules(nextRules);
  };

  const toggleAssignedBranch = (branch: BranchCode) => {
    setAssignedBranches((current) =>
      current.includes(branch)
        ? current.filter((item) => item !== branch)
        : uniqueBranches([...current, branch])
    );
  };

  const resetRuleForm = () => {
    setTrusteeName('');
    setContactInfo('');
    setAssignedBranches([]);
    setPercentage('0');
    setEditingRuleId(null);
  };

  const startEditRule = (rule: TrusteeRule) => {
    setTrusteeName(rule.trusteeName);
    setContactInfo(rule.contactInfo);
    setAssignedBranches([...rule.branches]);
    setPercentage(String(rule.percentage));
    setEditingRuleId(rule.id);
    setMessage(null);
  };

  const deleteRule = (rule: TrusteeRule) => {
    const confirmed = window.confirm(t('trusteeCommission.confirmDeleteRule', { name: rule.trusteeName }));
    if (!confirmed) return;

    saveRules(rules.filter((existing) => existing.id !== rule.id));
    if (editingRuleId === rule.id) {
      resetRuleForm();
    }
    setMessage(t('trusteeCommission.deletedRule', { name: rule.trusteeName }));
  };

  const saveRule = () => {
    const parsedPercentage = Number(percentage);
    if (!trusteeName.trim()) return alert(t('trusteeCommission.enterTrusteeName'));
    if (assignedBranches.length === 0) return alert(t('trusteeCommission.chooseBranch'));
    if (!Number.isFinite(parsedPercentage) || parsedPercentage < 0) {
      return alert(t('trusteeCommission.enterValidPercent'));
    }

    const normalizedBranches = uniqueBranches(assignedBranches);
    const rule: TrusteeRule = {
      id:
        editingRuleId ??
        `${trusteeName.trim().toLowerCase().replace(/\s+/g, '-')}-${normalizedBranches.join('')}-${Date.now()}`,
      trusteeName: trusteeName.trim(),
      contactInfo: contactInfo.trim(),
      branches: normalizedBranches,
      percentage: parsedPercentage,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    const nextRules = editingRuleId
      ? rules.map((existing) => (existing.id === editingRuleId ? rule : existing))
      : [...rules.filter((existing) => existing.id !== rule.id), rule];

    saveRules(nextRules);
    setMessage(
      t('trusteeCommission.savedRule', {
        rate: rule.percentage,
        name: rule.trusteeName,
        branches: rule.branches.join(', '),
      })
    );
    resetRuleForm();
  };

  const loadCommissions = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    setExpandedResultId(null);

    try {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      if (start > end) {
        setSalesByBranch({ A: [], B: [], C: [], E: [], F: [] });
        setError(t('trusteeCommission.invalidDateRange'));
        setLoading(false);
        return;
      }

      const branchesToLoad = uniqueBranches(
        activeRules.flatMap((rule) => rule.branches)
      );

      const loadedEntries = await Promise.all(
        branchesToLoad.map(async (branch) => {
          const response = await api.get('/sales', {
            params: {
              branchId: BRANCH_MAP[branch],
              fromDate: start.toISOString(),
              toDate: end.toISOString(),
              includeVoided: false,
              pageSize: 200,
            },
          });
          return [branch, extractSales(response.data)] as const;
        })
      );

      setSalesByBranch({
        A: [],
        B: [],
        C: [],
        E: [],
        F: [],
        ...Object.fromEntries(loadedEntries),
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setSalesByBranch({ A: [], B: [], C: [], E: [], F: [] });
      setError(
        `Request failed${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? err?.message ?? t('trusteeCommission.failedToLoad')
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('trusteeCommission.title')}</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            {t('trusteeCommission.subtitle')}
          </p>
        </div>
        <button type="button" onClick={loadCommissions} className="btn-primary">
          {t('trusteeCommission.loadCommission')}
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">{t('trusteeCommission.ruleTitle')}</h3>
          <p className="mt-1 text-sm text-gray-600">
            {t('trusteeCommission.ruleDescription')}
          </p>

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('trusteeCommission.trusteeEmployee')}</label>
          <input
            value={trusteeName}
            onChange={(event) => setTrusteeName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('trusteeCommission.trusteeNamePlaceholder')}
          />

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('trusteeCommission.contactEmail')}</label>
          <input
            value={contactInfo}
            onChange={(event) => setContactInfo(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('trusteeCommission.contactPlaceholder')}
          />

          <div className="mt-4">
            <div className="text-sm font-medium text-gray-700">{t('trusteeCommission.linkedBranches')}</div>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {branches.map((branch) => (
                <button
                  key={branch}
                  type="button"
                  onClick={() => toggleAssignedBranch(branch)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    assignedBranches.includes(branch)
                      ? 'border-magenta-500 bg-magenta-500 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-magenta-300'
                  }`}
                >
                  {branch}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('trusteeCommission.commissionPercent')}</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={saveRule} className="btn-primary flex-1 min-w-[10rem]">
              {editingRuleId ? t('trusteeCommission.updateRule') : t('trusteeCommission.saveRule')}
            </button>
            {editingRuleId && (
              <button type="button" onClick={resetRuleForm} className="btn-secondary">
                {t('common.cancel')}
              </button>
            )}
          </div>
          {message && <p className="mt-3 text-sm text-magenta-600">{message}</p>}

          <div className="mt-5 space-y-3">
            {rules.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                {t('trusteeCommission.noRules')}
              </div>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rounded-2xl border p-4 ${
                    editingRuleId === rule.id
                      ? 'border-magenta-500 bg-magenta-50'
                      : 'border-green-300 bg-green-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-black">{rule.trusteeName}</div>
                      <div className="text-sm text-gray-600">{rule.contactInfo || t('common.noContact')}</div>
                      <div className="mt-1 text-sm font-semibold text-magenta-600">
                        {t('trusteeCommission.trusteeRate', { rate: rule.percentage, branches: rule.branches.join(', ') })}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                        {t('trusteeCommission.active')}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEditRule(rule)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRule(rule)}
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trusteeCommission.from')}</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trusteeCommission.to')}</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="rounded-2xl bg-magenta-500 p-4 text-white">
                <div className="text-sm opacity-80">{t('trusteeCommission.linkedBranchRevenue')}</div>
                <div className="mt-1 text-2xl font-bold">{formatCurrency(totalBranchRevenue)}</div>
              </div>
              <div className="rounded-2xl bg-black p-4 text-white">
                <div className="text-sm opacity-80">{t('trusteeCommission.trusteeCommission')}</div>
                <div className="mt-1 text-2xl font-bold">{formatCurrency(totalTrusteeCommission)}</div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
              {t('trusteeCommission.loading')}
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
              {error}
            </div>
          ) : (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-black">{t('trusteeCommission.resultsTitle')}</h3>
              {trusteeResults.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                  {t('trusteeCommission.addRuleThenLoad')}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {trusteeResults.map((result) => {
                    const isExpanded = expandedResultId === result.id;
                    const branchBreakdown = branchBreakdownForRule(result.branches, salesByBranch);

                    return (
                      <div key={result.id} className="rounded-2xl border border-magenta-200 bg-magenta-50">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedResultId((current) =>
                              current === result.id ? null : result.id
                            )
                          }
                          aria-expanded={isExpanded}
                          className="w-full rounded-2xl p-4 text-left transition-colors hover:bg-magenta-100/60"
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-black">{result.trusteeName}</div>
                                <div className="text-sm text-gray-600">
                                  {t('trusteeCommission.resultSummary', {
                                    branches: result.branches.join(', '),
                                    count: result.salesCount,
                                    rate: result.percentage,
                                  })}
                                </div>
                              </div>
                              <span
                                className={`shrink-0 text-sm text-gray-500 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                                aria-hidden="true"
                              >
                                ▾
                              </span>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="rounded-xl bg-white px-3 py-2">
                                <div className="text-xs text-gray-500">
                                  {t('trusteeCommission.linkedBranchSales')}
                                </div>
                                <div className="text-lg font-bold text-black">
                                  {formatCurrency(result.branchRevenue)}
                                </div>
                              </div>
                              <div className="rounded-xl bg-white px-3 py-2">
                                <div className="text-xs text-gray-500">
                                  {t('trusteeCommission.trusteeCommission')}
                                </div>
                                <div className="text-lg font-bold text-magenta-600">
                                  {formatCurrency(result.commissionAmount)}
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-gray-500">
                              {isExpanded
                                ? t('trusteeCommission.branchBreakdownHint')
                                : t('trusteeCommission.tapForBranchBreakdown')}
                            </p>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-magenta-200 px-4 pb-4 pt-3">
                            <div className="text-sm font-semibold text-black">
                              {t('trusteeCommission.branchBreakdownTitle', {
                                from: fromDate,
                                to: toDate,
                              })}
                            </div>
                            <div className="mt-3 space-y-2">
                              {branchBreakdown.map((entry) => (
                                <div
                                  key={entry.branch}
                                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
                                >
                                  <div>
                                    <div className="font-semibold text-black">
                                      {t('trusteeCommission.branchLabel', { branch: entry.branch })}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {t('trusteeCommission.branchSalesCount', {
                                        count: entry.salesCount,
                                      })}
                                    </div>
                                  </div>
                                  <div className="whitespace-nowrap font-bold text-magenta-600">
                                    {formatCurrency(entry.revenue)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TrusteeCommission;
