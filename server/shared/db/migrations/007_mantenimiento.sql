-- 007: tickets de mantenimiento

DO $$ BEGIN
  CREATE TYPE estado_ticket AS ENUM ('abierto', 'en_proceso', 'resuelto');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS solicitudes_mantenimiento (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  solicitante_id     UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- SET NULL y no CASCADE: si se da de baja al técnico, el ticket no
  -- desaparece, solo se queda sin asignar.
  tecnico_id         UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  descripcion        TEXT NOT NULL,
  ubicacion          VARCHAR(200),
  estado             estado_ticket NOT NULL DEFAULT 'abierto',
  created_at         TIMESTAMP DEFAULT NOW(),
  resuelto_at        TIMESTAMP,

  -- Hace imposible que estado y resuelto_at se contradigan. El error clásico
  -- es reabrir un ticket dejando la fecha de resolución puesta: con esta
  -- restricción, la base rechaza esa fila en lugar de aceptar un dato falso.
  CONSTRAINT chk_ticket_resuelto CHECK ((estado = 'resuelto') = (resuelto_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_mant_fracc_estado
  ON solicitudes_mantenimiento (fraccionamiento_id, estado);

-- Parcial: la mayoría de los tickets abiertos aún no tienen técnico asignado.
CREATE INDEX IF NOT EXISTS idx_mant_tecnico
  ON solicitudes_mantenimiento (tecnico_id) WHERE tecnico_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mant_solicitante
  ON solicitudes_mantenimiento (solicitante_id);
