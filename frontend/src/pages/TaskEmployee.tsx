import React, { useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../lib/auth';
import { isAutoManagedCuttingTask } from '../lib/cuttingTasks';
import {
  branches,
  completeTask,
  isTaskComplete,
  readTasks,
  scheduleOptions,
  type BranchCode,
  type BranchTask,
} from '../lib/taskSettings';

const scheduleLabel = (value: string) =>
  scheduleOptions.find((option) => option.value === value)?.label || 'On demand';

const formatDateTime = (dateString?: string) =>
  dateString ? new Date(dateString).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not checked yet';

const TaskEmployee: React.FC = () => {
  const user = getCurrentUser();
  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('A');
  const [tasks, setTasks] = useState<BranchTask[]>(() => readTasks());
  const [message, setMessage] = useState<string | null>(null);

  const employeeName = user?.name || user?.email || 'Employee';
  const employeeEmail = user?.email || employeeName;

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
    setMessage(`Checked "${task.title}" in Branch ${task.branch} as done.`);
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Task Employee</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Employees check off assigned branch tasks here. Cutting tasks complete automatically when a roll is converted to a piece in Item Conversion.
          </p>
        </div>
        <div className="text-sm text-gray-500">Signed in as {employeeName}</div>
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
            Branch {branch}
          </button>
        ))}
      </section>

      {message && <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
          <div className="text-sm text-red-700">Open tasks</div>
          <div className="mt-1 text-3xl font-bold text-black">{openTasks.length}</div>
        </div>
        <div className="rounded-3xl border border-green-200 bg-green-50 p-5">
          <div className="text-sm text-green-700">Done tasks</div>
          <div className="mt-1 text-3xl font-bold text-black">{doneTasks.length}</div>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-black">Branch {selectedBranch} employee checklist</h3>
        {branchTasks.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
            No tasks assigned in this branch yet.
          </div>
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
                      <span className="font-semibold text-black">{task.title}</span>
                      {isTaskComplete(task) && (
                        <span className="rounded-full bg-green-600 px-2 py-1 text-xs font-semibold text-white">
                          Done
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {scheduleLabel(task.schedule)} · Assigned to {task.assignedTo}
                    </div>
                    {task.note && <div className="mt-2 text-sm text-gray-700">{task.note}</div>}
                    {isAutoManagedCuttingTask(task) && !isTaskComplete(task) && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-amber-800">
                        This cutting task is completed automatically in Item Conversion when the roll is cut into a shelf piece.
                      </div>
                    )}
                    {isTaskComplete(task) && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-green-700">
                        Checked by {task.checkedBy || 'Unknown employee'} at {formatDateTime(task.checkedAt)}
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
                      {isTaskComplete(task) ? 'Done' : 'Check done'}
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
