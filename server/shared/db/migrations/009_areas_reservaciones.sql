-- 009: áreas comunes y reservaciones

-- btree_gist permite mezclar en un mismo índice GiST una comparación de
-- igualdad (area_id) con una de solapamiento (el rango de tiempo).
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE estado_reservacion AS ENUM ('pendiente', 'confirmada', 'cancelada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS areas_comunes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  nombre             VARCHAR(100) NOT NULL,
  capacidad          INTEGER,
  activa             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_areas_capacidad CHECK (capacidad IS NULL OR capacidad > 0)
);

-- Clave natural: hace idempotente el seed y evita dos "Alberca" en el mismo
-- fraccionamiento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_areas_fracc_nombre
  ON areas_comunes (fraccionamiento_id, nombre);

CREATE TABLE IF NOT EXISTS reservaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id        UUID NOT NULL REFERENCES areas_comunes(id) ON DELETE CASCADE,
  propietario_id UUID NOT NULL REFERENCES propietarios(id) ON DELETE CASCADE,
  fecha          DATE NOT NULL,
  hora_inicio    TIME NOT NULL,
  hora_fin       TIME NOT NULL,
  estado         estado_reservacion NOT NULL DEFAULT 'pendiente',
  created_at     TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_reserva_horas CHECK (hora_fin > hora_inicio)
);

-- Sin fraccionamiento_id, igual que en db-schema.md: el aislamiento va por
-- JOIN contra areas_comunes.

-- Solapamiento imposible a nivel de base de datos.
--
-- El servicio comprueba antes con un SELECT para poder devolver un 409 que
-- diga con qué reserva choca, pero ese SELECT tiene una condición de carrera:
-- entre la consulta y el INSERT, otro usuario puede reservar el mismo hueco.
-- Esta restricción EXCLUDE es la garantía real; el SELECT es solo cortesía.
--
-- (fecha + hora) produce un timestamp y esa suma es inmutable, así que puede
-- usarse dentro de un índice. Las canceladas se excluyen: un hueco cancelado
-- vuelve a estar libre.
DO $$ BEGIN
  ALTER TABLE reservaciones ADD CONSTRAINT excl_reservaciones_solape
    EXCLUDE USING gist (
      area_id WITH =,
      tsrange(fecha + hora_inicio, fecha + hora_fin) WITH &&
    ) WHERE (estado <> 'cancelada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_reservaciones_area_fecha
  ON reservaciones (area_id, fecha) WHERE estado <> 'cancelada';

CREATE INDEX IF NOT EXISTS idx_reservaciones_propietario
  ON reservaciones (propietario_id);
