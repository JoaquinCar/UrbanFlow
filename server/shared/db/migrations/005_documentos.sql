-- 005: documentos adjuntos de propietarios (INE, escritura, comprobantes...).
--
-- Nota sobre el esquema documentado: docs/db-schema.md solo lista
-- (id, propietario_id, tipo, url_archivo, created_at). Se añaden tres columnas
-- porque multer renombra los archivos subidos a un UUID y sin ellas la descarga
-- no puede devolver el nombre original ni un Content-Type correcto.
--
-- Tampoco lleva fraccionamiento_id, igual que en db-schema.md: el aislamiento
-- se hace por JOIN contra propietarios. Duplicar la columna invita a que las
-- dos copias se desincronicen.

CREATE TABLE IF NOT EXISTS documentos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propietario_id UUID NOT NULL REFERENCES propietarios(id) ON DELETE CASCADE,
  tipo           VARCHAR(50) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  url_archivo    TEXT NOT NULL,
  mime_type      VARCHAR(100),
  tamano_bytes   INTEGER,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documentos_propietario ON documentos (propietario_id);
