import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentUser } from '../lib/auth';
import { isAutoManagedCuttingTask } from '../lib/cuttingTasks';
import {
  branches,
  completeTask,
  getScheduleLabel,
  getTaskDisplayTitle,
  isTaskComplete,
  readTasks,
  type BranchCode,
  type BranchTask,
} from '../lib/taskSettings';

const TaskEmployee: React.FC = () => {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('A');
  const [tasks, setTasks] = useState<BranchTask[]>(() => readTasks());
  const [message, setMessage] = useState<string | null>(null);

  const employeeName = user?.name || user?.email || t('common.employeeRole');
  const employeeEmail = user?.email || employeeName;

  const formatDateTime = (dateString?: string) =>
    dateString
      ? new Date(dateString).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      : t('common.notCheckedYet');

  const branchTasks = useMemo(
    () => tasks.filter((task) => task.branch === selectedBranch),
    [selectedBranch, tasks]
  );
  const openTasks = branchTasks.filter((task) => !isTaskComplete(task));
  const doneTasks = branchTasks.filter(isTaskComplete);

  const refresh = () => setTasks(readTasks());

  useEffect(() => {
    const onTasksUpdated = () => refresh();
    window.addEventListener('branch-tasks-updated', onTasksUpdated);
    return () => window.removeEventListener('branch-tasks-updated', onTasksUpdated);
  }, []);

  const markDone = (task: BranchTask) => {
    const checkedBy = `${employeeName} (${employeeEmail})`;
    completeTask(task.id, checkedBy);
    refresh();
    setMessage(
      t('taskEmployee.checkedDone', {
        title: getTaskDisplayTitle(t, task),
        branch: task.branch,
      })
    );
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('taskEmployee.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{t('taskEmployee.subtitle')}</p>
        </div>
        <div className="text-sm text-gray-500">{t('taskEmployee.signedInAs', { name: employeeName })}</div>
      </div>

      <section className="mt-6 grid grid-cols-5 gap-3">
        {branches.map((branch) => (
          <button
            key={branch}
            type="button"
            onClick={() => setSelectedBranch(branch)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
              selectedBranch === branch
                ? 'border-magenta-500 bg-magenta-500 text-white shadow-lg'
                : 'border-gray-200 bg-white text-gray-800 hover:border-magenta-300 hover:bg-magenta-50'
            }`}
          >
            {t('branches.label', { code: branch })}
          </button>
        ))}
      </section>

      {message && <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
          <div className="text-sm text-red-700">{t('taskEmployee.openTasks')}</div>
          <div className="mt-1 text-3xl font-bold text-black">{openTasks.length}</div>
        </div>
        <div className="rounded-3xl border border-green-200 bg-green-50 p-5">
          <div className="text-sm text-green-700">{t('taskEmployee.doneTasks')}</div>
          <div className="mt-1 text-3xl font-bold text-black">{doneTasks.length}</div>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-black">{t('taskEmployee.checklistTitle', { branch: selectedBranch })}</h3>
        {branchTasks.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">{t('taskEmployee.noTasks')}</div>
        ) : (
          <div className="mt-4 space-y-3">
            {branchTasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-2xl border p-4 ${
                  isTaskComplete(task)
                    ? 'border-green-500 border-l-8 bg-green-100 shadow-sm'
                    : task.templateKey === 'CUTTING_FABRIC_ROLL'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-red-300 bg-red-50'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-black">{getTaskDisplayTitle(t, task)}</span>
                      {isTaskComplete(task) && (
                        <span className="rounded-full bg-green-600 px-2 py-1 text-xs font-semibold text-white">
                          {t('common.done')}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {t('taskEmployee.assignedTo', {
                        schedule: getScheduleLabel(t, task.schedule),
                        name: task.assignedTo,
                      })}
                    </div>
                    {task.note && <div className="mt-2 text-sm text-gray-700">{task.note}</div>}
                    {isAutoManagedCuttingTask(task) && !isTaskComplete(task) && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-amber-800">
                        {t('taskEmployee.autoCompleteHint')}
                      </div>
                    )}
                    {isTaskComplete(task) && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-green-700">
                        {t('taskEmployee.checkedBy', {
                          name: task.checkedBy || t('common.unknownEmployee'),
                          date: formatDateTime(task.checkedAt),
                        })}
                      </div>
                    )}
                  </div>

                  {!isAutoManagedCuttingTask(task) && (
                    <button
                      type="button"
                      onClick={() => markDone(task)}
                      disabled={isTaskComplete(task)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                        isTaskComplete(task)
                          ? 'bg-gray-200 text-gray-500'
                          : 'bg-black text-white hover:bg-gray-800'
                      }`}
                    >
                      {isTaskComplete(task) ? t('common.done') : t('common.checkDone')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default TaskEmployee;
