import React, { useMemo, useState } from 'react';
import api from '../lib/api';

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
  branch: BranchCode;
  percentage: number;
  isActive: boolean;
  updatedAt: string;
};

type TrusteeResult = TrusteeRule & {
  salesCount: number;
  branchRevenue: number;
  commissionAmount: number;
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

const readTrusteeRules = (): TrusteeRule[] => {
  try {
    const raw = localStorage.getItem(TRUSTEE_RULES_KEY);
    if (raw) {
      return (JSON.parse(raw) as TrusteeRule[]).map((rule) => ({
        ...rule,
        isActive: true,
      }));
    }
  } catch {
    // Ignore invalid local settings and reset to defaults below.
  }

  return [
    {
      id: 'default-main-investor-a',
      trusteeName: 'Mr. Investor',
      contactInfo: 'investor@example.com',
      branch: 'A',
      percentage: 15,
      isActive: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'default-main-investor-b',
      trusteeName: 'Mr. Investor',
      contactInfo: 'investor@example.com',
      branch: 'B',
      percentage: 10,
      isActive: true,
      updatedAt: new Date().toISOString(),
    },
  ];
};

const writeTrusteeRules = (rules: TrusteeRule[]) => {
  localStorage.setItem(TRUSTEE_RULES_KEY, JSON.stringify(rules));
};

const TrusteeCommission: React.FC = () => {
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 7);

  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('A');
  const [fromDate, setFromDate] = useState(formatDate(weekAgo));
  const [toDate, setToDate] = useState(formatDate(today));
  const [rules, setRules] = useState<TrusteeRule[]>(() => readTrusteeRules());
  const [trusteeName, setTrusteeName] = useState('Mr. Investor');
  const [contactInfo, setContactInfo] = useState('investor@example.com');
  const [percentage, setPercentage] = useState('15');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const branchRules = rules.filter((rule) => rule.branch === selectedBranch);
  const activeBranchRules = branchRules.filter((rule) => rule.isActive);
  const branchRevenue = useMemo(
    () => sales.reduce((sum, sale) => sum + saleCashAmount(sale), 0),
    [sales]
  );

  const trusteeResults = useMemo<TrusteeResult[]>(
    () =>
      activeBranchRules.map((rule) => ({
        ...rule,
        salesCount: sales.length,
        branchRevenue,
        commissionAmount: branchRevenue * (rule.percentage / 100),
      })),
    [activeBranchRules, branchRevenue, sales.length]
  );

  const totalTrusteeCommission = trusteeResults.reduce(
    (sum, result) => sum + result.commissionAmount,
    0
  );

  const saveRules = (nextRules: TrusteeRule[]) => {
    setRules(nextRules);
    writeTrusteeRules(nextRules);
  };

  const saveRule = () => {
    const parsedPercentage = Number(percentage);
    if (!trusteeName.trim()) return alert('Enter a trustee employee name.');
    if (!Number.isFinite(parsedPercentage) || parsedPercentage < 0) {
      return alert('Enter a valid trustee commission percent.');
    }

    const rule: TrusteeRule = {
      id: `${selectedBranch}-${trusteeName.trim().toLowerCase().replace(/\s+/g, '-')}`,
      trusteeName: trusteeName.trim(),
      contactInfo: contactInfo.trim(),
      branch: selectedBranch,
      percentage: parsedPercentage,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    const nextRules = [
      ...rules.filter((existing) => existing.id !== rule.id),
      rule,
    ];
    saveRules(nextRules);
    setMessage(`Saved ${rule.percentage}% trustee commission for ${rule.trusteeName} on Branch ${selectedBranch}.`);
  };

  const loadCommissions = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);

      if (start > end) {
        setSales([]);
        setError('From date must be before or equal to To date.');
        setLoading(false);
        return;
      }

      const response = await api.get('/sales', {
        params: {
          branchId: BRANCH_MAP[selectedBranch],
          fromDate: start.toISOString(),
          toDate: end.toISOString(),
          includeVoided: false,
          pageSize: 200,
        },
      });
      setSales(extractSales(response.data));
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data;
      setSales([]);
      setError(
        `Request failed${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? err?.message ?? 'Failed to load trustee commission'
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
          <h2 className="text-2xl font-bold text-black">Trustee Commission</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Calculate trustee employee commissions separately from regular employee commission rules.
          </p>
        </div>
        <button type="button" onClick={loadCommissions} className="btn-primary">
          Load trustee commission
        </button>
      </div>

      <section className="mt-6 grid grid-cols-5 gap-3">
        {branches.map((branch) => (
          <button
            key={branch}
            type="button"
            onClick={() => setSelectedBranch(branch)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition-all ${
              selectedBranch === branch
                ? 'border-magenta-500 bg-magenta-500 text-white shadow-lg'
                : 'border-gray-200 bg-white text-gray-800 hover:border-magenta-300 hover:bg-magenta-50'
            }`}
          >
            Branch {branch}
          </button>
        ))}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">Trustee rule</h3>
          <p className="mt-1 text-sm text-gray-600">
            Save a trustee percentage for the selected branch.
          </p>

          <label className="mt-4 block text-sm font-medium text-gray-700">Trustee employee</label>
          <input
            value={trusteeName}
            onChange={(event) => setTrusteeName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="Trustee employee name"
          />

          <label className="mt-4 block text-sm font-medium text-gray-700">Contact / email</label>
          <input
            value={contactInfo}
            onChange={(event) => setContactInfo(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="trustee@example.com"
          />

          <label className="mt-4 block text-sm font-medium text-gray-700">Commission percent</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={percentage}
            onChange={(event) => setPercentage(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          <button type="button" onClick={saveRule} className="btn-primary mt-4 w-full">
            Save trustee rule
          </button>
          {message && <p className="mt-3 text-sm text-magenta-600">{message}</p>}

          <div className="mt-5 space-y-3">
            {branchRules.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                No trustee rules for Branch {selectedBranch}.
              </div>
            ) : (
              branchRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`rounded-2xl border p-4 ${
                    rule.isActive ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-black">{rule.trusteeName}</div>
                      <div className="text-sm text-gray-600">{rule.contactInfo || 'No contact'}</div>
                      <div className="mt-1 text-sm font-semibold text-magenta-600">
                        Trustee rate: {rule.percentage}% for Branch {rule.branch}
                      </div>
                    </div>
                    <span className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                      Active
                    </span>
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
                <label className="block text-sm font-medium text-gray-700">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="rounded-2xl bg-magenta-500 p-4 text-white">
                <div className="text-sm opacity-80">Branch revenue</div>
                <div className="mt-1 text-2xl font-bold">${branchRevenue.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl bg-black p-4 text-white">
                <div className="text-sm opacity-80">Trustee commission</div>
                <div className="mt-1 text-2xl font-bold">${totalTrusteeCommission.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm">
              Loading trustee commission...
            </div>
          ) : error ? (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-sm">
              {error}
            </div>
          ) : (
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-black">Trustee commission results</h3>
              {trusteeResults.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                  Add or enable a trustee rule, then load commission.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {trusteeResults.map((result) => (
                    <div key={result.id} className="rounded-2xl border border-magenta-200 bg-magenta-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-semibold text-black">{result.trusteeName}</div>
                          <div className="text-sm text-gray-600">
                            Branch sales counted: {result.salesCount} · Trustee rate: {result.percentage}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Commission</div>
                          <div className="text-2xl font-bold text-magenta-600">
                            ${result.commissionAmount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
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
