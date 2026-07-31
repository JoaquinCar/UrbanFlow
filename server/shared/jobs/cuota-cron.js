const cron = require('node-cron')
const pool = require('../db/pool')

const MONTO_CUOTA_MENSUAL = parseFloat(process.env.MONTO_CUOTA_MENSUAL) || 1500

async function generarCuotasMensuales(fechaRef) {
  const fecha = fechaRef || new Date()
  const mesAnio = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-01`

  const client = await pool.connect()
  try {
    const { rows: propietarios } = await client.query(`
      SELECT DISTINCT p.id AS propietario_id, p.fraccionamiento_id
      FROM propietarios p
      INNER JOIN lotes l ON l.propietario_id = p.id
      WHERE l.estado = 'vendido'
    `)

    if (propietarios.length === 0) {
      console.log('[cuota-cron] No hay propietarios con lotes vendidos')
      return 0
    }

    let insertados = 0
    for (const prop of propietarios) {
      const { rowCount } = await client.query(
        `INSERT INTO cuotas (fraccionamiento_id, propietario_id, tipo, monto, mes_anio, estado)
         VALUES ($1, $2, 'mensual', $3, $4, 'pendiente')
         ON CONFLICT DO NOTHING`,
        [prop.fraccionamiento_id, prop.propietario_id, MONTO_CUOTA_MENSUAL, mesAnio]
      )
      insertados += rowCount
    }

    console.log(`[cuota-cron] ${insertados} cuotas generadas para ${mesAnio}`)
    return insertados
  } finally {
    client.release()
  }
}

function iniciarCronCuotas() {
  // La zona horaria es explícita a propósito: en Railway/Render el contenedor
  // arranca en UTC, y mes_anio se calcula con new Date() local. Sin fijarla, el
  // job del día 1 a las 00:01 UTC cae en el mes anterior en horario de México.
  const timezone = process.env.TZ || 'America/Mazatlan'

  cron.schedule('1 0 1 * *', async () => {
    console.log('[cuota-cron] Ejecutando generación mensual...')
    try {
      await generarCuotasMensuales()
    } catch (err) {
      console.error('[cuota-cron] Error:', err.message)
    }
  }, { timezone })

  console.log(`[cuota-cron] Programado: día 1 de cada mes a las 00:01 (${timezone})`)
}

module.exports = { iniciarCronCuotas, generarCuotasMensuales }
