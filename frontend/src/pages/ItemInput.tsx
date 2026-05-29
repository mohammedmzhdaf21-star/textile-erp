import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';

type Branch = {
  id: string;
  name: string;
};

type Color = {
  id: string;
  name: string;
  hexCode?: string;
};

type InventoryItemView = {
  id: string;
  branchId: string;
  code: number;
  colorId: string;
  type: 'ROLL' | 'PIECE' | 'REMANENT' | string;
  meters?: number;
  pieceLength?: number;
  quantity?: number;
};

const ITEM_TYPES: Array<'ROLL' | 'PIECE' | 'REMANENT'> = ['ROLL', 'PIECE', 'REMANENT'];

const BRANCH_CODE_BY_ID: Record<string, string> = {
  B001: 'A',
  B002: 'B',
  B003: 'C',
};

const ItemInputPage: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [colorId, setColorId] = useState<string>('');
  const [type, setType] = useState<'ROLL' | 'PIECE' | 'REMANENT'>('ROLL');
  const [code, setCode] = useState<number>(1);
  const [itemId, setItemId] = useState<string>('');
  const [meters, setMeters] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(1);
  const [pieceLength, setPieceLength] = useState<number>(1);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [loadingNextCode, setLoadingNextCode] = useState(false);
  const [sameGroupItems, setSameGroupItems] = useState<InventoryItemView[]>([]);
  const [scanId, setScanId] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [createdQr, setCreatedQr] = useState<{ id: string; dataUrl: string } | null>(null);

  useEffect(() => {
    setLoadingDefaults(true);
    Promise.all([api.get('/inventory/branches'), api.get('/inventory/colors')])
      .then(([branchRes, colorRes]) => {
        const branchData = Array.isArray(branchRes.data) ? branchRes.data : [];
        const colorData = Array.isArray(colorRes.data) ? colorRes.data : [];
        setBranches(branchData);
        setColors(colorData);
        if (branchData.length > 0) {
          setBranchId(branchData[0].id);
        }
        if (colorData.length > 0) {
          setColorId(colorData[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load branches or colors', err);
        setErrorMessage('Failed to load branch or color defaults.');
      })
      .finally(() => setLoadingDefaults(false));
  }, []);

  useEffect(() => {
    if (!branchId || !colorId || !code) {
      setSameGroupItems([]);
      return;
    }

    api
      .get('/inventory', {
        params: {
          branchId,
          colorId,
          code,
        },
      })
      .then((res) => {
        const data = res.data;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setSameGroupItems(items as InventoryItemView[]);
      })
      .catch((err) => {
        console.error('Failed to load same-group inventory', err);
        setSameGroupItems([]);
      });
  }, [branchId, colorId, code]);

  const selectedColor = colors.find((color) => color.id === colorId);
  const branchLabel = BRANCH_CODE_BY_ID[branchId] ?? branchId;
  const qrItemId = scanId.trim() || itemId.trim() || '';

  const sameGroupSummary = useMemo(() => {
    return sameGroupItems.reduce(
      (summary, item) => {
        if (item.type === 'ROLL') {
          summary.rollMeters += Number(item.meters ?? 0);
        }
        if (item.type === 'PIECE') {
          summary.pieceQuantity += Number(item.quantity ?? 0);
          summary.pieceMeters += Number(item.quantity ?? 0) * Number(item.pieceLength ?? 0);
        }
        return summary;
      },
      { rollMeters: 0, pieceQuantity: 0, pieceMeters: 0 }
    );
  }, [sameGroupItems]);

  const buildItemId = () => {
    if (!branchId || !code || !selectedColor) return '';
    const codeText = String(code).padStart(3, '0');
    const colorCode =
      selectedColor.name
        .replace(/[^a-z0-9]/gi, '')
        .toUpperCase()
        .slice(0, 3) || selectedColor.id.slice(0, 3).toUpperCase();
    const typeCode = type === 'ROLL' ? 'R' : type === 'PIECE' ? 'P' : 'M';
    return `${branchId}-${codeText}-${colorCode}${typeCode}`;
  };

  const generatedItemId = useMemo(
    () => itemId.trim() || buildItemId(),
    [branchId, code, itemId, selectedColor, type]
  );
  const qrValue = qrItemId || generatedItemId;
  const sameTypeExists = sameGroupItems.some((item) => item.type === type);

  useEffect(() => {
    if (!qrValue) {
      setQrDataUrl('');
      return;
    }

    let isCurrent = true;
    QRCode.toDataURL(qrValue, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
    })
      .then((dataUrl) => {
        if (isCurrent) setQrDataUrl(dataUrl);
      })
      .catch((error) => {
        console.error('Failed to generate QR code', error);
        if (isCurrent) setQrDataUrl('');
      });

    return () => {
      isCurrent = false;
    };
  }, [qrValue]);

  const loadNextAvailableCode = async () => {
    if (!branchId || !colorId) return;
    setLoadingNextCode(true);
    try {
      const response = await api.get('/inventory', {
        params: {
          branchId,
          colorId,
          type,
          pageSize: 200,
        },
      });
      const items = Array.isArray(response.data) ? response.data : response.data?.items ?? [];
      const maxCode = items.reduce(
        (max: number, item: InventoryItemView) => Math.max(max, Number(item.code || 0)),
        0
      );
      setCode(maxCode + 1);
      setItemId('');
      setScanId('');
    } catch (error) {
      console.error('Failed to load next available code', error);
      setErrorMessage('Failed to find the next available code. You can still enter one manually.');
    } finally {
      setLoadingNextCode(false);
    }
  };

  useEffect(() => {
    if (!branchId || !colorId || loadingDefaults) return;
    loadNextAvailableCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, colorId, type, loadingDefaults]);

  const handleCreateItem = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return alert('You must be logged in to create inventory items.');
    }
    if (!branchId || !colorId || !code) {
      return alert('Choose a branch, color, and code.');
    }
    if ((type === 'ROLL' || type === 'REMANENT') && meters <= 0) {
      return alert('Enter a positive meters value.');
    }
    if (type === 'PIECE' && (quantity <= 0 || pieceLength <= 0)) {
      return alert('Enter valid quantity and piece length for pieces.');
    }
    if (sameTypeExists) {
      return alert('This branch/color/code already has this item type. Use the next available code or choose a different type.');
    }

    const id = scanId.trim() || generatedItemId;
    if (!id) {
      return alert('Enter or scan an item ID.');
    }

    const payload: any = {
      id,
      branchId,
      code,
      colorId,
      type,
      costPrice: costPrice > 0 ? costPrice : undefined,
    };
    if (type === 'ROLL' || type === 'REMANENT') payload.meters = Number(meters);
    if (type === 'PIECE') {
      payload.pieceLength = Number(pieceLength);
      payload.quantity = Number(quantity);
    }

    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await api.post('/inventory', payload);
      const createdQrDataUrl =
        qrDataUrl ||
        (await QRCode.toDataURL(id, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 220,
        }));
      setSuccessMessage(`Inventory item ${id} created in branch ${branchLabel}.`);
      setCreatedQr({ id, dataUrl: createdQrDataUrl });
      setScanId('');
      setItemId('');
      setMeters(1);
      setQuantity(1);
      setPieceLength(1);
      setCostPrice(0);
      await loadNextAvailableCode();
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      setErrorMessage(
        `Failed to create inventory item${status ? ` (status ${status})` : ''}: ${
          body?.error ?? body?.message ?? error?.message ?? 'Unexpected error'
        }`
      );
      console.error('Inventory create error:', error);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Item Input</h2>
          <p className="text-sm text-gray-600 max-w-2xl">
            Create inventory items directly in the selected branch, color, and code group. Scan or type the QR item ID and save new stock immediately.
          </p>
        </div>
        <div className="text-sm text-gray-500">Branch: {branchLabel}</div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-black">New inventory item</h3>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({BRANCH_CODE_BY_ID[branch.id] ?? branch.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Color</label>
              <select
                value={colorId}
                onChange={(e) => setColorId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {colors.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Code</label>
              <input
                type="number"
                min="1"
                value={code}
                onChange={(e) => setCode(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-magenta-600"
                onClick={loadNextAvailableCode}
                disabled={loadingNextCode}
              >
                {loadingNextCode ? 'Finding next code...' : 'Use next available code'}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'ROLL' | 'PIECE' | 'REMANENT')}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {ITEM_TYPES.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {itemType}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Item ID / QR code</label>
              <input
                value={scanId}
                onChange={(e) => setScanId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="Scan or enter item ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Generated ID</label>
              <input
                value={generatedItemId}
                onChange={(e) => setItemId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="Auto-generated ID"
              />
              <p className="mt-2 text-xs text-gray-500">
                Leave blank to use the safe generated ID. The QR code uses this value.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {(type === 'ROLL' || type === 'REMANENT') && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {type === 'ROLL' ? 'Meters' : 'Remnant meters'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={meters}
                  onChange={(e) => setMeters(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            {type === 'PIECE' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Piece length</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={pieceLength}
                    onChange={(e) => setPieceLength(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </>
            )}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Cost price (optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="self-end">
              <button type="button" className="btn-primary w-full" onClick={handleCreateItem} disabled={loadingDefaults}>
                {loadingDefaults ? 'Loading...' : 'Save inventory item'}
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
            When the same color and code are used for both roll and pieces, the system groups them by code while keeping roll meters and piece quantities separate.
            {sameTypeExists && (
              <p className="mt-2 font-semibold text-red-600">
                This code/color already has a {type.toLowerCase()} item. Pick the next available code before saving.
              </p>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">QR code generator</h3>
            <p className="mt-1 text-sm text-gray-500">
              This QR is generated from the item ID and can be scanned later in Sales or Exchange.
            </p>
            <div className="mt-4 flex flex-col items-center rounded-2xl bg-gray-50 p-4">
              {qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt={`QR code for ${qrValue}`} className="h-44 w-44" />
                  <p className="mt-3 break-all text-center text-sm font-semibold text-black">{qrValue}</p>
                  <a
                    className="mt-3 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                    href={qrDataUrl}
                    download={`${qrValue || 'inventory-item'}-qr.png`}
                  >
                    Download QR
                  </a>
                </>
              ) : (
                <p className="text-sm text-gray-500">Choose branch, color, code, and type to generate a QR code.</p>
              )}
            </div>
            {createdQr && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <p>
                  Last created QR: <span className="font-semibold">{createdQr.id}</span>
                </p>
                <img
                  src={createdQr.dataUrl}
                  alt={`Last created QR code for ${createdQr.id}`}
                  className="mt-3 h-28 w-28"
                />
                <a
                  className="mt-3 inline-flex rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold text-white"
                  href={createdQr.dataUrl}
                  download={`${createdQr.id}-qr.png`}
                >
                  Download created QR
                </a>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Same code / color group</h3>
            <div className="mt-4 text-sm text-gray-700 space-y-3">
              <div className="flex justify-between">
                <span>Roll total meters</span>
                <span>{sameGroupSummary.rollMeters.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span>Piece total quantity</span>
                <span>{sameGroupSummary.pieceQuantity}</span>
              </div>
              <div className="flex justify-between">
                <span>Piece total meters</span>
                <span>{sameGroupSummary.pieceMeters.toFixed(2)} m</span>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">Status</h3>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <div>
                <p className="font-semibold text-black">Auto item ID</p>
                <p>{generatedItemId}</p>
              </div>
              <div>
                <p className="font-semibold text-black">Selected color</p>
                <p>{selectedColor?.name ?? 'none'}</p>
              </div>
              <div>
                <p className="font-semibold text-black">Branch code</p>
                <p>{branchLabel || 'none'}</p>
              </div>
            </div>
          </section>

          {successMessage && <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{successMessage}</div>}
          {errorMessage && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
        </aside>
      </div>
    </div>
  );
};

export default ItemInputPage;
