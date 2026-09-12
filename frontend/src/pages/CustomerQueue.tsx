import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentUser, type User } from '../lib/auth';
import {
  BRANCH_CODE_BY_ID,
  BRANCH_DESTINATIONS,
  BRANCH_ID_BY_CODE,
  type BranchDestinationCode,
} from '../lib/inventoryCodes';
import {
  advanceGreetingQueue,
  fetchGreetingQueueEvents,
  fetchGreetingQueueState,
  type GreetingQueueEvent,
  type GreetingQueueState,
} from '../lib/greetingQueueApi';

const defaultBranchForUser = (user: User | null): BranchDestinationCode => {
  if (user?.branchIds?.length) {
    const code = BRANCH_CODE_BY_ID[user.branchIds[0]];
    if (code) return code;
  }
  return 'A';
};

const CustomerQueue: React.FC = () => {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const [selectedBranch, setSelectedBranch] = useState<BranchDestinationCode>(() =>
    defaultBranchForUser(user)
  );
  const [state, setState] = useState<GreetingQueueState | null>(null);
  const [events, setEvents] = useState<GreetingQueueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchId = BRANCH_ID_BY_CODE[selectedBranch];
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [queueState, recentEvents] = await Promise.all([
        fetchGreetingQueueState(branchId),
        fetchGreetingQueueEvents(branchId),
      ]);
      setState(queueState);
      setEvents(recentEvents);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t('customerQueue.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [branchId, t]);

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const branchLabel = useMemo(() => {
    const branch = BRANCH_DESTINATIONS.find((entry) => entry.code === selectedBranch);
    return branch ? t(branch.labelKey) : selectedBranch;
  }, [selectedBranch, t]);

  const canAdvance = Boolean(state?.current && (state.isMyTurn || isAdmin));

  const handleAdvance = async () => {
    if (!state?.current || advancing) return;

    setAdvancing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await advanceGreetingQueue(branchId);
      setState(result.state);
      setMessage(
        t('customerQueue.greetedSuccess', {
          name: result.greeted.name,
          nowUp: result.state.current?.name ?? t('customerQueue.noOne'),
        })
      );
      const recentEvents = await fetchGreetingQueueEvents(branchId);
      setEvents(recentEvents);
    } catch (advanceError: unknown) {
      setError(
        advanceError instanceof Error ? advanceError.message : t('customerQueue.advanceFailed')
      );
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-black">{t('customerQueue.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-600">{t('customerQueue.subtitle')}</p>
        <ol className="mt-4 max-w-3xl list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>{t('customerQueue.stepWait')}</li>
          <li>{t('customerQueue.stepAdvance')}</li>
        </ol>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-700">{t('customerQueue.maghribLabel')}</p>
          <p className="mt-1 text-sm text-gray-600">
            {t('customerQueue.maghribTime', { time: state?.maghribTimeLabel ?? '—' })}
          </p>
          {state?.maghribPassedToday && state.nextDayStartsWith && (
            <p className="mt-2 text-sm font-medium text-gray-800">
              {t('customerQueue.nextDayStartsWith', { name: state.nextDayStartsWith.name })}
            </p>
          )}
        </div>
        <label className="block text-sm font-medium text-gray-700">{t('customerQueue.branch')}</label>
        <select
          className="mt-2 w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2"
          value={selectedBranch}
          onChange={(event) => setSelectedBranch(event.target.value as BranchDestinationCode)}
        >
          {BRANCH_DESTINATIONS.map((branch) => (
            <option key={branch.code} value={branch.code}>
              {t(branch.labelKey)} ({branch.id})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      )}

      {loading && !state ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : state ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div
              className={`rounded-2xl border-2 p-6 shadow-sm ${
                state.isMyTurn
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
                {t('customerQueue.currentTurn')}
              </p>
              <h2 className="mt-2 text-4xl font-bold text-black">
                {state.current?.name ?? t('customerQueue.noSalesStaff')}
              </h2>
              {state.current && (
                <p className="mt-1 text-sm text-gray-600">{state.current.email}</p>
              )}

              <div className="mt-6 rounded-xl bg-white/80 p-4">
                <p className="text-sm text-gray-600">{t('customerQueue.nextUp')}</p>
                <p className="text-xl font-semibold text-gray-900">
                  {state.next?.name ?? t('customerQueue.noOne')}
                </p>
              </div>

              <p className="mt-4 text-sm text-gray-600">
                {t('customerQueue.todayCount', { count: state.totalToday })}
              </p>

              {state.isMyTurn && (
                <p className="mt-2 text-sm font-semibold text-green-700">
                  {t('customerQueue.yourTurn')}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleAdvance()}
              disabled={!canAdvance || advancing || state.queue.length === 0}
              className={`w-full rounded-xl px-6 py-5 text-lg font-bold transition-colors ${
                canAdvance && !advancing && state.queue.length > 0
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'cursor-not-allowed bg-gray-200 text-gray-500'
              }`}
            >
              {advancing ? t('common.loading') : t('customerQueue.advanceButton')}
            </button>

            <p className="text-center text-sm text-gray-500">{t('customerQueue.saleOptionalNote')}</p>

            {!state.isMyTurn && state.current && !isAdmin && (
              <p className="text-center text-sm text-gray-500">
                {t('customerQueue.waitForTurn', { name: state.current.name })}
              </p>
            )}

            {isAdmin && state.current && !state.isMyTurn && (
              <p className="text-center text-sm text-gray-500">{t('customerQueue.adminCanAdvance')}</p>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-black">{t('customerQueue.rotationOrder')}</h3>
              <p className="mt-1 text-sm text-gray-600">
                {t('customerQueue.rotationHint', { branch: branchLabel })}
              </p>

              {state.queue.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">{t('customerQueue.noSalesStaff')}</p>
              ) : (
                <ol className="mt-4 space-y-2">
                  {state.queue.map((employee, index) => {
                    const isCurrent = state.current?.id === employee.id;
                    return (
                      <li
                        key={employee.id}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                          isCurrent ? 'bg-black text-white' : 'bg-gray-50 text-gray-800'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                              isCurrent ? 'bg-white text-black' : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span>
                            <span className="font-medium">{employee.name}</span>
                            <span className={`block text-xs ${isCurrent ? 'text-gray-200' : 'text-gray-500'}`}>
                              {employee.email}
                            </span>
                          </span>
                        </span>
                        {isCurrent && (
                          <span className="text-xs font-semibold uppercase">{t('customerQueue.now')}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold text-black">{t('customerQueue.recentTurns')}</h3>
              {events.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">{t('customerQueue.noTurnsYet')}</p>
              ) : (
                <ul className="mt-4 divide-y divide-gray-100">
                  {events.map((event) => (
                    <li key={event.id} className="flex items-center justify-between py-3 text-sm">
                      <span className="font-medium text-gray-900">{event.employeeName}</span>
                      <span className="text-gray-500">{formatDateTime(event.greetedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CustomerQueue;
