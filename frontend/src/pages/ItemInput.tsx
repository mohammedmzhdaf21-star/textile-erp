import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { getCurrentUser } from '../lib/auth';
import {
  BRANCH_DESTINATIONS,
  BRANCH_CODE_BY_ID,
  BRANCH_ID_BY_CODE,
  buildInventoryItemId,
  formatSubCode,
  ITEM_TYPE_LABELS,
  printInventoryLabel,
  type BranchDestinationCode,
  type InventoryItemType,
} from '../lib/inventoryCodes';

type Color = {
  id: string;
  name: string;
  hexCode?: string;
};

type InventoryItemView = {
  id: string;
  branchId: string;
  code: number;
  subCode?: number | string;
  colorId: string;
  type: InventoryItemType;
  meters?: number;
  pieceLength?: number;
  quantity?: number;
  costPrice?: number | string;
  color?: Color;
};

const ITEM_TYPES: InventoryItemType[] = ['ROLL', 'PIECE', 'REMANENT'];

const ItemInputPage: React.FC = () => {
  const [colors, setColors] = useState<Color[]>([]);
  const [destination, setDestination] = useState<BranchDestinationCode>('A');
  const [colorId, setColorId] = useState<string>('');
  const [type, setType] = useState<InventoryItemType>('ROLL');
  const [familyCode, setFamilyCode] = useState<number>(1);
  const [subCode, setSubCode] = useState<number>(15);
  const [meters, setMeters] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(1);
  const [pieceLength, setPieceLength] = useState<number>(1);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [loadingFamilyCode, setLoadingFamilyCode] = useState(false);
  const [familyItems, setFamilyItems] = useState<InventoryItemView[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);
  const [createdItemQrDataUrl, setCreatedItemQrDataUrl] = useState<string>('');
  const familyCodeRequestId = useRef(0);

  const branchId = BRANCH_ID_BY_CODE[destination];
  const selectedColor = colors.find((color) => color.id === colorId);
  const branchLabel =
    BRANCH_DESTINATIONS.find((branch) => branch.code === destination)?.label ?? destination;

  const generatedItemId = useMemo(() => {
    if (!branchId || !familyCode || !selectedColor || subCode < 0) return '';
    return buildInventoryItemId({
      branchId,
      familyCode,
      subCode,
      colorName: selectedColor.name,
      colorId: selectedColor.id,
      type,
    });
  }, [branchId, colorId, familyCode, selectedColor, subCode, type]);

  const amountLabel = useMemo(() => {
    if (type === 'PIECE') {
      return `${quantity} piece(s) × ${pieceLength} m`;
    }
    return `${meters} m`;
  }, [meters, pieceLength, quantity, type]);

  const familySubCodes = useMemo(() => {
    const unique = new Map<string, InventoryItemView>();
    familyItems.forEach((item) => {
      const price = Number(item.subCode ?? item.costPrice ?? 0);
      const key = `${item.code}-${price}-${item.colorId}-${item.type}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    return Array.from(unique.values()).sort(
      (a, b) => Number(a.subCode ?? a.costPrice ?? 0) - Number(b.subCode ?? b.costPrice ?? 0)
    );
  }, [familyItems]);

  const duplicateExists = familyItems.some((item) => {
    const itemPrice = Number(item.subCode ?? item.costPrice ?? 0);
    return (
      item.branchId === branchId &&
      item.code === familyCode &&
      Math.abs(itemPrice - subCode) < 0.001 &&
      item.colorId === colorId &&
      item.type === type
    );
  });

  useEffect(() => {
    setLoadingDefaults(true);
    api
      .get('/inventory/colors')
      .then((colorRes) => {
        const colorData = Array.isArray(colorRes.data) ? colorRes.data : [];
        setColors(colorData);
        if (colorData.length > 0) {
          setColorId(colorData[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load colors', err);
        setErrorMessage('Failed to load colors.');
      })
      .finally(() => setLoadingDefaults(false));
  }, []);

  useEffect(() => {
    if (!familyCode) {
      setFamilyItems([]);
      return;
    }

    api
      .get('/inventory', { params: { code: familyCode, pageSize: 200 } })
      .then((res) => {
        const data = res.data;
        const items = Array.isArray(data) ? data : data?.items ?? [];
        setFamilyItems(items as InventoryItemView[]);
      })
      .catch((err) => {
        console.error('Failed to load family inventory', err);
        setFamilyItems([]);
      });
  }, [familyCode, successMessage]);

  useEffect(() => {
    if (!generatedItemId) {
      setQrDataUrl('');
      return;
    }

    let isCurrent = true;
    QRCode.toDataURL(generatedItemId, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
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
  }, [generatedItemId]);

  const loadNextFamilyCode = async () => {
    const requestId = familyCodeRequestId.current + 1;
    familyCodeRequestId.current = requestId;
    setLoadingFamilyCode(true);
    try {
      const response = await api.get('/inventory', { params: { pageSize: 200 } });
      const items = Array.isArray(response.data) ? response.data : response.data?.items ?? [];
      const maxFamilyCode = items.reduce(
        (max: number, item: InventoryItemView) => Math.max(max, Number(item.code || 0)),
        0
      );
      if (requestId !== familyCodeRequestId.current) return;
      setFamilyCode(maxFamilyCode + 1);
    } catch (error) {
      if (requestId !== familyCodeRequestId.current) return;
      console.error('Failed to load next family code', error);
      setErrorMessage('Failed to find the next family code. You can still enter one manually.');
    } finally {
      if (requestId === familyCodeRequestId.current) {
        setLoadingFamilyCode(false);
      }
    }
  };

  useEffect(() => {
    if (loadingDefaults) return;
    loadNextFamilyCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDefaults]);

  const handleCreateItem = async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return alert('You must be logged in to create inventory items.');
    }
    if (!branchId || !colorId || !familyCode || subCode < 0) {
      return alert('Choose family code, sub code (price), color, and destination branch.');
    }
    if ((type === 'ROLL' || type === 'REMANENT') && meters <= 0) {
      return alert('Enter a positive meters value.');
    }
    if (type === 'PIECE' && (quantity <= 0 || pieceLength <= 0)) {
      return alert('Enter valid quantity and piece length for pieces.');
    }
    if (duplicateExists) {
      return alert(
        'This family already has an item with the same sub code (price), color, type, and branch.'
      );
    }

    const id = generatedItemId;
    if (!id) {
      return alert('Could not build item ID. Check all fields.');
    }

    const createdQrDataUrl = await QRCode.toDataURL(id, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
    });

    const payload: Record<string, unknown> = {
      id,
      branchId,
      code: familyCode,
      subCode,
      colorId,
      type,
      costPrice: subCode,
      qrCodeValue: id,
      qrCodeDataUrl: createdQrDataUrl,
    };
    if (type === 'ROLL' || type === 'REMANENT') payload.meters = Number(meters);
    if (type === 'PIECE') {
      payload.pieceLength = Number(pieceLength);
      payload.quantity = Number(quantity);
    }

    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const createResponse = await api.post('/inventory', payload);
      const savedQrDataUrl = createResponse.data?.item?.qrCodeDataUrl || createdQrDataUrl;
      setSuccessMessage(`Item ${id} created for ${branchLabel}.`);
      setCreatedItemId(id);
      setCreatedItemQrDataUrl(savedQrDataUrl);
      setMeters(1);
      setQuantity(1);
      setPieceLength(1);
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

  const handlePrint = (itemId: string, dataUrl: string) => {
    if (!selectedColor) return;
    printInventoryLabel({
      itemId,
      qrDataUrl: dataUrl,
      familyCode,
      subCode,
      type,
      colorName: selectedColor.name,
      branchLabel,
      amountLabel,
    });
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">New Item</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Create inventory using a family code and sub code (price). Choose roll, piece, or
            remnant, set the amount and color, send it to a branch or storage, then print the QR
            label.
          </p>
        </div>
        <Link to="/inventory" className="text-sm font-semibold text-magenta-600 hover:underline">
          Back to inventory
        </Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-black">Item details</h3>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Family code</label>
                <input
                  type="number"
                  min="1"
                  value={familyCode}
                  onChange={(e) => setFamilyCode(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Product family: 1, 2, 3, and so on.</p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
                onClick={loadNextFamilyCode}
                disabled={loadingFamilyCode}
              >
                {loadingFamilyCode ? 'Finding next family...' : 'Next family code'}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-800">
                Sub codes in family {familyCode}
              </p>
              {familySubCodes.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  No items in this family yet. The sub code you enter below will be the first one.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {familySubCodes.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSubCode(Number(item.subCode ?? item.costPrice ?? 0));
                        setColorId(item.colorId);
                        setType(item.type);
                        setDestination(BRANCH_CODE_BY_ID[item.branchId] ?? 'A');
                      }}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:border-black"
                    >
                      ${formatSubCode(Number(item.subCode ?? item.costPrice ?? 0))} ·{' '}
                      {item.color?.name ?? 'Color'} · {ITEM_TYPE_LABELS[item.type]} ·{' '}
                      {BRANCH_CODE_BY_ID[item.branchId] ?? item.branchId}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Sub code (price)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={subCode}
                onChange={(e) => setSubCode(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">This is the item price tier under the family.</p>
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
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as InventoryItemType)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {ITEM_TYPES.map((itemType) => (
                  <option key={itemType} value={itemType}>
                    {ITEM_TYPE_LABELS[itemType]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">How many</label>
              {type === 'PIECE' ? (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Pieces"
                  />
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={pieceLength}
                    onChange={(e) => setPieceLength(Number(e.target.value))}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Length each"
                  />
                </div>
              ) : (
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={meters}
                  onChange={(e) => setMeters(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder={type === 'ROLL' ? 'Meters in roll' : 'Remnant meters'}
                />
              )}
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700">Send to branch</label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {BRANCH_DESTINATIONS.map((branch) => (
                <button
                  key={branch.code}
                  type="button"
                  onClick={() => setDestination(branch.code)}
                  className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                    destination === branch.code
                      ? 'bg-black text-white'
                      : 'border border-gray-200 bg-white text-gray-800 hover:border-black'
                  }`}
                >
                  {branch.code === 'S' ? 'Storage' : `Branch ${branch.code}`}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={handleCreateItem}
              disabled={loadingDefaults || duplicateExists}
            >
              {loadingDefaults ? 'Loading...' : 'Save item & generate QR'}
            </button>
            {qrDataUrl && generatedItemId && (
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                onClick={() => handlePrint(generatedItemId, qrDataUrl)}
              >
                Print label
              </button>
            )}
          </div>

          {duplicateExists && (
            <p className="mt-4 text-sm font-semibold text-red-600">
              This family already has this sub code / color / type combination for {branchLabel}.
            </p>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">QR label</h3>
            <p className="mt-1 text-sm text-gray-500">
              Scan this code in Sales or Exchange. Print a hard copy for the shelf or roll tag.
            </p>
            <div className="mt-4 flex flex-col items-center rounded-2xl bg-gray-50 p-4">
              {qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt={`QR code for ${generatedItemId}`} className="h-48 w-48" />
                  <p className="mt-3 break-all text-center text-sm font-semibold text-black">
                    {generatedItemId}
                  </p>
                  <div className="mt-4 grid w-full gap-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span>Family</span>
                      <strong>{familyCode}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Sub code</span>
                      <strong>${formatSubCode(subCode)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Type</span>
                      <strong>{ITEM_TYPE_LABELS[type]}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Amount</span>
                      <strong>{amountLabel}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Color</span>
                      <strong>{selectedColor?.name ?? '—'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Destination</span>
                      <strong>{branchLabel}</strong>
                    </div>
                  </div>
                  <div className="mt-4 flex w-full flex-col gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => handlePrint(generatedItemId, qrDataUrl)}
                    >
                      Print hard copy
                    </button>
                    <a
                      className="rounded-xl border border-gray-300 px-4 py-2 text-center text-sm font-semibold text-gray-800"
                      href={qrDataUrl}
                      download={`${generatedItemId}-qr.png`}
                    >
                      Download QR image
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">Fill in the form to generate a QR code.</p>
              )}
            </div>

            {createdItemId && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                <p className="font-semibold">Item saved successfully.</p>
                <p className="mt-1 break-all">ID: {createdItemId}</p>
                <button
                  type="button"
                  className="mt-3 rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold text-white"
                  onClick={() => handlePrint(createdItemId, createdItemQrDataUrl)}
                >
                  Print saved label
                </button>
              </div>
            )}
          </section>

          {successMessage && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ItemInputPage;
