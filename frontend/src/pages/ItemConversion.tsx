import React, { useState } from 'react';
import QRCode from 'qrcode';
import api from '../lib/api';
import { completeCuttingTasksAfterRollToPiece } from '../lib/cuttingTasks';

type BranchCode = 'A' | 'B' | 'C' | 'E' | 'F';
type ItemType = 'ROLL' | 'PIECE' | 'REMANENT';
type SoldUnit = 'METER' | 'PIECE';

type InventoryItem = {
  id: string;
  branchId: string;
  code: number;
  colorId: string;
  color?: { id: string; name: string; hexCode?: string };
  branch?: { id: string; name: string };
  type: ItemType;
  meters?: string | number | null;
  pieceLength?: string | number | null;
  quantity: number;
  costPrice?: string | number | null;
  version: number;
  qrCodeDataUrl?: string | null;
  sourceItemId?: string | null;
  conversionType?: string | null;
};

type ConversionSummary = {
  title: string;
  sourceId: string;
  newItemId: string;
  qrCodeDataUrl: string;
  details: string;
};

const branches: BranchCode[] = ['A', 'B', 'C', 'E', 'F'];
const BRANCH_MAP: Record<BranchCode, string> = {
  A: 'B001',
  B: 'B002',
  C: 'B003',
  E: 'B001',
  F: 'B002',
};

const BRANCH_CODE_BY_ID: Record<string, BranchCode> = {
  B001: 'A',
  B002: 'B',
  B003: 'C',
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const soldAsUnitForItem = (item: InventoryItem): SoldUnit =>
  item.type === 'PIECE' ? 'PIECE' : 'METER';

const itemAvailableAmount = (item: InventoryItem) =>
  item.type === 'PIECE' ? item.quantity : toNumber(item.meters);

const colorCodeForItem = (item: InventoryItem) =>
  (item.color?.name || item.colorId)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3) || item.colorId.slice(0, 3).toUpperCase();

const typeCode = (type: ItemType) => (type === 'ROLL' ? 'R' : type === 'PIECE' ? 'P' : 'M');

const buildItemId = (branchId: string, item: InventoryItem, type: ItemType, suffix = '') => {
  const codeText = String(item.code).padStart(3, '0');
  const base = `${branchId}-${codeText}-${colorCodeForItem(item)}${typeCode(type)}`;
  return suffix ? `${base}-${suffix}` : base;
};

