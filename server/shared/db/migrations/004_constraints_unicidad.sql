-- 004: claves naturales para que el seed sea idempotente.
--
-- Sin estas restricciones, ON CONFLICT no tiene destino y el seed duplica filas
-- en cada corrida. Cada una es además la regla de negocio correcta: no puede
-- haber dos lotes con el mismo número en un fraccionamiento, ni dos
-- propietarios colgando del mismo usuario.

-- Un fraccionamiento por nombre.
ALTER TABLE fraccionamientos
  DROP CONSTRAINT IF EXISTS uq_fraccionamientos_nombre;
ALTER TABLE fraccionamientos
  ADD CONSTRAINT uq_fraccionamientos_nombre UNIQUE (nombre);

-- El número de lote es único dentro de su fraccionamiento, no globalmente.
ALTER TABLE lotes
  DROP CONSTRAINT IF EXISTS uq_lotes_fraccionamiento_numero;
ALTER TABLE lotes
  ADD CONSTRAINT uq_lotes_fraccionamiento_numero UNIQUE (fraccionamiento_id, numero);

-- La relación usuarios <-> propietarios es 1:1 (db-schema.md).
ALTER TABLE propietarios
  DROP CONSTRAINT IF EXISTS uq_propietarios_usuario;
ALTER TABLE propietarios
  ADD CONSTRAINT uq_propietarios_usuario UNIQUE (usuario_id);
