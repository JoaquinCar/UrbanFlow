-- 010: la referencia de MercadoPago pasa a ser única.
--
-- La migración 003 la indexó, pero sin UNIQUE. El problema es que MercadoPago
-- REINTENTA las notificaciones del webhook: si no recibe un 200 rápido, o
-- simplemente por su política de reintentos, manda la misma varias veces. Sin
-- restricción de unicidad, cada reintento insertaría otra fila en `pagos` y la
-- cuota aparecería pagada dos o tres veces.
--
-- Con este índice, el webhook puede usar ON CONFLICT DO NOTHING y volverse
-- idempotente: el segundo aviso del mismo pago no hace nada.
--
-- Es un índice PARCIAL porque los pagos en efectivo y por transferencia no
-- tienen referencia_mp, y varios NULL no chocarían entre sí de todos modos,
-- pero así queda explícito y el índice es más pequeño.

DROP INDEX IF EXISTS idx_pagos_referencia_mp;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_referencia_mp
  ON pagos (referencia_mp)
  WHERE referencia_mp IS NOT NULL;