const createQrDataUrl = (itemId: string) =>
  QRCode.toDataURL(itemId, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

const ItemConversion: React.FC = () => {
  const [transferSourceId, setTransferSourceId] = useState('');
  const [transferSource, setTransferSource] = useState<InventoryItem | null>(null);
  const [transferToBranch, setTransferToBranch] = useState<BranchCode>('C');
  const [transferAmount, setTransferAmount] = useState('1');
  const [rollSourceId, setRollSourceId] = useState('');
  const [rollSource, setRollSource] = useState<InventoryItem | null>(null);
  const [cutMeters, setCutMeters] = useState('2.25');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConversionSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const loadItem = async (itemId: string, setItem: (item: InventoryItem) => void) => {
    const id = itemId.trim();
    if (!id) {
      setError('Enter or scan an item ID first.');
      return;
    }
    setError(null);
    setMessage(null);

    try {
      const response = await api.get(`/inventory/${encodeURIComponent(id)}`);
      const item = response.data as InventoryItem;
      setItem(item);
      const amount = itemAvailableAmount(item);
      if (setItem === setTransferSource) {
        setTransferAmount(String(item.type === 'PIECE' ? Math.max(1, Math.min(item.quantity, 1)) : Math.min(amount, 1)));
        const currentBranch = BRANCH_CODE_BY_ID[item.branchId];
        if (currentBranch === transferToBranch) {
          setTransferToBranch(currentBranch === 'C' ? 'F' : 'C');
        }
      }
      setMessage(`Loaded ${item.id}: ${item.type}, ${amount} ${item.type === 'PIECE' ? 'piece(s)' : 'meter(s)'}.`);
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? 'Failed to load item.');
    }
  };

  const findAvailableId = async (branchId: string, item: InventoryItem, type: ItemType) => {
    const baseId = buildItemId(branchId, item, type);
    try {
      await api.get(`/inventory/${encodeURIComponent(baseId)}`);
      return buildItemId(branchId, item, type, String(Date.now()).slice(-6));
    } catch (err: any) {
      if (err?.response?.status === 404) return baseId;
      throw err;
    }
  };

  const patchSourceStock = async (item: InventoryItem, amount: number) => {
    if (item.type === 'PIECE') {
      await api.patch(`/inventory/${encodeURIComponent(item.id)}`, {
        version: item.version,
        quantity: item.quantity - Math.floor(amount),
      });
      return;
    }

    await api.patch(`/inventory/${encodeURIComponent(item.id)}`, {
      version: item.version,
      meters: Number((toNumber(item.meters) - amount).toFixed(2)),
    });
  };

  const transferItem = async () => {
    if (!transferSource) return alert('Load the item to transfer first.');
    const amount = Number(transferAmount);
    const destinationBranchId = BRANCH_MAP[transferToBranch];
    const currentBranch = BRANCH_CODE_BY_ID[transferSource.branchId];

    if (destinationBranchId === transferSource.branchId) {
      return alert('Choose a different destination branch.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert('Enter a valid transfer amount.');
    }
    if (transferSource.type === 'PIECE' && !Number.isInteger(amount)) {
      return alert('Piece transfers must use a whole quantity.');
    }
    if (amount > itemAvailableAmount(transferSource)) {
      return alert('Transfer amount cannot exceed available stock.');
    }

    setIsProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const newItemId = await findAvailableId(destinationBranchId, transferSource, transferSource.type);
      const qrCodeDataUrl = await createQrDataUrl(newItemId);

      await patchSourceStock(transferSource, amount);
      setTransferSource((current) =>
        current
          ? {
              ...current,
              meters: current.type === 'PIECE' ? current.meters : Number((toNumber(current.meters) - amount).toFixed(2)),
              quantity: current.type === 'PIECE' ? current.quantity - Math.floor(amount) : current.quantity,
              version: current.version + 1,
            }
          : current
      );
      await api.post('/inventory', {
        id: newItemId,
        branchId: destinationBranchId,
        code: transferSource.code,
        colorId: transferSource.colorId,
        type: transferSource.type,
        meters: transferSource.type === 'PIECE' ? undefined : amount,
        pieceLength: transferSource.type === 'PIECE' ? toNumber(transferSource.pieceLength) : undefined,
        quantity: transferSource.type === 'PIECE' ? Math.floor(amount) : undefined,
        costPrice: transferSource.costPrice ? toNumber(transferSource.costPrice) : undefined,
        qrCodeValue: newItemId,
        qrCodeDataUrl,
        pictureName: transferSource.id,
        pictureDataUrl: transferSource.qrCodeDataUrl || undefined,
        sourceItemId: transferSource.id,
        conversionType: 'BRANCH_TRANSFER',
      });

      setSummary({
        title: 'Branch transfer created',
        sourceId: transferSource.id,
        newItemId,
        qrCodeDataUrl,
        details: `Moved ${amount} ${transferSource.type === 'PIECE' ? 'piece(s)' : 'meter(s)'} from Branch ${currentBranch || transferSource.branchId} to Branch ${transferToBranch}.`,
      });
      setMessage('Branch conversion complete. New QR created for destination item.');
      await loadItem(transferSource.id, setTransferSource);
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? 'Failed to transfer item.');
    } finally {
      setIsProcessing(false);
    }
  };

  const cutRollToPiece = async () => {
    if (!rollSource) return alert('Load the roll first.');
    const amount = Number(cutMeters);
    if (rollSource.type !== 'ROLL' && rollSource.type !== 'REMANENT') {
      return alert('Only rolls or remnants can be cut into pieces.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert('Enter valid meters to cut.');
    }
    if (amount > toNumber(rollSource.meters)) {
      return alert('Cut meters cannot exceed roll meters.');
    }

    setIsProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const newItemId = await findAvailableId(rollSource.branchId, rollSource, 'PIECE');
      const qrCodeDataUrl = await createQrDataUrl(newItemId);

      await patchSourceStock(rollSource, amount);
      setRollSource((current) =>
        current
          ? {
              ...current,
              meters: Number((toNumber(current.meters) - amount).toFixed(2)),
              version: current.version + 1,
            }
          : current
      );
      await api.post('/inventory', {
        id: newItemId,
        branchId: rollSource.branchId,
        code: rollSource.code,
        colorId: rollSource.colorId,
        type: 'PIECE',
        pieceLength: amount,
        quantity: 1,
        costPrice: rollSource.costPrice ? toNumber(rollSource.costPrice) : undefined,
        qrCodeValue: newItemId,
        qrCodeDataUrl,
        pictureName: rollSource.id,
        pictureDataUrl: rollSource.qrCodeDataUrl || undefined,
        sourceItemId: rollSource.id,
        conversionType: 'ROLL_TO_PIECE',
      });

      setSummary({
        title: 'Piece created from roll',
        sourceId: rollSource.id,
        newItemId,
        qrCodeDataUrl,
        details: `Cut ${amount.toFixed(2)} meters into one new piece with code ${rollSource.code} and color ${rollSource.color?.name || rollSource.colorId}.`,
      });
      const completedTasks = completeCuttingTasksAfterRollToPiece({
        rollItemId: rollSource.id,
        branchId: rollSource.branchId,
        code: rollSource.code,
        colorName: rollSource.color?.name,
        newPieceId: newItemId,
      });
      setMessage(
        completedTasks.length > 0
          ? `Roll-to-piece conversion complete. ${completedTasks.length} cutting task(s) marked done automatically.`
          : 'Roll-to-piece conversion complete. New piece QR created.'
      );
      await loadItem(rollSource.id, setRollSource);
    } catch (err: any) {
      const body = err?.response?.data;
      setError(body?.error ?? body?.message ?? err?.message ?? 'Failed to cut roll.');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderItemSummary = (item: InventoryItem | null) => {
    if (!item) return <p className="text-sm text-gray-500">No item loaded yet.</p>;
    return (
      <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
        <div className="break-all font-semibold text-black">{item.id}</div>
        <div>Branch: {BRANCH_CODE_BY_ID[item.branchId] || item.branchId}</div>
        <div>Code: {item.code}</div>
        <div>Color: {item.color?.name || item.colorId}</div>
        <div>Type: {item.type}</div>
        <div>Available: {itemAvailableAmount(item)} {item.type === 'PIECE' ? 'piece(s)' : 'meter(s)'}</div>
        {item.sourceItemId && <div className="break-all">Linked source: {item.sourceItemId}</div>}
      </div>
    );
  };

  return (
    <div className="max-w-full overflow-x-hidden p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Item Conversion</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Transfer stock between branches or cut roll meters into new pieces. Converted items keep the same code/color link and receive a new QR code.
          </p>
        </div>
      </div>

      {message && <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{message}</div>}
      {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">Branch transfer</h3>
          <p className="mt-1 text-sm text-gray-600">
            Move meters or pieces from one branch to another, such as F to C or C to F.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={transferSourceId}
              onChange={(event) => setTransferSourceId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Scan or enter item ID"
            />
            <button type="button" onClick={() => loadItem(transferSourceId, setTransferSource)} className="btn-primary">
              Load item
            </button>
          </div>

          <div className="mt-4">{renderItemSummary(transferSource)}</div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Destination branch</label>
              <select
                value={transferToBranch}
                onChange={(event) => setTransferToBranch(event.target.value as BranchCode)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {branches.map((branch) => (
                  <option key={branch} value={branch}>Branch {branch}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Amount ({transferSource ? (soldAsUnitForItem(transferSource) === 'PIECE' ? 'pieces' : 'meters') : 'meters/pieces'})
              </label>
              <input
                type="number"
                min="0"
                step={transferSource?.type === 'PIECE' ? '1' : '0.01'}
                value={transferAmount}
                onChange={(event) => setTransferAmount(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button type="button" onClick={transferItem} disabled={isProcessing} className="btn-primary mt-4 w-full">
            {isProcessing ? 'Converting...' : 'Create branch conversion QR'}
          </button>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">Roll to piece</h3>
          <p className="mt-1 text-sm text-gray-600">
            Cut a length from a roll/remnant and create a new piece QR linked to the roll code and color.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={rollSourceId}
              onChange={(event) => setRollSourceId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Scan or enter roll ID"
            />
            <button type="button" onClick={() => loadItem(rollSourceId, setRollSource)} className="btn-primary">
              Load roll
            </button>
          </div>

          <div className="mt-4">{renderItemSummary(rollSource)}</div>

          <label className="mt-4 block text-sm font-medium text-gray-700">Meters to cut</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={cutMeters}
            onChange={(event) => setCutMeters(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />

          <button type="button" onClick={cutRollToPiece} disabled={isProcessing} className="btn-primary mt-4 w-full">
            {isProcessing ? 'Cutting...' : 'Create piece QR'}
          </button>
        </section>
      </div>

      {summary && (
        <section className="mt-6 rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-black">{summary.title}</h3>
          <p className="mt-2 text-sm text-gray-700">{summary.details}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="rounded-2xl bg-white p-4">
              <img src={summary.qrCodeDataUrl} alt={`QR code for ${summary.newItemId}`} className="h-44 w-44" />
            </div>
            <div className="rounded-2xl bg-white p-4 text-sm">
              <div className="font-semibold text-black">New QR item</div>
              <div className="break-all text-gray-700">{summary.newItemId}</div>
              <div className="mt-3 font-semibold text-black">Linked source</div>
              <div className="break-all text-gray-700">{summary.sourceId}</div>
              <a
                className="mt-4 inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                href={summary.qrCodeDataUrl}
                download={`${summary.newItemId}-qr.png`}
              >
                Download QR
              </a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default ItemConversion;
