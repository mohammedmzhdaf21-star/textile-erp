import api from './api';
import type { BranchCode, BranchTask, TaskAssignment, TaskSchedule, TaskTemplateKey } from './taskSettings';

export async function fetchTasks(params?: { branch?: BranchCode; mine?: boolean }) {
  const { data } = await api.get<{ tasks: BranchTask[] }>('/tasks', {
    params: {
      branch: params?.branch,
      mine: params?.mine ? 'true' : undefined,
    },
  });
  return data.tasks;
}

export async function fetchTaskAssignments(branch?: BranchCode) {
  const { data } = await api.get<{ assignments: TaskAssignment[] }>('/tasks/assignments', {
    params: branch ? { branch } : undefined,
  });
  return data.assignments;
}

export async function fetchOpenTaskCount(mine?: boolean) {
  const { data } = await api.get<{ count: number }>('/tasks/open-count', {
    params: mine ? { mine: 'true' } : undefined,
  });
  return data.count;
}

export async function createTaskApi(input: {
  branch: BranchCode;
  templateKey: TaskTemplateKey;
  title: string;
  assignedTo: string;
  note?: string;
  schedule: TaskSchedule;
  dueAt?: string;
  sourceSaleId?: string;
  sourceItemId?: string;
  code?: number;
  colorName?: string;
}) {
  const { data } = await api.post<{ task: BranchTask }>('/tasks', input);
  return data.task;
}

export async function upsertTaskAssignmentApi(input: {
  branch: BranchCode;
  templateKey: Exclude<TaskTemplateKey, 'CUTTING_FABRIC_ROLL'>;
  title: string;
  assignedTo: string;
  note?: string;
  schedule: Exclude<TaskSchedule, 'ON_DEMAND'>;
}) {
  const { data } = await api.put<{ assignment: TaskAssignment; task: BranchTask }>(
    '/tasks/assignments',
    input
  );
  return data;
}

export async function completeTaskApi(taskId: string, checkedBy: string) {
  const { data } = await api.patch<{ task: BranchTask }>(`/tasks/${encodeURIComponent(taskId)}/complete`, {
    checkedBy,
  });
  return data.task;
}

export async function reopenTaskApi(taskId: string) {
  const { data } = await api.patch<{ task: BranchTask }>(`/tasks/${encodeURIComponent(taskId)}/reopen`);
  return data.task;
}

export async function deleteTaskApi(taskId: string) {
  await api.delete(`/tasks/${encodeURIComponent(taskId)}`);
}

export async function hasOpenCuttingTaskApi(input: {
  branch: BranchCode;
  code?: number;
  colorName?: string;
}) {
  const { data } = await api.get<{ open: boolean }>('/tasks/cutting/open', { params: input });
  return data.open;
}

export async function completeCuttingTasksApi(input: {
  branch: BranchCode;
  rollItemId?: string;
  code?: number;
  colorName?: string;
}) {
  const { data } = await api.post<{ tasks: BranchTask[] }>('/tasks/cutting/complete', input);
  return data.tasks;
}

export const notifyTasksUpdated = () => {
  window.dispatchEvent(new Event('branch-tasks-updated'));
};
