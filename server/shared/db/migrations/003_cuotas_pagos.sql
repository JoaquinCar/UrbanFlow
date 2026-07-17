-- Migration 003: cuotas y pagos

CREATE TYPE tipo_cuota AS ENUM ('mensual', 'extraordinaria');
CREATE TYPE estado_cuota AS ENUM ('pendiente', 'pagado', 'vencido');
CREATE TYPE metodo_pago AS ENUM ('online', 'efectivo', 'transferencia');

CREATE TABLE IF NOT EXISTS cuotas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id  UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  propietario_id      UUID NOT NULL REFERENCES propietarios(id) ON DELETE CASCADE,
  tipo                tipo_cuota NOT NULL DEFAULT 'mensual',
  monto               DECIMAL(12,2) NOT NULL,
  mes_anio            DATE NOT NULL,
  estado              estado_cuota NOT NULL DEFAULT 'pendiente',
  concepto            VARCHAR(255),
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Índice único parcial: solo aplica a cuotas mensuales, permite múltiples extraordinarias del mismo mes
CREATE UNIQUE INDEX IF NOT EXISTS uq_cuota_mensual_mes
  ON cuotas(propietario_id, mes_anio)
  WHERE tipo = 'mensual';

CREATE TABLE IF NOT EXISTS pagos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuota_id        UUID NOT NULL REFERENCES cuotas(id) ON DELETE CASCADE,
  monto_pagado    DECIMAL(12,2) NOT NULL,
  metodo          metodo_pago NOT NULL,
  referencia_mp   VARCHAR(255),
  pdf_url         TEXT,
  fecha_pago      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cuotas_fraccionamiento ON cuotas(fraccionamiento_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_propietario ON cuotas(propietario_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_estado ON cuotas(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_cuota ON pagos(cuota_id);
CREATE INDEX IF NOT EXISTS idx_pagos_referencia_mp ON pagos(referencia_mp) WHERE referencia_mp IS NOT NULL;
