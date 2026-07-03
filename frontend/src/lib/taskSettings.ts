export type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';
export type TaskStatus = 'TODO' | 'DONE';
export type TaskSchedule = 'DAILY' | 'EVERY_2_DAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'ON_DEMAND';

export type TaskTemplateKey =
  | 'MOPPING'
  | 'DUSTING'
  | 'VACUUMING'
  | 'CHANGE_HANGING_FABRIC'
  | 'CHANGE_MANNEQUIN_FABRIC'
  | 'CHANGE_LEFT_WALL_FABRIC'
  | 'CHANGE_RIGHT_WALL_FABRIC'
  | 'CHANGE_BACK_WALL_FABRIC'
  | 'CHANGE_PILAR_SHELF_FABRIC'
  | 'CHANGE_RIGHT_SHELF_FABRIC'
  | 'CHANGE_LEFT_SHELF_FABRIC'
  | 'CHANGE_BACK_SHELF_FABRIC'
  | 'CHANGE_WINDOW_DISPLAY_MANNEQUINS'
  | 'CHANGE_OUTDOOR_MANNEQUINS'
  | 'CHANGE_SHOP_MANNEQUINS'
  | 'WIPING_GLASS'
  | 'CUTTING_FABRIC_ROLL';

export type BranchTask = {
  id: string;
  branch: BranchCode;
  templateKey: TaskTemplateKey;
  title: string;
  assignedTo: string;
  note: string;
  schedule: TaskSchedule;
  status: TaskStatus;
  createdAt: string;
  checkedBy?: string;
  checkedAt?: string;
  dueAt?: string;
  sourceSaleId?: string;
  sourceItemId?: string;
  code?: number;
  colorName?: string;
};

export type TaskAssignment = {
  id: string;
  branch: BranchCode;
  templateKey: Exclude<TaskTemplateKey, 'CUTTING_FABRIC_ROLL'>;
  title: string;
  assignedTo: string;
  note: string;
  schedule: Exclude<TaskSchedule, 'ON_DEMAND'>;
  updatedAt: string;
};

export const TASKS_KEY = 'textile-erp-branch-tasks';
export const TASK_ASSIGNMENTS_KEY = 'textile-erp-branch-task-assignments';

export const branches: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];

export const recurringTaskTemplates: Array<{
  key: TaskAssignment['templateKey'];
  title: string;
}> = [
  { key: 'MOPPING', title: 'Mopping' },
  { key: 'DUSTING', title: 'Dusting' },
  { key: 'VACUUMING', title: 'Vacuuming' },
  { key: 'CHANGE_HANGING_FABRIC', title: 'Changing the hanging fabric' },
  { key: 'CHANGE_MANNEQUIN_FABRIC', title: "Changing the mannequin's fabric" },
  { key: 'CHANGE_LEFT_WALL_FABRIC', title: 'Changing the left-side wall fabric' },
  { key: 'CHANGE_RIGHT_WALL_FABRIC', title: 'Changing the right-side wall fabric' },
  { key: 'CHANGE_BACK_WALL_FABRIC', title: 'Changing the back wall fabric' },
  { key: 'CHANGE_PILAR_SHELF_FABRIC', title: 'Changing the pilar shelf fabric' },
  { key: 'CHANGE_RIGHT_SHELF_FABRIC', title: 'Changing the right shelf fabric' },
  { key: 'CHANGE_LEFT_SHELF_FABRIC', title: 'Changing the left shelf fabric' },
  { key: 'CHANGE_BACK_SHELF_FABRIC', title: 'Changing the back shelf fabric' },
  { key: 'CHANGE_WINDOW_DISPLAY_MANNEQUINS', title: 'Changing the fabric of the window display mannequins' },
  { key: 'CHANGE_OUTDOOR_MANNEQUINS', title: 'Changing the fabric of the outdoor mannequins' },
  { key: 'CHANGE_SHOP_MANNEQUINS', title: 'Changing the fabric of the mannequins inside the shop' },
  { key: 'WIPING_GLASS', title: 'Wiping the glass' },
];

