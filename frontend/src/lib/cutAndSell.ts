import api from './api';

export const sellCutPiece = async (input: {
  pieceItemId: string;
  colorId: string;
  branchId: string;
  employeeId: string;
  customerName: string;
  customerPhone: string;
  soldPrice: number;
  rollSourceId: string;
  notes?: string;
}) => {
  const response = await api.post('/sales', {
    branchId: input.branchId,
    employeeId: input.employeeId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items: [
      {
        inventoryItemId: input.pieceItemId,
        colorId: input.colorId,
        soldAsUnit: 'PIECE',
        quantitySold: 1,
        soldPrice: input.soldPrice,
        lineDiscount: 0,
      },
    ],
    discount: 0,
    paymentMethod: 'CASH',
    notes:
      input.notes ??
      `Cut-and-sell from roll ${input.rollSourceId} for exchange. QR label printed.`,
  });
  return response.data;
};
