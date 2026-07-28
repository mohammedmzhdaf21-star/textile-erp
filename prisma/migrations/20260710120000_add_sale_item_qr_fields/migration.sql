-- Add QR snapshot fields to sale line items for history / reprint
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "qrCodeValue" VARCHAR(255);
ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "qrCodeDataUrl" TEXT;
