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
import {
  buildPackageKey,
  emptyPackageComponent,
  formatPackageSummary,
  normalizePackageComponents,
  parsePackageComponents,
  totalPiecesPerPackage,
  validatePackageComponents,
  type PackageComponent,
} from '../lib/piecePackages';

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
  isPiecePackage?: boolean;
  packageKey?: string;
  packageComponents?: PackageComponent[];
};

const ITEM_TYPES: InventoryItemType[] = ['ROLL', 'PIECE', 'REMANENT'];
const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

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
  const [description, setDescription] = useState('');
  const [pictureName, setPictureName] = useState('');
  const [pictureDataUrl, setPictureDataUrl] = useState('');
  const [createdPictureDataUrl, setCreatedPictureDataUrl] = useState('');
  const [createdDescription, setCreatedDescription] = useState('');
  const [isPiecePackage, setIsPiecePackage] = useState(false);
  const [packageComponents, setPackageComponents] = useState<PackageComponent[]>([
    emptyPackageComponent(),
    emptyPackageComponent(),
  ]);
  const familyCodeRequestId = useRef(0);

  const branchId = BRANCH_ID_BY_CODE[destination];
  const selectedColor = colors.find((color) => color.id === colorId);
  const branchLabel =
    BRANCH_DESTINATIONS.find((branch) => branch.code === destination)?.label ?? destination;

  const normalizedPackageComponents = useMemo(
    () => normalizePackageComponents(packageComponents),
    [packageComponents]
  );

  const packageKey = useMemo(
    () => (isPiecePackage ? buildPackageKey(normalizedPackageComponents) : ''),
    [isPiecePackage, normalizedPackageComponents]
  );

  const generatedItemId = useMemo(() => {
    if (!branchId || !familyCode || !selectedColor || subCode < 0) return '';
    if (isPiecePackage && normalizedPackageComponents.length === 0) return '';
    return buildInventoryItemId({
      branchId,
      familyCode,
      subCode,
      colorName: selectedColor.name,
      colorId: selectedColor.id,
      type,
      pieceLength: type === 'PIECE' && !isPiecePackage ? pieceLength : undefined,
      isPiecePackage,
      packageComponents: normalizedPackageComponents,
    });
  }, [
    branchId,
    colorId,
    familyCode,
    isPiecePackage,
    normalizedPackageComponents,
    pieceLength,
    selectedColor,
    subCode,
    type,
  ]);

  const amountLabel = useMemo(() => {
    if (type === 'PIECE' && isPiecePackage) {
      const perPackage = totalPiecesPerPackage(normalizedPackageComponents);
      return `${quantity} package(s) · ${perPackage} piece(s) each (${formatPackageSummary(normalizedPackageComponents)})`;
    }
    if (type === 'PIECE') {
      return `${quantity} piece(s) × ${pieceLength} m`;
    }
    return `${meters} m`;
  }, [isPiecePackage, meters, normalizedPackageComponents, pieceLength, quantity, type]);

  const familySubCodes = useMemo(() => {
    const unique = new Map<string, InventoryItemView>();
    familyItems.forEach((item) => {
      const price = Number(item.subCode ?? item.costPrice ?? 0);
      const key = `${item.code}-${price}-${item.colorId}-${item.type}-${item.pieceLength ?? 0}-${item.packageKey ?? ''}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    return Array.from(unique.values()).sort(
      (a, b) => Number(a.subCode ?? a.costPrice ?? 0) - Number(b.subCode ?? b.costPrice ?? 0)
    );
  }, [familyItems]);

  const duplicateExists = familyItems.some((item) => {
    const itemPrice = Number(item.subCode ?? item.costPrice ?? 0);
    const sameBase =
      item.branchId === branchId &&
      item.code === familyCode &&
      Math.abs(itemPrice - subCode) < 0.001 &&
      item.colorId === colorId &&
      item.type === type;

    if (type === 'PIECE' && isPiecePackage) {
      return (
        sameBase &&
        Boolean(item.isPiecePackage) &&
        (item.packageKey ?? '') === packageKey
      );
    }

    if (type === 'PIECE') {
      return (
        sameBase &&
        !item.isPiecePackage &&
        Math.abs(Number(item.pieceLength ?? 0) - pieceLength) < 0.001
      );
    }

    return sameBase;
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

  const handlePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please choose an image file for the item picture.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PICTURE_BYTES) {
      setErrorMessage('Item picture must be 2 MB or smaller.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPictureName(file.name);
      setPictureDataUrl(String(reader.result || ''));
      setErrorMessage(null);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected picture.');
    };
    reader.readAsDataURL(file);
  };

  const clearPicture = () => {
    setPictureName('');
    setPictureDataUrl('');
  };

  const updatePackageComponent = (
    index: number,
    field: keyof PackageComponent,
    value: string | number
  ) => {
    setPackageComponents((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const addPackageComponent = () => {
    setPackageComponents((prev) => [...prev, emptyPackageComponent()]);
  };

  const removePackageComponent = (index: number) => {
    setPackageComponents((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)
    );
  };

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
    if (type === 'PIECE' && isPiecePackage) {
      const packageError = validatePackageComponents(packageComponents);
      if (packageError) return alert(packageError);
      if (quantity <= 0) return alert('Enter a valid number of packages.');
    } else if (type === 'PIECE' && (quantity <= 0 || pieceLength <= 0)) {
      return alert('Enter valid quantity and piece length for pieces.');
    }
    if (duplicateExists) {
      return alert(
        type === 'PIECE' && isPiecePackage
          ? 'This family already has a piece package with the same pieces, price, color, and branch.'
          : type === 'PIECE'
            ? 'This family already has a piece item with the same price, color, branch, and piece length.'
            : 'This family already has an item with the same sub code (price), color, type, and branch.'
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
      description: description.trim() || undefined,
      pictureName: pictureName || undefined,
      pictureDataUrl: pictureDataUrl || undefined,
    };
    if (type === 'ROLL' || type === 'REMANENT') payload.meters = Number(meters);
    if (type === 'PIECE' && isPiecePackage) {
      payload.isPiecePackage = true;
      payload.packageKey = packageKey;
      payload.packageComponents = normalizedPackageComponents;
      payload.quantity = Number(quantity);
    } else if (type === 'PIECE') {
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
      setCreatedPictureDataUrl(pictureDataUrl);
      setCreatedDescription(description.trim());
      setMeters(1);
      setQuantity(1);
      setPieceLength(1);
      setDescription('');
      setIsPiecePackage(false);
      setPackageComponents([emptyPackageComponent(), emptyPackageComponent()]);
      clearPicture();
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
                        if (item.type === 'PIECE') {
                          if (item.isPiecePackage) {
                            setIsPiecePackage(true);
                            const components = parsePackageComponents(item.packageComponents);
                            setPackageComponents(
                              components.length >= 2
                                ? components
                                : [emptyPackageComponent(), emptyPackageComponent()]
                            );
                          } else {
                            setIsPiecePackage(false);
                            setPieceLength(Number(item.pieceLength ?? 1));
                          }
                        } else {
                          setIsPiecePackage(false);
                        }
                      }}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:border-black"
                    >
                      ${formatSubCode(Number(item.subCode ?? item.costPrice ?? 0))} ·{' '}
                      {item.color?.name ?? 'Color'} · {ITEM_TYPE_LABELS[item.type]}
                      {item.isPiecePackage
                        ? ` · pkg: ${formatPackageSummary(parsePackageComponents(item.packageComponents))}`
                        : item.type === 'PIECE'
                          ? ` · ${item.pieceLength ?? 0} m/pc`
                          : ''}{' '}
                      · {BRANCH_CODE_BY_ID[item.branchId] ?? item.branchId}
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
                onChange={(e) => {
                  const nextType = e.target.value as InventoryItemType;
                  setType(nextType);
                  if (nextType !== 'PIECE') setIsPiecePackage(false);
                }}
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
              {type === 'PIECE' && isPiecePackage ? (
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Number of packages"
                />
              ) : type === 'PIECE' ? (
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

          {type === 'PIECE' && (
            <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isPiecePackage}
                  onChange={(event) => setIsPiecePackage(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-semibold text-black">Piece package</span>
                  <span className="mt-1 block text-sm text-gray-600">
                    A family set sold as one package (e.g. dress, coat, underwear, hijab). Customers
                    may buy only some pieces later; leftovers stay as package pieces, not fabric
                    remnants.
                  </span>
                </span>
              </label>

              {isPiecePackage && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-800">Pieces in each package</p>
                    <button
                      type="button"
                      onClick={addPackageComponent}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:border-black"
                    >
                      Add piece
                    </button>
                  </div>

                  {packageComponents.map((component, index) => (
                    <div key={index} className="grid grid-cols-[1fr_120px_auto] gap-2">
                      <input
                        type="text"
                        value={component.name}
                        onChange={(event) =>
                          updatePackageComponent(index, 'name', event.target.value)
                        }
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Piece name (e.g. Dress)"
                      />
                      <input
                        type="number"
                        min="1"
                        value={component.countPerPackage}
                        onChange={(event) =>
                          updatePackageComponent(index, 'countPerPackage', Number(event.target.value))
                        }
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Count"
                      />
                      <button
                        type="button"
                        onClick={() => removePackageComponent(index)}
                        disabled={packageComponents.length <= 2}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-red-600 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  <p className="text-sm text-gray-600">
                    Each package contains{' '}
                    <strong>{totalPiecesPerPackage(normalizedPackageComponents)} piece(s)</strong>:{' '}
                    {formatPackageSummary(normalizedPackageComponents)}
                  </p>
                </div>
              )}
            </section>
          )}

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

          <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="text-base font-semibold text-black">Item description</h4>
            <p className="mt-1 text-sm text-gray-500">
              Add notes about fabric quality, pattern, supplier, or anything staff should know.
            </p>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="Example: Premium velvet, 150cm wide, suitable for evening wear."
            />
          </section>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="text-base font-semibold text-black">Item image</h4>
            <p className="mt-1 text-sm text-gray-500">
              Upload a product photo. It is saved with this inventory item.
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handlePictureChange}
              className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
            />
            {pictureDataUrl && (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3">
                <img
                  src={pictureDataUrl}
                  alt={pictureName || 'Selected item picture'}
                  className="h-40 w-full rounded-xl border border-gray-200 object-contain p-2"
                />
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-gray-700">{pictureName}</span>
                  <button type="button" className="font-semibold text-red-600" onClick={clearPicture}>
                    Remove
                  </button>
                </div>
              </div>
            )}
          </section>

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
              {type === 'PIECE' && isPiecePackage
                ? `This family already has this piece package (${formatPackageSummary(normalizedPackageComponents)}) with this price and color in ${branchLabel}.`
                : type === 'PIECE'
                  ? `This family already has a ${pieceLength} m piece with this price and color in ${branchLabel}. Use a different piece length to create a new QR.`
                  : `This family already has this sub code / color / type combination for ${branchLabel}.`}
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
                    {type === 'PIECE' && isPiecePackage && (
                      <div className="flex justify-between">
                        <span>Package</span>
                        <strong className="text-right">
                          {formatPackageSummary(normalizedPackageComponents)}
                        </strong>
                      </div>
                    )}
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
                {createdDescription && (
                  <p className="mt-2 text-green-800">
                    <span className="font-semibold">Description:</span> {createdDescription}
                  </p>
                )}
                {createdPictureDataUrl && (
                  <img
                    src={createdPictureDataUrl}
                    alt={`Saved picture for ${createdItemId}`}
                    className="mt-3 h-32 w-full rounded-xl border border-green-200 bg-white object-contain p-2"
                  />
                )}
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
