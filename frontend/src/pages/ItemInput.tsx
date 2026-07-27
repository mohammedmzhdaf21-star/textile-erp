import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  getItemTypeLabel,
  printInventoryLabel,
  resolveMeteredInstanceKey,
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
import {
  isBelowRemnantThreshold,
  normalizeInventoryShape,
  REMNANT_THRESHOLD_METERS,
} from '../lib/inventoryRules';
import { getColorLabel } from '../lib/colorLabels';

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
  const { t } = useTranslation();
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
  const [isAddingColor, setIsAddingColor] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [colorFormError, setColorFormError] = useState<string | null>(null);
  const familyCodeRequestId = useRef(0);

  const branchId = BRANCH_ID_BY_CODE[destination];
  const selectedColor = colors.find((color) => color.id === colorId);
  const currentUser = getCurrentUser();
  const canManageColors =
    currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
  const branchLabel =
    BRANCH_DESTINATIONS.find((branch) => branch.code === destination)
      ? t(BRANCH_DESTINATIONS.find((branch) => branch.code === destination)!.labelKey)
      : destination;

  const normalizedPackageComponents = useMemo(
    () => normalizePackageComponents(packageComponents),
    [packageComponents]
  );

  const packageKey = useMemo(
    () => (isPiecePackage ? buildPackageKey(normalizedPackageComponents) : ''),
    [isPiecePackage, normalizedPackageComponents]
  );

  const meteredInstanceKey = useMemo(() => {
    if (type !== 'ROLL' && type !== 'REMANENT') return '';
    if (!branchId || !familyCode || !colorId || subCode < 0) return '';
    return resolveMeteredInstanceKey({
      type,
      items: familyItems,
      branchId,
      familyCode,
      subCode,
      colorId,
    });
  }, [branchId, colorId, familyCode, familyItems, subCode, type]);

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
      instanceKey: meteredInstanceKey || undefined,
    });
  }, [
    branchId,
    colorId,
    familyCode,
    isPiecePackage,
    meteredInstanceKey,
    normalizedPackageComponents,
    pieceLength,
    selectedColor,
    subCode,
    type,
  ]);

  const amountLabel = useMemo(() => {
    if (type === 'PIECE' && isPiecePackage) {
      const perPackage = totalPiecesPerPackage(normalizedPackageComponents);
      return t('itemInput.amountPackage', {
        qty: quantity,
        perPackage,
        summary: formatPackageSummary(normalizedPackageComponents),
      });
    }
    if (type === 'PIECE') {
      return t('itemInput.amountPiece', { qty: quantity, length: pieceLength });
    }
    return t('itemInput.amountMeters', { meters });
  }, [isPiecePackage, meters, normalizedPackageComponents, pieceLength, quantity, t, type]);

  const willSaveAsRemnant = useMemo(() => {
    if (isPiecePackage) return false;
    if (type === 'ROLL') return isBelowRemnantThreshold(Number(meters));
    if (type === 'PIECE') return isBelowRemnantThreshold(Number(pieceLength));
    return false;
  }, [isPiecePackage, meters, pieceLength, type]);

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

    return false;
  });

  const loadColors = async () => {
    const colorRes = await api.get('/inventory/colors');
    const colorData = Array.isArray(colorRes.data) ? colorRes.data : [];
    setColors(colorData);
    if (colorData.length > 0 && !colorId) {
      setColorId(colorData[0].id);
    }
    return colorData as Color[];
  };

  useEffect(() => {
    setLoadingDefaults(true);
    loadColors()
      .catch((err) => {
        console.error('Failed to load colors', err);
        setErrorMessage(t('itemInput.failedToLoadColors'));
      })
      .finally(() => setLoadingDefaults(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddColor = async () => {
    const name = newColorName.trim();
    if (!name) {
      setColorFormError(t('itemInput.colorNameRequired'));
      return;
    }

    setIsSavingColor(true);
    setColorFormError(null);

    try {
      const response = await api.post('/inventory/colors', {
        name,
        hexCode: newColorHex,
      });
      const created = response.data as Color;
      const colorData = await loadColors();
      const saved = colorData.find((color) => color.id === created.id) ?? created;
      setColorId(saved.id);
      setNewColorName('');
      setNewColorHex('#000000');
      setIsAddingColor(false);
      setErrorMessage(null);
    } catch (err: any) {
      const body = err?.response?.data;
      setColorFormError(body?.error ?? body?.message ?? err?.message ?? t('itemInput.failedToAddColor'));
    } finally {
      setIsSavingColor(false);
    }
  };

  useEffect(() => {
    if (!familyCode) {
      setFamilyItems([]);
      return;
    }

    api
      .get('/inventory', {
        params: { code: familyCode, pageSize: 200, includeArchived: true },
      })
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
      setErrorMessage(t('itemInput.failedNextFamilyCode'));
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
      setErrorMessage(t('itemInput.chooseImageFile'));
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PICTURE_BYTES) {
      setErrorMessage(t('itemInput.imageTooLarge'));
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
      setErrorMessage(t('itemInput.failedToReadPicture'));
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
      return alert(t('itemInput.mustBeLoggedIn'));
    }
    if (!branchId || !colorId || !familyCode || subCode < 0) {
      return alert(t('itemInput.chooseRequiredFields'));
    }
    if ((type === 'ROLL' || type === 'REMANENT') && meters <= 0) {
      return alert(t('itemInput.enterPositiveMeters'));
    }
    if (type === 'PIECE' && isPiecePackage) {
      const packageError = validatePackageComponents(packageComponents);
      if (packageError) return alert(packageError);
      if (quantity <= 0) return alert(t('itemInput.enterValidPackages'));
    } else if (type === 'PIECE' && (quantity <= 0 || pieceLength <= 0)) {
      return alert(t('itemInput.enterValidPieceFields'));
    }
    if (duplicateExists) {
      return alert(
        type === 'PIECE' && isPiecePackage
          ? t('itemInput.duplicatePackageAlert')
          : type === 'PIECE'
            ? t('itemInput.duplicatePieceAlert')
            : t('itemInput.duplicateOtherAlert')
      );
    }

    const normalized = normalizeInventoryShape({
      type,
      meters: Number(meters),
      pieceLength: Number(pieceLength),
      quantity: Number(quantity),
      isPiecePackage,
    });
    const effectiveType = normalized.type;

    let instanceKeyForCreate = '';
    let id = '';

    if (effectiveType === 'ROLL' || effectiveType === 'REMANENT') {
      try {
        const freshResponse = await api.get('/inventory', {
          params: { code: familyCode, pageSize: 200, includeArchived: true },
        });
        const freshData = freshResponse.data;
        const freshItems = (Array.isArray(freshData) ? freshData : freshData?.items ?? []) as InventoryItemView[];
        instanceKeyForCreate = resolveMeteredInstanceKey({
          type: effectiveType,
          items: freshItems,
          branchId,
          familyCode,
          subCode,
          colorId,
        });
      } catch (refreshError) {
        console.error('Failed to refresh family inventory before create', refreshError);
      }
    }

    if (selectedColor) {
      id = buildInventoryItemId({
        branchId,
        familyCode,
        subCode,
        colorName: selectedColor.name,
        colorId: selectedColor.id,
        type: effectiveType,
        pieceLength:
          effectiveType === 'PIECE' && !isPiecePackage ? normalized.pieceLength : undefined,
        isPiecePackage,
        packageComponents: normalizedPackageComponents,
        instanceKey: instanceKeyForCreate || undefined,
      });
    }
    if (!id) {
      return alert(t('itemInput.couldNotBuildId'));
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
      type: effectiveType,
      costPrice: subCode,
      qrCodeValue: id,
      qrCodeDataUrl: createdQrDataUrl,
      description: description.trim() || undefined,
      pictureName: pictureName || undefined,
      pictureDataUrl: pictureDataUrl || undefined,
    };
    if (effectiveType === 'ROLL' || effectiveType === 'REMANENT') {
      payload.meters = Number(normalized.meters ?? meters);
      if (instanceKeyForCreate) payload.packageKey = instanceKeyForCreate;
    }
    if (type === 'PIECE' && isPiecePackage) {
      payload.isPiecePackage = true;
      payload.packageKey = packageKey;
      payload.packageComponents = normalizedPackageComponents;
      payload.quantity = Number(quantity);
    } else if (effectiveType === 'PIECE') {
      payload.pieceLength = Number(normalized.pieceLength ?? pieceLength);
      payload.quantity = Number(normalized.quantity ?? quantity);
    }

    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const createResponse = await api.post('/inventory', payload);
      const savedItem = createResponse.data?.item;
      const savedId = savedItem?.id || id;
      const savedQrDataUrl = savedItem?.qrCodeDataUrl || createdQrDataUrl;
      setSuccessMessage(t('itemInput.itemCreated', { id: savedId, branch: branchLabel }));
      setCreatedItemId(savedId);
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
        t('itemInput.failedToCreate', {
          status: status ? t('common.requestFailedStatus', { status }) : '',
          message: body?.error ?? body?.message ?? error?.message ?? t('errors.unexpected'),
        })
      );
      console.error('Inventory create error:', error);
    }
  };

  const handlePrint = (itemId: string, dataUrl: string) => {
    if (!selectedColor) return;
    const printed = printInventoryLabel({
      itemId,
      qrDataUrl: dataUrl,
      familyCode,
      subCode,
      type,
      typeLabel: getItemTypeLabel(t, type),
      colorName: selectedColor.name,
      branchLabel,
      amountLabel,
      labels: {
        title: t('itemInput.qrLabel'),
        familyCode: t('itemInput.familyLabel'),
        subCode: t('itemInput.subCodeLabel'),
        type: t('itemInput.typeLabel'),
        amount: t('itemInput.amountLabel'),
        color: t('itemInput.colorLabel'),
        destination: t('itemInput.destinationLabel'),
      },
    });
    if (!printed) alert(t('errors.allowPopups'));
  };

  return (
    <div className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('itemInput.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            {t('itemInput.subtitle')}
          </p>
        </div>
        <Link to="/inventory" className="text-sm font-semibold text-magenta-600 hover:underline">
          Back to inventory
        </Link>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-black">{t('itemInput.itemDetails')}</h3>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">{t('itemInput.familyCode')}</label>
                <input
                  type="number"
                  min="1"
                  value={familyCode}
                  onChange={(e) => setFamilyCode(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">{t('itemInput.familyCodeHint')}</p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
                onClick={loadNextFamilyCode}
                disabled={loadingFamilyCode}
              >
                {loadingFamilyCode ? t('itemInput.findingNextFamily') : t('itemInput.nextFamilyCode')}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-800">
                {t('itemInput.subCodesInFamily', { code: familyCode })}
              </p>
              {familySubCodes.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  {t('itemInput.noItemsInFamily')}
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
                      {getColorLabel(t, item.color?.name) || t('common.color')} · {getItemTypeLabel(t, item.type)}
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
              <label className="block text-sm font-medium text-gray-700">{t('itemInput.subCodePrice')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={subCode}
                onChange={(e) => setSubCode(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">{t('itemInput.subCodeHint')}</p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium text-gray-700">{t('itemInput.color')}</label>
                {canManageColors && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingColor((current) => !current);
                      setColorFormError(null);
                    }}
                    className="text-xs font-semibold text-magenta-600 hover:text-magenta-700"
                  >
                    {isAddingColor ? t('itemInput.selectExistingColor') : t('itemInput.addNewColor')}
                  </button>
                )}
              </div>
              {isAddingColor ? (
                <div className="mt-2 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600">{t('itemInput.newColorName')}</label>
                    <input
                      type="text"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder={t('itemInput.newColorNamePlaceholder')}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">{t('itemInput.newColorNameHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">{t('itemInput.newColorHex')}</label>
                    <input
                      type="color"
                      value={newColorHex}
                      onChange={(e) => setNewColorHex(e.target.value)}
                      className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-gray-300 bg-white"
                    />
                  </div>
                  {colorFormError && (
                    <p className="text-sm text-red-600">{colorFormError}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleAddColor}
                      disabled={isSavingColor}
                      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      {isSavingColor ? t('common.saving') : t('itemInput.saveColor')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingColor(false);
                        setColorFormError(null);
                        setNewColorName('');
                        setNewColorHex('#000000');
                      }}
                      className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={colorId}
                  onChange={(e) => setColorId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {colors.map((color) => (
                    <option key={color.id} value={color.id}>
                      {getColorLabel(t, color.name)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('itemInput.type')}</label>
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
                    {getItemTypeLabel(t, itemType)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">{t('itemInput.howMany')}</label>
              {type === 'PIECE' && isPiecePackage ? (
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  placeholder={t('itemInput.numberOfPackages')}
                />
              ) : type === 'PIECE' ? (
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder={t('itemInput.piecesPlaceholder')}
                  />
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={pieceLength}
                    onChange={(e) => setPieceLength(Number(e.target.value))}
                    className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                    placeholder={t('itemInput.lengthEachPlaceholder')}
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
                  placeholder={type === 'ROLL' ? t('itemInput.metersInRoll') : t('itemInput.remnantMeters')}
                />
              )}
            </div>
            {willSaveAsRemnant && (
              <p className="mt-2 text-sm font-medium text-amber-700">
                {t('itemInput.savedAsRemnantHint', { threshold: REMNANT_THRESHOLD_METERS })}
              </p>
            )}
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
                  <span className="block text-sm font-semibold text-black">{t('itemInput.piecePackage')}</span>
                  <span className="mt-1 block text-sm text-gray-600">
                    {t('itemInput.piecePackageDescription')}
                  </span>
                </span>
              </label>

              {isPiecePackage && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-800">{t('itemInput.piecesInPackage')}</p>
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
                        placeholder={t('itemInput.pieceNamePlaceholder')}
                      />
                      <input
                        type="number"
                        min="1"
                        value={component.countPerPackage}
                        onChange={(event) =>
                          updatePackageComponent(index, 'countPerPackage', Number(event.target.value))
                        }
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        placeholder={t('common.count')}
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
                    {t('itemInput.eachPackageContains', { count: totalPiecesPerPackage(normalizedPackageComponents), summary: 
                    formatPackageSummary(normalizedPackageComponents) })}
                  </p>
                </div>
              )}
            </section>
          )}

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700">{t('itemInput.sendToBranch')}</label>
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
                  {t(branch.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="text-base font-semibold text-black">{t('itemInput.itemDescription')}</h4>
            <p className="mt-1 text-sm text-gray-500">
              {t('itemInput.itemDescriptionHint')}
            </p>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder={t('itemInput.descriptionPlaceholder')}
            />
          </section>

          <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h4 className="text-base font-semibold text-black">{t('itemInput.itemImage')}</h4>
            <p className="mt-1 text-sm text-gray-500">
              {t('itemInput.itemImageHint')}
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
                  alt={pictureName || t('itemInput.selectedPictureAlt')}
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
              {loadingDefaults ? t('common.loading') : t('itemInput.saveItemAndQr')}
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
                ? t('itemInput.duplicatePackage', {
                    summary: formatPackageSummary(normalizedPackageComponents),
                    branch: branchLabel,
                  })
                : type === 'PIECE'
                  ? t('itemInput.duplicatePiece', { length: pieceLength, branch: branchLabel })
                  : t('itemInput.duplicateOther', { branch: branchLabel })}
            </p>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-black">{t('itemInput.qrLabel')}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t('itemInput.qrLabelHint')}
            </p>
            <div className="mt-4 flex flex-col items-center rounded-2xl bg-gray-50 p-4">
              {qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt={t('itemInput.qrAlt', { id: generatedItemId })} className="h-48 w-48" />
                  <p className="mt-3 break-all text-center text-sm font-semibold text-black">
                    {generatedItemId}
                  </p>
                  <div className="mt-4 grid w-full gap-2 text-sm text-gray-700">
                    <div className="flex justify-between">
                      <span>{t('itemInput.familyLabel')}</span>
                      <strong>{familyCode}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('itemInput.subCodeLabel')}</span>
                      <strong>${formatSubCode(subCode)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('itemInput.type')}</span>
                      <strong>{getItemTypeLabel(t, type)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('itemInput.amountLabel')}</span>
                      <strong>{amountLabel}</strong>
                    </div>
                    {type === 'PIECE' && isPiecePackage && (
                      <div className="flex justify-between">
                        <span>{t('itemInput.packageLabel')}</span>
                        <strong className="text-right">
                          {formatPackageSummary(normalizedPackageComponents)}
                        </strong>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>{t('itemInput.color')}</span>
                      <strong>{getColorLabel(t, selectedColor?.name) || t('common.dash')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('itemInput.destinationLabel')}</span>
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
                <p className="text-sm text-gray-500">{t('itemInput.fillFormForQr')}</p>
              )}
            </div>

            {createdItemId && (
              <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                <p className="font-semibold">{t('itemInput.itemSaved')}</p>
                <p className="mt-1 break-all">{t('itemInput.idLabel', { id: createdItemId })}</p>
                {createdDescription && (
                  <p className="mt-2 text-green-800">
                    <span className="font-semibold">{t('itemInput.descriptionLabel')}</span> {createdDescription}
                  </p>
                )}
                {createdPictureDataUrl && (
                  <img
                    src={createdPictureDataUrl}
                    alt={t('itemInput.savedPictureAlt', { id: createdItemId })}
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
