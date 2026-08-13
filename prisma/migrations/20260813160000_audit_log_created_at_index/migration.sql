-- Permanent activity history: faster date-range queries (no retention / no deletes)
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
