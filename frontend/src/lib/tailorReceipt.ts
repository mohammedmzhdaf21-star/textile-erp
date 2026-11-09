export function todayInBaghdad(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const KURDISH_WEEKDAYS = [
  'یەکشەممە',
  'دووشەممە',
  'سێشەممە',
  'چوارشەممە',
  'پێنجشەممە',
  'هەینی',
  'شەممە',
];

const KURDISH_MONTHS = [
  'کانوونی دووەم',
  'شوبات',
  'ئازار',
  'نیسان',
  'ئایار',
  'حوزەیران',
  'تەممووز',
  'ئاب',
  'ئەیلوول',
  'تشرینی یەکەم',
  'تشرینی دووەم',
  'کانوونی یەکەم',
];

export function formatReceiptDate(isoDate: string, language: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (language.startsWith('ckb')) {
    return `${KURDISH_WEEKDAYS[date.getUTCDay()]}، ${day}ی ${KURDISH_MONTHS[month - 1]} ${year}`;
  }
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildTailorReceiptHtml(input: {
  title: string;
  codeLabel: string;
  nameLabel: string;
  givenLabel: string;
  returnLabel: string;
  costLabel: string;
  paidLabel: string;
  remainingLabel: string;
  code: number;
  customerName: string;
  givenOn: string;
  returnOn: string;
  cost: string;
  paid: string;
  remaining: string;
  dir: 'ltr' | 'rtl';
}) {
  const dir = input.dir === 'rtl' ? 'rtl' : 'ltr';
  return `<!DOCTYPE html>
<html lang="${dir === 'rtl' ? 'ckb' : 'en'}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.title)} ${input.code}</title>
    <style>
      body { font-family: Arial, "Noto Sans Arabic", sans-serif; margin: 24px; color: #111; }
      .slip { border: 2px solid #111; border-radius: 16px; padding: 24px; max-width: 360px; }
      .title { font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; margin: 0 0 16px; }
      .label { font-size: 12px; color: #444; margin: 14px 0 2px; }
      .code { font-size: 42px; font-weight: 700; margin: 0; }
      .value { font-size: 20px; font-weight: 700; margin: 0; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <div class="slip">
      <p class="title">${escapeHtml(input.title)}</p>
      <p class="label">${escapeHtml(input.codeLabel)}</p>
      <p class="code">${input.code}</p>
      <p class="label">${escapeHtml(input.nameLabel)}</p>
      <p class="value">${escapeHtml(input.customerName)}</p>
      <p class="label">${escapeHtml(input.givenLabel)}</p>
      <p class="value">${escapeHtml(input.givenOn)}</p>
      <p class="label">${escapeHtml(input.returnLabel)}</p>
      <p class="value">${escapeHtml(input.returnOn)}</p>
      <p class="label">${escapeHtml(input.costLabel)}</p>
      <p class="value">${escapeHtml(input.cost)}</p>
      <p class="label">${escapeHtml(input.paidLabel)}</p>
      <p class="value">${escapeHtml(input.paid)}</p>
      <p class="label">${escapeHtml(input.remainingLabel)}</p>
      <p class="value">${escapeHtml(input.remaining)}</p>
    </div>
    <script>window.onload = () => { window.print(); };</script>
  </body>
</html>`;
}

export function printTailorReceipt(html: string) {
  const popup = window.open('', '_blank', 'width=480,height=720');
  if (!popup) return false;
  popup.document.write(html);
  popup.document.close();
  return true;
}
