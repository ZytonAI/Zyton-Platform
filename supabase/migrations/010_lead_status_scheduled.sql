-- Agregar estado 'scheduled' al CHECK constraint de leads
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%contacted%';

  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE leads DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'lost', 'converted', 'scheduled'));
