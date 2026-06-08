import React, { useMemo, useState } from 'react';
import { getCurrentUser } from '../lib/auth';
import {
  branches,
  completeTask,
  createTask,
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

const formatDateTime = (dateString?: string) =>
  dateString ? new Date(dateString).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled';

const scheduleLabel = (value: string) =>
  scheduleOptions.find((option) => option.value === value)?.label || 'On demand';

const Tasks: React.FC = () => {
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
    const assignment = upsertTaskAssignment({
      branch: selectedBranch,
      templateKey,
      title: selectedTemplate.title,
      assignedTo: assignedTo.trim() || 'Unassigned',
      note,
      schedule,
    });
    refresh();
    setMessage(`Assigned "${assignment.title}" to Branch ${selectedBranch} (${scheduleLabel(assignment.schedule)}).`);
  };

  const addManualCuttingTask = () => {
    const code = window.prompt('Enter fabric roll code to cut');
    if (!code) return;
    const task = createTask({
      branch: selectedBranch,
      templateKey: 'CUTTING_FABRIC_ROLL',
      title: `Cutting the fabric roll for code ${code}`,
      assignedTo: assignedTo.trim() || 'Inventory team',
      note: 'Manual cutting task created by admin/owner.',
      schedule: 'ON_DEMAND',
      code: Number(code),
    });
    refresh();
    setMessage(`Created ${task.title} for Branch ${selectedBranch}.`);
  };

  const toggleTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (!isTaskComplete(task)) {
      completeTask(taskId, `${user?.name || 'Admin'} (${user?.email || 'admin'})`);
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
          <h2 className="text-2xl font-bold text-black">Tasks</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Admin/owner task schedule by branch. Cutting tasks are also created automatically when a linked cut piece is sold.
          </p>
        </div>
        <div className="text-sm text-gray-500">Branch {selectedBranch}</div>
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

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">Assign recurring task</h3>
          <label className="mt-4 block text-sm font-medium text-gray-700">Task</label>
          <select
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value as TaskAssignment['templateKey'])}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            {recurringTaskTemplates.map((template) => (
              <option key={template.key} value={template.key}>{template.title}</option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium text-gray-700">Schedule</label>
          <select
            value={schedule}
            onChange={(event) => setSchedule(event.target.value as TaskAssignment['schedule'])}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            {scheduleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium text-gray-700">Employee email</label>
          <input
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="employee@textile.com"
          />

          <label className="mt-4 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="Optional task details..."
          />

          <button type="button" onClick={assignRecurringTask} className="btn-primary mt-4 w-full">
            Assign task to Branch {selectedBranch}
          </button>

          <button type="button" onClick={addManualCuttingTask} className="btn-secondary mt-3 w-full">
            Add cutting task manually
          </button>
        </section>

        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
              <div className="text-sm text-red-700">Open tasks</div>
              <div className="mt-1 text-3xl font-bold text-black">{openTasks.length}</div>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-sm text-amber-700">Cutting alerts</div>
              <div className="mt-1 text-3xl font-bold text-black">{cuttingTasks.length}</div>
            </div>
            <div className="rounded-3xl border border-green-200 bg-green-50 p-5">
              <div className="text-sm text-green-700">Done tasks</div>
              <div className="mt-1 text-3xl font-bold text-black">{doneTasks.length}</div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-black">Assigned schedule for Branch {selectedBranch}</h3>
            {branchAssignments.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                No recurring task assignments yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {branchAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-black">{assignment.title}</div>
                        <div className="mt-1 text-sm text-gray-600">
                          {scheduleLabel(assignment.schedule)} · Assigned to {assignment.assignedTo}
                        </div>
                        {assignment.note && <div className="mt-2 text-sm text-gray-700">{assignment.note}</div>}
                      </div>
                      <button type="button" onClick={() => createNextTask(assignment)} className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white">
                        Create next
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-black">Branch {selectedBranch} task list</h3>
            {branchTasks.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
                No tasks yet for this branch.
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
                          {task.dueAt ? ` · Due ${formatDateTime(task.dueAt)}` : ''}
                        </div>
                        {task.note && <div className="mt-2 text-sm text-gray-700">{task.note}</div>}
                        {isTaskComplete(task) && (
                          <div className="mt-2 rounded-xl bg-white px-3 py-2 text-sm text-green-700">
                            Checked by {task.checkedBy || 'Unknown employee'} at {formatDateTime(task.checkedAt)}
                          </div>
                        )}
                        {task.sourceItemId && (
                          <div className="mt-2 break-all text-xs text-gray-500">
                            Source roll: {task.sourceItemId}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleTask(task.id)}
                          className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white"
                        >
                          {isTaskComplete(task) ? 'Reopen' : 'Done'}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          className="rounded-xl border border-red-300 px-3 py-2 text-xs font-semibold text-red-600"
                        >
                          Delete
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
