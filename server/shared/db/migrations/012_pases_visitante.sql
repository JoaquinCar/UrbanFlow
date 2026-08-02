-- 012: pases de visitante — códigos QR temporales que un propietario genera
-- para una visita esperada (entrega, servicio o visita). A diferencia del QR
-- de residente (no expira, se revoca por rotación), este SÍ tiene fecha de
-- expiración y es de un solo uso: la fuente de verdad para validarlo en la
-- caseta es esta tabla, no el JWT (que tampoco lleva 'exp' propio, para poder
-- cancelar un pase antes de tiempo con solo adelantar expira_at).

CREATE TABLE IF NOT EXISTS pases_visitante (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  lote_id            UUID NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
  creado_por         UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_visitante   VARCHAR(200) NOT NULL,
  tipo               tipo_visita NOT NULL DEFAULT 'visita',
  expira_at          TIMESTAMP NOT NULL,
  usado_at           TIMESTAMP,
  visita_id          UUID REFERENCES visitas(id) ON DELETE SET NULL,
  creado_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  -- 'residente' es exclusivo del QR fijo del propietario, no de un pase temporal.
  CONSTRAINT chk_pases_tipo CHECK (tipo <> 'residente')
);

-- Listar "mis códigos" ordenados por creación es la consulta del portal.
CREATE INDEX IF NOT EXISTS idx_pases_visitante_creador
  ON pases_visitante (creado_por, creado_at DESC);

-- Pases todavía vigentes: un puñado frente al histórico completo.
CREATE INDEX IF NOT EXISTS idx_pases_visitante_vigentes
  ON pases_visitante (fraccionamiento_id)
  WHERE usado_at IS NULL;
