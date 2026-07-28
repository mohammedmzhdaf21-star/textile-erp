import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentUser } from '../lib/auth';
import {
  branches,
  completeTask,
  createTask,
  getScheduleLabel,
  getTaskDisplayTitle,
  getTaskTemplateTitle,
  isTaskComplete,
  nextDueAt,
  readTaskAssignments,
  readTasks,
  recurringTaskTemplates,
  scheduleOptions,
  upsertTaskAssignment,
  reopenTask,
  writeTasks,
  type BranchCode,
  type BranchTask,
  type TaskAssignment,
} from '../lib/taskSettings';
import { isAutoManagedCuttingTask } from '../lib/cuttingTasks';

const Tasks: React.FC = () => {
  const { t } = useTranslation();
  const user = getCurrentUser();
  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('A');
  const [assignments, setAssignments] = useState<TaskAssignment[]>(() => readTaskAssignments());
  const [tasks, setTasks] = useState<BranchTask[]>(() => readTasks());
  const [templateKey, setTemplateKey] = useState<TaskAssignment['templateKey']>('MOPPING');
  const selectedTemplate = recurringTaskTemplates.find((template) => template.key === templateKey) || recurringTaskTemplates[0];
  const [assignedTo, setAssignedTo] = useState(user?.email || '');
  const [note, setNote] = useState('');
  const [schedule, setSchedule] = useState<TaskAssignment['schedule']>('DAILY');
  const [message, setMessage] = useState<string | null>(null);

  const formatDateTime = (dateString?: string) =>
    dateString
      ? new Date(dateString).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
      : t('common.notScheduled');

  const refreshTasks = () => {
    setTasks(readTasks());
    setAssignments(readTaskAssignments());
  };

  useEffect(() => {
    const onTasksUpdated = () => refreshTasks();
    window.addEventListener('branch-tasks-updated', onTasksUpdated);
    return () => window.removeEventListener('branch-tasks-updated', onTasksUpdated);
  }, []);

  const branchAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.branch === selectedBranch),
    [assignments, selectedBranch]
  );

  const branchTasks = useMemo(
    () => tasks.filter((task) => task.branch === selectedBranch),
    [selectedBranch, tasks]
  );

  const openTasks = branchTasks.filter((task) => !isTaskComplete(task));
  const doneTasks = branchTasks.filter(isTaskComplete);
  const cuttingTasks = openTasks.filter((task) => task.templateKey === 'CUTTING_FABRIC_ROLL');

  const refresh = () => {
    setAssignments(readTaskAssignments());
    setTasks(readTasks());
  };

  const assignRecurringTask = () => {
    const title = t(selectedTemplate.titleKey);
    const assignment = upsertTaskAssignment({
      branch: selectedBranch,
      templateKey,
      title,
      assignedTo: assignedTo.trim() || t('common.unassigned'),
      note,
      schedule,
    });
    refresh();
    setMessage(
      t('tasks.assignedMessage', {
        title: getTaskDisplayTitle(t, { templateKey: assignment.templateKey, title: assignment.title, code: undefined }),
        branch: selectedBranch,
        schedule: getScheduleLabel(t, assignment.schedule),
      })
    );
  };

  const addManualCuttingTask = () => {
    const code = window.prompt(t('tasks.cuttingPrompt'));
    if (!code) return;
    const title = getTaskTemplateTitle(t, 'CUTTING_FABRIC_ROLL', { code });
    const task = createTask({
      branch: selectedBranch,
      templateKey: 'CUTTING_FABRIC_ROLL',
      title,
      assignedTo: assignedTo.trim() || t('common.inventoryTeam'),
      note: t('tasks.manualCuttingNote'),
      schedule: 'ON_DEMAND',
      code: Number(code),
    });
    refresh();
    setMessage(t('tasks.createdTask', { title: getTaskDisplayTitle(t, task), branch: selectedBranch }));
  };

  const toggleTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!isTaskComplete(task)) {
      completeTask(taskId, `${user?.name || t('common.admin')} (${user?.email || 'admin'})`);
    } else {
      reopenTask(taskId);
    }
    refresh();
  };

  const deleteTask = (taskId: string) => {
    const nextTasks = tasks.filter((task) => task.id !== taskId);
    setTasks(nextTasks);
    writeTasks(nextTasks);
  };

  const createNextTask = (assignment: TaskAssignment) => {
    createTask({
      branch: assignment.branch,
      templateKey: assignment.templateKey,
      title: assignment.title,
      assignedTo: assignment.assignedTo,
      note: assignment.note,
      schedule: assignment.schedule,
      dueAt: nextDueAt(assignment.schedule),
    });
    refresh();
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('tasks.title')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">{t('tasks.subtitle')}</p>
        </div>
        <div className="text-sm text-gray-500">{t('tasks.currentBranch', { branch: selectedBranch })}</div>
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

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">{t('tasks.assignRecurring')}</h3>
          <label className="mt-4 block text-sm font-medium text-gray-700">{t('tasks.task')}</label>
          <select
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value as TaskAssignment['templateKey'])}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            {recurringTaskTemplates.map((template) => (
              <option key={template.key} value={template.key}>{t(template.titleKey)}</option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('tasks.schedule')}</label>
          <select
            value={schedule}
            onChange={(event) => setSchedule(event.target.value as TaskAssignment['schedule'])}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            {scheduleOptions.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('tasks.employeeEmail')}</label>
          <input
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('tasks.employeeEmailPlaceholder')}
          />

          <label className="mt-4 block text-sm font-medium text-gray-700">{t('tasks.notes')}</label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder={t('tasks.notesPlaceholder')}
          />

          <button type="button" onClick={assignRecurringTask} className="btn-primary mt-4 w-full">
            {t('tasks.assignToBranch', { branch: selectedBranch })}
          </button>

          <button type="button" onClick={addManualCuttingTask} className="btn-secondary mt-3 w-full">
            {t('tasks.addCuttingManually')}
          </button>
        </section>

        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
              <div className="text-sm text-red-700">{t('tasks.openTasks')}</div>
              <div className="mt-1 text-3xl font-bold text-black">{openTasks.length}</div>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-sm text-amber-700">{t('tasks.cuttingAlerts')}</div>
              <div className="mt-1 text-3xl font-bold text-black">{cuttingTasks.length}</div>
            </div>
            <div className="rounded-3xl border border-green-200 bg-green-50 p-5">
              <div className="text-sm text-green-700">{t('tasks.doneTasks')}</div>
              <div className="mt-1 text-3xl font-bold text-black">{doneTasks.length}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-black">{t('tasks.assignedSchedule', { branch: selectedBranch })}</h3>
            {branchAssignments.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">{t('tasks.noAssignments')}</div>
            ) : (
              <div className="mt-4 space-y-3">
                {branchAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-black">
                          {getTaskDisplayTitle(t, { templateKey: assignment.templateKey, title: assignment.title, code: undefined })}
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {t('tasks.assignedTo', {
                            schedule: getScheduleLabel(t, assignment.schedule),
                            name: assignment.assignedTo,
                          })}
                        </div>
                        {assignment.note && <div className="mt-2 text-sm text-gray-700">{assignment.note}</div>}
                      </div>
                      <button type="button" onClick={() => createNextTask(assignment)} className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                        {t('common.createNext')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-black">{t('tasks.branchTaskList', { branch: selectedBranch })}</h3>
            {branchTasks.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">{t('tasks.noTasks')}</div>
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
                          {t('tasks.assignedTo', {
                            schedule: getScheduleLabel(t, task.schedule),
                            name: task.assignedTo,
                          })}
                          {task.dueAt ? t('tasks.dueAt', { date: formatDateTime(task.dueAt) }) : ''}
                        </div>
                        {task.note && <div className="mt-2 text-sm text-gray-700">{task.note}</div>}
                        {isTaskComplete(task) && (
                          <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-green-700">
                            {t('tasks.checkedBy', {
                              name: task.checkedBy || t('common.unknownEmployee'),
                              date: formatDateTime(task.checkedAt),
                            })}
                          </div>
                        )}
                        {task.sourceItemId && (
                          <div className="mt-2 break-all text-xs text-gray-500">
                            {t('tasks.sourceRoll', { id: task.sourceItemId })}
                          </div>
                        )}
                        {isAutoManagedCuttingTask(task) && !isTaskComplete(task) && (
                          <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs text-amber-800">
                            {t('tasks.autoCompleteHint')}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!isAutoManagedCuttingTask(task) && (
                          <button
                            type="button"
                            onClick={() => toggleTask(task.id)}
                            className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white"
                          >
                            {isTaskComplete(task) ? t('common.reopen') : t('common.done')}
                          </button>
                        )}
                        {isAutoManagedCuttingTask(task) && isTaskComplete(task) && (
                          <button
                            type="button"
                            onClick={() => toggleTask(task.id)}
                            className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
                          >
                            {t('common.reopen')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-600"
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Tasks;
