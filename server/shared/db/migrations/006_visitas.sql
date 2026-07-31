-- 006: control de visitas (caseta de vigilancia)
--
-- El enum lleva un cuarto valor, 'residente', que no está en db-schema.md.
-- Motivo: el spec pide registrar en visitas las entradas por QR de residente,
-- y un residente no es ni 'visita' ni 'delivery' ni 'servicio'. Añadirlo al
-- crear el tipo es gratis; hacerlo después con ALTER TYPE ADD VALUE es
-- incómodo porque no puede ejecutarse dentro de una transacción. La
-- alternativa (marcarlo en el campo notas) convertiría el filtro de la
-- bitácora en un LIKE.

DO $$ BEGIN
  CREATE TYPE tipo_visita AS ENUM ('visita', 'delivery', 'servicio', 'residente');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS visitas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  lote_destino_id    UUID NOT NULL REFERENCES lotes(id) ON DELETE RESTRICT,
  nombre_visitante   VARCHAR(200) NOT NULL,
  placa_vehiculo     VARCHAR(20),
  tipo               tipo_visita NOT NULL DEFAULT 'visita',
  entrada_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  salida_at          TIMESTAMP,
  registrado_por     UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  notas              TEXT,
  -- Una salida anterior a la entrada solo puede ser un error de captura.
  CONSTRAINT chk_visitas_salida CHECK (salida_at IS NULL OR salida_at >= entrada_at)
);

-- ON DELETE RESTRICT en lote_destino_id y registrado_por a propósito: la
-- bitácora es un registro histórico y no debe perder filas porque se dé de
-- baja un lote o un vigilante.

-- El índice que sirve de verdad la bitácora: toda consulta filtra por
-- fraccionamiento y ordena por fecha descendente.
CREATE INDEX IF NOT EXISTS idx_visitas_fracc_entrada
  ON visitas (fraccionamiento_id, entrada_at DESC);

-- "Quién está dentro ahora": pantalla principal de la caseta. Índice parcial
-- porque las visitas abiertas son un puñado frente al histórico completo.
CREATE INDEX IF NOT EXISTS idx_visitas_dentro
  ON visitas (fraccionamiento_id, entrada_at DESC)
  WHERE salida_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_visitas_lote
  ON visitas (lote_destino_id);
