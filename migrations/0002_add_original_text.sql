-- Add original_text column to receipts table
-- Stores the raw pasted text for parser improvement and debugging
ALTER TABLE receipts ADD COLUMN original_text TEXT;