export const scheduleOptions: Array<{ value: Exclude<TaskSchedule, 'ON_DEMAND'>; label: string; days: number }> = [
  { value: 'DAILY', label: 'Every day', days: 1 },
  { value: 'EVERY_2_DAYS', label: 'Every two days', days: 2 },
  { value: 'WEEKLY', label: 'Every week', days: 7 },
  { value: 'MONTHLY', label: 'Every month', days: 30 },
  { value: 'YEARLY', label: 'Every year', days: 365 },
];

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = <T,>(key: string, value: T) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const readTasks = () => readJson<BranchTask[]>(TASKS_KEY, []);
export const writeTasks = (tasks: BranchTask[]) => writeJson(TASKS_KEY, tasks);
export const readTaskAssignments = () => readJson<TaskAssignment[]>(TASK_ASSIGNMENTS_KEY, []);
export const writeTaskAssignments = (assignments: TaskAssignment[]) =>
  writeJson(TASK_ASSIGNMENTS_KEY, assignments);

export const nextDueAt = (schedule: TaskAssignment['schedule'], from = new Date()) => {
  const days = scheduleOptions.find((option) => option.value === schedule)?.days || 1;
  const due = new Date(from);
  due.setDate(due.getDate() + days);
  return due.toISOString();
};

export const isTaskComplete = (task: BranchTask) =>
  task.status === 'DONE' || Boolean(task.checkedAt);

export const createTask = (task: Omit<BranchTask, 'id' | 'createdAt' | 'status'>) => {
  const nextTask: BranchTask = {
    ...task,
    id: `${task.branch}-${task.templateKey}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: 'TODO',
  };
  writeTasks([nextTask, ...readTasks()]);
  window.dispatchEvent(new Event('branch-tasks-updated'));
  return nextTask;
};

export const completeTask = (taskId: string, checkedBy: string) => {
  const completedAt = new Date().toISOString();
  const nextTasks = readTasks().map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: 'DONE' as const,
          checkedBy,
          checkedAt: completedAt,
        }
      : task
  );
  writeTasks(nextTasks);
  window.dispatchEvent(new Event('branch-tasks-updated'));
  return nextTasks.find((task) => task.id === taskId);
};

export const reopenTask = (taskId: string) => {
  const nextTasks = readTasks().map((task) =>
    task.id === taskId
      ? {
          ...task,
          status: 'TODO' as const,
          checkedBy: undefined,
          checkedAt: undefined,
        }
      : task
  );
  writeTasks(nextTasks);
  window.dispatchEvent(new Event('branch-tasks-updated'));
  return nextTasks.find((task) => task.id === taskId);
};

export const upsertTaskAssignment = (assignment: Omit<TaskAssignment, 'id' | 'updatedAt'>) => {
  const id = `${assignment.branch}-${assignment.templateKey}`;
  const nextAssignment: TaskAssignment = {
    ...assignment,
    id,
    updatedAt: new Date().toISOString(),
  };
  const assignments = readTaskAssignments().filter((item) => item.id !== id);
  writeTaskAssignments([nextAssignment, ...assignments]);

  createTask({
    branch: assignment.branch,
    templateKey: assignment.templateKey,
    title: assignment.title,
    assignedTo: assignment.assignedTo,
    note: assignment.note,
    schedule: assignment.schedule,
    dueAt: nextDueAt(assignment.schedule),
  });

  return nextAssignment;
};

export const createCuttingTaskFromSale = (input: {
  branch: BranchCode;
  code?: number;
  colorName?: string;
  sourceItemId: string;
  soldItemId: string;
  saleId?: string;
  assignedTo?: string;
}) => {
  const codeText = input.code !== undefined ? String(input.code) : 'unknown';
  return createTask({
    branch: input.branch,
    templateKey: 'CUTTING_FABRIC_ROLL',
    title: `Cutting the fabric roll for code ${codeText}`,
    assignedTo: input.assignedTo || 'Inventory team',
    note: `Piece ${input.soldItemId} was sold. Cut another shelf piece from roll ${input.sourceItemId}${input.colorName ? ` (${input.colorName})` : ''}.`,
    schedule: 'ON_DEMAND',
    sourceSaleId: input.saleId,
    sourceItemId: input.sourceItemId,
    code: input.code,
    colorName: input.colorName,
  });
};
