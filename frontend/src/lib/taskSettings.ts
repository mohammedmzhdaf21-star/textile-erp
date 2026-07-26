import type { TFunction } from 'i18next';

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

export const TASK_TEMPLATE_TITLE_KEYS: Record<TaskTemplateKey, string> = {
  MOPPING: 'taskTemplates.MOPPING',
  DUSTING: 'taskTemplates.DUSTING',
  VACUUMING: 'taskTemplates.VACUUMING',
  CHANGE_HANGING_FABRIC: 'taskTemplates.CHANGE_HANGING_FABRIC',
  CHANGE_MANNEQUIN_FABRIC: 'taskTemplates.CHANGE_MANNEQUIN_FABRIC',
  CHANGE_LEFT_WALL_FABRIC: 'taskTemplates.CHANGE_LEFT_WALL_FABRIC',
  CHANGE_RIGHT_WALL_FABRIC: 'taskTemplates.CHANGE_RIGHT_WALL_FABRIC',
  CHANGE_BACK_WALL_FABRIC: 'taskTemplates.CHANGE_BACK_WALL_FABRIC',
  CHANGE_PILAR_SHELF_FABRIC: 'taskTemplates.CHANGE_PILAR_SHELF_FABRIC',
  CHANGE_RIGHT_SHELF_FABRIC: 'taskTemplates.CHANGE_RIGHT_SHELF_FABRIC',
  CHANGE_LEFT_SHELF_FABRIC: 'taskTemplates.CHANGE_LEFT_SHELF_FABRIC',
  CHANGE_BACK_SHELF_FABRIC: 'taskTemplates.CHANGE_BACK_SHELF_FABRIC',
  CHANGE_WINDOW_DISPLAY_MANNEQUINS: 'taskTemplates.CHANGE_WINDOW_DISPLAY_MANNEQUINS',
  CHANGE_OUTDOOR_MANNEQUINS: 'taskTemplates.CHANGE_OUTDOOR_MANNEQUINS',
  CHANGE_SHOP_MANNEQUINS: 'taskTemplates.CHANGE_SHOP_MANNEQUINS',
  WIPING_GLASS: 'taskTemplates.WIPING_GLASS',
  CUTTING_FABRIC_ROLL: 'taskTemplates.CUTTING_FABRIC_ROLL',
};

export const getTaskTemplateTitle = (
  t: TFunction,
  templateKey: TaskTemplateKey,
  params?: { code?: string | number }
) => {
  const key = TASK_TEMPLATE_TITLE_KEYS[templateKey];
  if (templateKey === 'CUTTING_FABRIC_ROLL') {
    return t(key, { code: params?.code ?? 'unknown' });
  }
  return t(key);
};

export const getTaskDisplayTitle = (t: TFunction, task: Pick<BranchTask, 'templateKey' | 'title' | 'code'>) => {
  if (task.templateKey in TASK_TEMPLATE_TITLE_KEYS) {
    return getTaskTemplateTitle(t, task.templateKey, { code: task.code });
  }
  return task.title;
};

export const recurringTaskTemplates: Array<{
  key: TaskAssignment['templateKey'];
  titleKey: string;
}> = [
  { key: 'MOPPING', titleKey: TASK_TEMPLATE_TITLE_KEYS.MOPPING },
  { key: 'DUSTING', titleKey: TASK_TEMPLATE_TITLE_KEYS.DUSTING },
  { key: 'VACUUMING', titleKey: TASK_TEMPLATE_TITLE_KEYS.VACUUMING },
  { key: 'CHANGE_HANGING_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_HANGING_FABRIC },
  { key: 'CHANGE_MANNEQUIN_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_MANNEQUIN_FABRIC },
  { key: 'CHANGE_LEFT_WALL_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_LEFT_WALL_FABRIC },
  { key: 'CHANGE_RIGHT_WALL_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_RIGHT_WALL_FABRIC },
  { key: 'CHANGE_BACK_WALL_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_BACK_WALL_FABRIC },
  { key: 'CHANGE_PILAR_SHELF_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_PILAR_SHELF_FABRIC },
  { key: 'CHANGE_RIGHT_SHELF_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_RIGHT_SHELF_FABRIC },
  { key: 'CHANGE_LEFT_SHELF_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_LEFT_SHELF_FABRIC },
  { key: 'CHANGE_BACK_SHELF_FABRIC', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_BACK_SHELF_FABRIC },
  { key: 'CHANGE_WINDOW_DISPLAY_MANNEQUINS', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_WINDOW_DISPLAY_MANNEQUINS },
  { key: 'CHANGE_OUTDOOR_MANNEQUINS', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_OUTDOOR_MANNEQUINS },
  { key: 'CHANGE_SHOP_MANNEQUINS', titleKey: TASK_TEMPLATE_TITLE_KEYS.CHANGE_SHOP_MANNEQUINS },
  { key: 'WIPING_GLASS', titleKey: TASK_TEMPLATE_TITLE_KEYS.WIPING_GLASS },
];

export const scheduleOptions: Array<{
  value: Exclude<TaskSchedule, 'ON_DEMAND'>;
  labelKey: string;
  days: number;
}> = [
  { value: 'DAILY', labelKey: 'schedules.DAILY', days: 1 },
  { value: 'EVERY_2_DAYS', labelKey: 'schedules.EVERY_2_DAYS', days: 2 },
  { value: 'WEEKLY', labelKey: 'schedules.WEEKLY', days: 7 },
  { value: 'MONTHLY', labelKey: 'schedules.MONTHLY', days: 30 },
  { value: 'YEARLY', labelKey: 'schedules.YEARLY', days: 365 },
];

export const getScheduleLabel = (t: TFunction, value: TaskSchedule | string) => {
  const option = scheduleOptions.find((entry) => entry.value === value);
  if (option) return t(option.labelKey);
  if (value === 'ON_DEMAND') return t('schedules.ON_DEMAND');
  return t('common.onDemand');
};

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
  t?: TFunction;
}) => {
  const codeText = input.code !== undefined ? String(input.code) : 'unknown';
  const title = input.t
    ? getTaskTemplateTitle(input.t, 'CUTTING_FABRIC_ROLL', { code: codeText })
    : `Cutting the fabric roll for code ${codeText}`;
  const note = input.t
    ? input.t('tasks.cuttingNote', {
        soldItemId: input.soldItemId,
        sourceItemId: input.sourceItemId,
        color: input.colorName,
      })
    : `Piece ${input.soldItemId} was sold. Cut another shelf piece from roll ${input.sourceItemId}${input.colorName ? ` (${input.colorName})` : ''}.`;
  return createTask({
    branch: input.branch,
    templateKey: 'CUTTING_FABRIC_ROLL',
    title,
    assignedTo: input.assignedTo || 'Inventory team',
    note,
    schedule: 'ON_DEMAND',
    sourceSaleId: input.saleId,
    sourceItemId: input.sourceItemId,
    code: input.code,
    colorName: input.colorName,
  });
};
