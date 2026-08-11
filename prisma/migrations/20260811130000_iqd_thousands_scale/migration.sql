-- Convert legacy shorthand price values (20 = 20,000 IQD) to full IQD amounts.

UPDATE inventory_items
SET
  "subCode" = "subCode" * 1000,
  "costPrice" = COALESCE("costPrice", "subCode") * 1000
WHERE "subCode" > 0 AND "subCode" < 500;

UPDATE sale_items
SET
  "soldPrice" = "soldPrice" * 1000,
  "lineDiscount" = "lineDiscount" * 1000
WHERE "soldPrice" > 0 AND "soldPrice" < 500;

UPDATE sales
SET
  "totalPrice" = "totalPrice" * 1000,
  "discount" = "discount" * 1000
WHERE "totalPrice" > 0 AND "totalPrice" < 500;

UPDATE refunds
SET "amount" = "amount" * 1000
WHERE "amount" > 0 AND "amount" < 500;

UPDATE plain_cloth_pricing
SET "pricePerM" = "pricePerM" * 1000
WHERE "pricePerM" > 0 AND "pricePerM" < 500;

UPDATE whole_cloth_deals
SET "dealPrice" = "dealPrice" * 1000
WHERE "dealPrice" > 0 AND "dealPrice" < 500;

UPDATE employee_commission_entries
SET
  "soldPrice" = "soldPrice" * 1000,
  "minimumPrice" = "minimumPrice" * 1000,
  "commissionAmount" = "commissionAmount" * 1000
WHERE "soldPrice" > 0 AND "soldPrice" < 500;

UPDATE paid_commission_history
SET "amountPaid" = "amountPaid" * 1000
WHERE "amountPaid" > 0 AND "amountPaid" < 500;

UPDATE paid_trustee_commission_history
SET "amountPaid" = "amountPaid" * 1000
WHERE "amountPaid" > 0 AND "amountPaid" < 500;
