import React, { useMemo, useState } from 'react';
import { getCurrentUser } from '../lib/auth';

type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';
type TaskStatus = 'TODO' | 'DONE';

type BranchTask = {
  id: string;
  branch: BranchCode;
  title: string;
  assignedTo: string;
  note: string;
  status: TaskStatus;
  createdAt: string;
};

const TASKS_KEY = 'textile-erp-branch-tasks';
const branches: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];

const readTasks = (): BranchTask[] => {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? (JSON.parse(raw) as BranchTask[]) : [];
  } catch {
    return [];
  }
};

const writeTasks = (tasks: BranchTask[]) => {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
};

const Tasks: React.FC = () => {
  const user = getCurrentUser();
  const [selectedBranch, setSelectedBranch] = useState<BranchCode>('A');
  const [tasks, setTasks] = useState<BranchTask[]>(() => readTasks());
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState(user?.email || '');
  const [note, setNote] = useState('');

  const branchTasks = useMemo(
    () => tasks.filter((task) => task.branch === selectedBranch),
    [selectedBranch, tasks]
  );

  const openTasks = branchTasks.filter((task) => task.status === 'TODO');
  const doneTasks = branchTasks.filter((task) => task.status === 'DONE');

  const saveTasks = (nextTasks: BranchTask[]) => {
    setTasks(nextTasks);
    writeTasks(nextTasks);
  };

  const addTask = () => {
    if (!title.trim()) return alert('Enter a task title.');

    const task: BranchTask = {
      id: `${selectedBranch}-${Date.now()}`,
      branch: selectedBranch,
      title: title.trim(),
      assignedTo: assignedTo.trim() || 'Unassigned',
      note: note.trim(),
      status: 'TODO',
      createdAt: new Date().toISOString(),
    };

    saveTasks([task, ...tasks]);
    setTitle('');
    setNote('');
  };

  const toggleTask = (taskId: string) => {
    saveTasks(
      tasks.map((task) =>
        task.id === taskId
          ? { ...task, status: task.status === 'TODO' ? 'DONE' : 'TODO' }
          : task
      )
    );
  };

  const deleteTask = (taskId: string) => {
    saveTasks(tasks.filter((task) => task.id !== taskId));
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Tasks</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-600">
            Branch work board for employee tasks. You can decide the exact task types later.
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">Add task</h3>
          <label className="mt-4 block text-sm font-medium text-gray-700">Task title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="Example: Count rolls, prepare exchange desk..."
          />

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
            placeholder="Add task details here..."
          />

          <button type="button" onClick={addTask} className="btn-primary mt-4 w-full">
            Save task for Branch {selectedBranch}
          </button>
        </section>

        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
              <div className="text-sm text-red-700">Open tasks</div>
              <div className="mt-1 text-3xl font-bold text-black">{openTasks.length}</div>
            </div>
            <div className="rounded-3xl border border-green-200 bg-green-50 p-5">
              <div className="text-sm text-green-700">Done tasks</div>
              <div className="mt-1 text-3xl font-bold text-black">{doneTasks.length}</div>
            </div>
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
                      task.status === 'DONE'
                        ? 'border-green-300 bg-green-50'
                        : 'border-red-300 bg-red-50'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-black">{task.title}</div>
                        <div className="mt-1 text-sm text-gray-600">Assigned to {task.assignedTo}</div>
                        {task.note && <div className="mt-2 text-sm text-gray-700">{task.note}</div>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleTask(task.id)}
                          className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white"
                        >
                          {task.status === 'DONE' ? 'Reopen' : 'Done'}
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
