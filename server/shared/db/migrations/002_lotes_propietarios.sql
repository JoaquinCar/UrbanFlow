-- Migration 002: lotes y propietarios

CREATE TYPE estado_lote AS ENUM ('disponible', 'proceso', 'vendido');

CREATE TABLE IF NOT EXISTS propietarios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id  UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  usuario_id          UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_completo     VARCHAR(200) NOT NULL,
  telefono            VARCHAR(20),
  whatsapp            VARCHAR(20),
  curp                VARCHAR(18),
  num_escritura       VARCHAR(100),
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lotes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id  UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  numero              VARCHAR(20) NOT NULL,
  superficie_m2       DECIMAL(10,2),
  precio              DECIMAL(12,2),
  etapa               VARCHAR(50),
  estado              estado_lote NOT NULL DEFAULT 'disponible',
  svg_path_id         VARCHAR(100),
  propietario_id      UUID REFERENCES propietarios(id) ON DELETE SET NULL,
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_propietarios_fraccionamiento ON propietarios(fraccionamiento_id);
CREATE INDEX IF NOT EXISTS idx_propietarios_usuario ON propietarios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fraccionamiento ON lotes(fraccionamiento_id);
CREATE INDEX IF NOT EXISTS idx_lotes_propietario ON lotes(propietario_id);
CREATE INDEX IF NOT EXISTS idx_lotes_estado ON lotes(estado);
