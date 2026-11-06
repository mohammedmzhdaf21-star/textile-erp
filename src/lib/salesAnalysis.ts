import prisma from './prisma';

export type AnalysisItem = {
  quantitySold: number;
  soldPrice: number;
  lineDiscount?: number;
  colorName?: string | null;
  designCode?: string | number | null;
};

export type AnalysisSale = {
  id: string;
  createdAt: string | Date;
  totalPrice: number;
  employeeName?: string | null;
  items: AnalysisItem[];
};

export type AnalysisTask = {
  assignedTo: string;
  status: 'TODO' | 'DONE';
  designCode?: string | number | null;
  colorName?: string | null;
};

export type DesignColorRow = {
  designCode: string;
  color: string;
  quantity: number;
  revenue: number;
  saleCount: number;
};

export type SalesBreakdown = {
  saleCount: number;
  revenue: number;
  quantity: number;
  byDay: Array<{ date: string; revenue: number; saleCount: number }>;
  byEmployee: Array<{ employee: string; revenue: number; saleCount: number }>;
  byDesignColor: DesignColorRow[];
};

export type TaskBreakdown = {
  open: number;
  done: number;
  byEmployee: Array<{ employee: string; open: number; done: number }>;
  byDesignColor: Array<{ designCode: string; color: string; open: number; done: number }>;
};

const UNKNOWN = '';

export function baghdadTodayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function baghdadDayBounds(dayKey: string) {
  return {
    start: new Date(`${dayKey}T00:00:00.000+03:00`),
    end: new Date(`${dayKey}T23:59:59.999+03:00`),
  };
}

export function addCalendarDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function designCodeLabel(value: string | number | null | undefined) {
  if (value === null || value === undefined) return UNKNOWN;
  const text = String(value).trim();
  return text.length > 0 ? text : UNKNOWN;
}

export function colorLabel(value: string | null | undefined) {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : UNKNOWN;
}

function lineRevenue(item: AnalysisItem) {
  return item.soldPrice * item.quantitySold - (item.lineDiscount ?? 0);
}

function dayKey(value: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function summarizeSales(sales: AnalysisSale[]): SalesBreakdown {
  const byDay = new Map<string, { revenue: number; saleIds: Set<string> }>();
  const byEmployee = new Map<string, { revenue: number; saleIds: Set<string> }>();
  const byDesign = new Map<
    string,
    { designCode: string; color: string; quantity: number; revenue: number; saleIds: Set<string> }
  >();
  let revenue = 0;
  let quantity = 0;

  for (const sale of sales) {
    const saleRevenue = asNumber(sale.totalPrice);
    revenue += saleRevenue;
    const date = dayKey(sale.createdAt);
    const employee = sale.employeeName?.trim() || 'Unknown Employee';

    const day = byDay.get(date) ?? { revenue: 0, saleIds: new Set<string>() };
    day.revenue += saleRevenue;
    day.saleIds.add(sale.id);
    byDay.set(date, day);

    const person = byEmployee.get(employee) ?? { revenue: 0, saleIds: new Set<string>() };
    person.revenue += saleRevenue;
    person.saleIds.add(sale.id);
    byEmployee.set(employee, person);

    for (const item of sale.items) {
      quantity += asNumber(item.quantitySold);
      const designCode = designCodeLabel(item.designCode);
      const color = colorLabel(item.colorName);
      const key = `${designCode}\u0000${color}`;
      const row = byDesign.get(key) ?? {
        designCode,
        color,
        quantity: 0,
        revenue: 0,
        saleIds: new Set<string>(),
      };
      row.quantity += asNumber(item.quantitySold);
      row.revenue += lineRevenue(item);
      row.saleIds.add(sale.id);
      byDesign.set(key, row);
    }
  }

  return {
    saleCount: sales.length,
    revenue: money(revenue),
    quantity: money(quantity),
    byDay: Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({
        date,
        revenue: money(row.revenue),
        saleCount: row.saleIds.size,
      })),
    byEmployee: Array.from(byEmployee.entries())
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([employee, row]) => ({
        employee,
        revenue: money(row.revenue),
        saleCount: row.saleIds.size,
      })),
    byDesignColor: Array.from(byDesign.values())
      .sort((a, b) => b.revenue - a.revenue || a.designCode.localeCompare(b.designCode))
      .map((row) => ({
        designCode: row.designCode,
        color: row.color,
        quantity: money(row.quantity),
        revenue: money(row.revenue),
        saleCount: row.saleIds.size,
      })),
  };
}

