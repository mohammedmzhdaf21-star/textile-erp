import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { applyShopBranches, getShopBranches } from '../lib/inventoryCodes';
import { useShopBranches } from '../lib/useShopBranches';

const BranchesPage: React.FC = () => {
  const { t } = useTranslation();
  const branches = useShopBranches(true);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const response = await api.get<{ branches: Array<{ id: string; code: string; name: string }> }>('/branches');
    applyShopBranches(response.data.branches ?? []);
  };

  const addBranch = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/branches', { code, name });
      setCode('');
      setName('');
      await refresh();
      setMessage(t('branchAdmin.added'));
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? t('branchAdmin.failed'));
    } finally {
      setSaving(false);
    }
  };

  const removeBranch = async (id: string, label: string) => {
    if (!window.confirm(t('branchAdmin.removeConfirm', { name: label }))) return;
    setError(null);
    setMessage(null);
    try {
      await api.delete(`/branches/${id}`);
      await refresh();
      setMessage(t('branchAdmin.removed', { name: label }));
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? t('branchAdmin.failed'));
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold text-black">{t('branchAdmin.title')}</h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-600">{t('branchAdmin.subtitle')}</p>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-black">{t('branchAdmin.addTitle')}</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_auto]">
          <input
            value={code}
            maxLength={3}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
            placeholder={t('branchAdmin.codePlaceholder')}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm uppercase"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('branchAdmin.namePlaceholder')}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void addBranch()}
            disabled={saving || code.trim().length === 0 || name.trim().length === 0}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('branchAdmin.add')}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">{t('branchAdmin.codeHint')}</p>
      </section>

      <section className="mt-6 space-y-3">
        {branches.map((branch) => (
          <div
            key={branch.id}
            className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-base font-semibold text-black">{branch.name}</div>
              <div className="text-sm text-gray-500">
                {branch.code} · {branch.id}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void removeBranch(branch.id, branch.name || branch.code)}
              disabled={branch.code === 'S' || getShopBranches().filter((entry) => entry.code !== 'S').length <= 1}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              {t('branchAdmin.remove')}
            </button>
          </div>
        ))}
      </section>

      {message && <p className="mt-4 text-sm font-medium text-green-700">{message}</p>}
      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
};

export default BranchesPage;
