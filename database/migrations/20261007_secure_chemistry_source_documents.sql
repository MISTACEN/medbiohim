-- MEDBIOHIM: protect chemistry source/provenance metadata.
-- Runtime writes remain server-side; authenticated users may read provenance.
ALTER TABLE public.chemistry_source_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chemistry_source_documents_authenticated_read
  ON public.chemistry_source_documents;

CREATE POLICY chemistry_source_documents_authenticated_read
  ON public.chemistry_source_documents
  FOR SELECT
  TO authenticated
  USING (true);