export function splitSalesByBaghdadDay(sales: AnalysisSale[], todayKey: string) {
  const daily: AnalysisSale[] = [];
  const history: AnalysisSale[] = [];
  for (const sale of sales) {
    if (dayKey(sale.createdAt) === todayKey) daily.push(sale);
    else if (dayKey(sale.createdAt) < todayKey) history.push(sale);
  }
  return {
    every: summarizeSales(sales),
    daily: summarizeSales(daily),
    history: summarizeSales(history),
  };
}

export function summarizeTasks(tasks: AnalysisTask[]): TaskBreakdown {
  const byEmployee = new Map<string, { open: number; done: number }>();
  const byDesign = new Map<string, { designCode: string; color: string; open: number; done: number }>();
  let open = 0;
  let done = 0;

  for (const task of tasks) {
    const employee = task.assignedTo.trim() || 'Unassigned';
    const person = byEmployee.get(employee) ?? { open: 0, done: 0 };
    const isDone = task.status === 'DONE';
    if (isDone) {
      done += 1;
      person.done += 1;
    } else {
      open += 1;
      person.open += 1;
    }
    byEmployee.set(employee, person);

    if (task.designCode == null && !task.colorName?.trim()) continue;
    const designCode = designCodeLabel(task.designCode);
    const color = colorLabel(task.colorName);
    const key = `${designCode}\u0000${color}`;
    const row = byDesign.get(key) ?? { designCode, color, open: 0, done: 0 };
    if (isDone) row.done += 1;
    else row.open += 1;
    byDesign.set(key, row);
  }

  return {
    open,
    done,
    byEmployee: Array.from(byEmployee.entries())
      .sort(([, a], [, b]) => b.open + b.done - (a.open + a.done))
      .map(([employee, row]) => ({ employee, ...row })),
    byDesignColor: Array.from(byDesign.values()).sort(
      (a, b) => b.open + b.done - (a.open + a.done) || a.designCode.localeCompare(b.designCode)
    ),
  };
}

export async function getBranchAnalysis(input: {
  branchId: string;
  fromDate: Date;
  toDate: Date;
  todayKey?: string;
}) {
  const todayKey = input.todayKey ?? baghdadTodayKey();
  const [sales, openTasks, doneTasks] = await Promise.all([
    prisma.sale.findMany({
      where: {
        branchId: input.branchId,
        isVoided: false,
        createdAt: { gte: input.fromDate, lte: input.toDate },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        totalPrice: true,
        employee: { select: { name: true } },
        items: {
          select: {
            quantitySold: true,
            soldPrice: true,
            lineDiscount: true,
            scannedCode: true,
            plainClothName: true,
            color: { select: { name: true } },
            inventoryItem: { select: { code: true } },
          },
        },
      },
    }),
    prisma.branchTaskEntry.findMany({
      where: { branchId: input.branchId, status: 'TODO', checkedAt: null },
      select: { assignedToEmail: true, code: true, colorName: true },
    }),
    prisma.branchTaskEntry.findMany({
      where: {
        branchId: input.branchId,
        status: 'DONE',
        checkedAt: { gte: input.fromDate, lte: input.toDate },
      },
      select: { assignedToEmail: true, code: true, colorName: true },
    }),
  ]);

  const normalized: AnalysisSale[] = sales.map((sale) => ({
    id: sale.id,
    createdAt: sale.createdAt,
    totalPrice: asNumber(sale.totalPrice),
    employeeName: sale.employee?.name,
    items: sale.items.map((item) => ({
      quantitySold: asNumber(item.quantitySold),
      soldPrice: asNumber(item.soldPrice),
      lineDiscount: asNumber(item.lineDiscount),
      colorName: item.color?.name,
      designCode: item.inventoryItem?.code ?? item.scannedCode ?? item.plainClothName,
    })),
  }));

  const tasks: AnalysisTask[] = [
    ...openTasks.map((task) => ({
      assignedTo: task.assignedToEmail,
      status: 'TODO' as const,
      designCode: task.code,
      colorName: task.colorName,
    })),
    ...doneTasks.map((task) => ({
      assignedTo: task.assignedToEmail,
      status: 'DONE' as const,
      designCode: task.code,
      colorName: task.colorName,
    })),
  ];

  return {
    todayKey,
    ...splitSalesByBaghdadDay(normalized, todayKey),
    tasks: summarizeTasks(tasks),
  };
}
