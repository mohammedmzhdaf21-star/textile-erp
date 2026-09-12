import api from './api';

export type QueueEmployee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type GreetingQueueState = {
  branchId: string;
  branchName: string;
  currentIndex: number;
  queue: QueueEmployee[];
  current: QueueEmployee | null;
  next: QueueEmployee | null;
  isMyTurn: boolean;
  totalToday: number;
  maghribTimeLabel: string;
  maghribPassedToday: boolean;
  nextDayStartsWith: QueueEmployee | null;
};

export type GreetingQueueEvent = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  greetedAt: string;
};

export async function fetchGreetingQueueState(branchId: string) {
  const { data } = await api.get<{ state: GreetingQueueState }>('/greeting-queue/state', {
    params: { branchId },
  });
  return data.state;
}

export async function advanceGreetingQueue(branchId: string) {
  const { data } = await api.post<{
    greeted: QueueEmployee;
    branchName: string;
    state: GreetingQueueState;
  }>('/greeting-queue/advance', { branchId });
  return data;
}

export async function fetchGreetingQueueEvents(branchId: string, limit = 20) {
  const { data } = await api.get<{ events: GreetingQueueEvent[] }>('/greeting-queue/events', {
    params: { branchId, limit },
  });
  return data.events;
}
