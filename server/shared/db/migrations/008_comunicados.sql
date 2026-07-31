-- 008: comunicados a residentes (email + WhatsApp)

CREATE TABLE IF NOT EXISTS comunicados (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fraccionamiento_id UUID NOT NULL REFERENCES fraccionamientos(id) ON DELETE CASCADE,
  -- RESTRICT: un comunicado enviado es un hecho histórico y no debe borrarse
  -- porque el administrador que lo escribió deje el puesto.
  autor_id           UUID NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  titulo             VARCHAR(200) NOT NULL,
  cuerpo             TEXT NOT NULL,
  -- Lo que se PIDIÓ enviar: { "email": true, "whatsapp": false }
  canales            JSONB NOT NULL DEFAULT '{}',
  -- Lo que REALMENTE pasó, por canal: intentados, enviados, fallidos y errores.
  -- No está en db-schema.md; se añade para que el historial pueda mostrar
  -- "38 enviados, 2 fallidos" sin necesitar una tabla de destinatarios.
  resultado_envio    JSONB,
  enviado_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comunicados_fracc_fecha
  ON comunicados (fraccionamiento_id, enviado_at DESC);
