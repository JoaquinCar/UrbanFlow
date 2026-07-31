-- 011: acota la unicidad de referencia_mp a los pagos en línea.
--
-- La migración 010 hizo único el índice sobre referencia_mp para que los
-- reintentos del webhook de MercadoPago no duplicaran pagos. Pero la condición
-- era "referencia_mp IS NOT NULL", y esa columna también guarda la referencia
-- de los cobros manuales (folio de caja, número de transferencia).
--
-- Consecuencia: dos cobros en efectivo con el mismo folio reventaban con
-- "duplicate key value violates unique constraint". Y los folios de caja SÍ se
-- repiten legítimamente entre propietarios y periodos.
--
-- La garantía que hace falta es únicamente sobre los pagos en línea, que es
-- donde MercadoPago reintenta. Se acota el índice a metodo = 'online'.

DROP INDEX IF EXISTS uq_pagos_referencia_mp;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_referencia_mp_online
  ON pagos (referencia_mp)
  WHERE referencia_mp IS NOT NULL AND metodo = 'online';

-- Índice normal para poder buscar por referencia en los cobros manuales.
CREATE INDEX IF NOT EXISTS idx_pagos_referencia
  ON pagos (referencia_mp)
  WHERE referencia_mp IS NOT NULL;
