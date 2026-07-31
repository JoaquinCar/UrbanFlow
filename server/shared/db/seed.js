require('dotenv').config()
const bcrypt = require('bcrypt')
const pool = require('./pool')
const { generarQrToken } = require('../utils/qr')

const SALT_ROUNDS = 12
const DEFAULT_PASSWORD = process.env.SEED_PASSWORD || 'UrbanFlow2026!'

// El seed es idempotente: se apoya en las claves naturales de la migración 004
// (fraccionamientos.nombre, usuarios.email, propietarios.usuario_id,
// lotes.fraccionamiento_id+numero) para hacer upsert en vez de insertar a ciegas.
//
// Detalle importante: se usa DO UPDATE y no DO NOTHING. Con DO NOTHING el
// RETURNING no devuelve filas cuando el registro ya existe, se pierde el id y
// el script se rompe en la segunda corrida — que era justo el bug anterior.

function generarLotes(prefijo, desde, hasta, etapa) {
  const lotes = []
  for (let i = desde; i <= hasta; i++) {
    const numero = `${prefijo}-${String(i).padStart(2, '0')}`
    lotes.push({
      numero,
      etapa,
      svg_path_id: `lote-${numero}`,
      superficie_m2: 180 + ((i * 17) % 140),   // 180–320 m², determinista
      precio: 850000 + ((i * 37) % 45) * 10000,
    })
  }
  return lotes
}

// Sin aleatoriedad: el estado depende del índice, así que cada corrida del seed
// produce exactamente el mismo escenario de demostración.
function estadoPorIndice(i) {
  if (i % 5 === 0) return 'proceso'
  if (i % 2 === 0) return 'vendido'
  return 'disponible'
}

async function upsertFraccionamiento(client, nombre, direccion, configMapa) {
  const { rows } = await client.query(
    `INSERT INTO fraccionamientos (nombre, direccion, config_mapa)
     VALUES ($1, $2, $3)
     ON CONFLICT (nombre) DO UPDATE
       SET direccion = EXCLUDED.direccion, config_mapa = EXCLUDED.config_mapa
     RETURNING id, nombre`,
    [nombre, direccion, configMapa]
  )
  return rows[0]
}

async function upsertUsuario(client, u, hash) {
  // password_hash solo se escribe al insertar: volver a correr el seed no debe
  // pisar una contraseña que alguien haya cambiado.
  const { rows } = await client.query(
    `INSERT INTO usuarios (fraccionamiento_id, nombre, email, password_hash, rol)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           rol = EXCLUDED.rol,
           fraccionamiento_id = EXCLUDED.fraccionamiento_id,
           activo = TRUE
     RETURNING id, email, rol`,
    [u.fracId, u.nombre, u.email, hash, u.rol]
  )
  return rows[0]
}

async function upsertPropietario(client, p) {
  const { rows } = await client.query(
    `INSERT INTO propietarios
       (fraccionamiento_id, usuario_id, nombre_completo, telefono, whatsapp, curp, num_escritura)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (usuario_id) DO UPDATE
       SET nombre_completo = EXCLUDED.nombre_completo,
           telefono = EXCLUDED.telefono,
           whatsapp = EXCLUDED.whatsapp,
           curp = EXCLUDED.curp,
           num_escritura = EXCLUDED.num_escritura
     RETURNING id, nombre_completo`,
    [p.fracId, p.usuarioId, p.nombre_completo, p.telefono, p.whatsapp, p.curp, p.num_escritura]
  )
  return rows[0]
}

async function upsertLote(client, fracId, lote, estado, propietarioId) {
  const { rows } = await client.query(
    `INSERT INTO lotes
       (fraccionamiento_id, numero, superficie_m2, precio, etapa, estado, svg_path_id, propietario_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (fraccionamiento_id, numero) DO UPDATE
       SET superficie_m2 = EXCLUDED.superficie_m2,
           precio = EXCLUDED.precio,
           etapa = EXCLUDED.etapa,
           estado = EXCLUDED.estado,
           svg_path_id = EXCLUDED.svg_path_id,
           propietario_id = EXCLUDED.propietario_id
     RETURNING id`,
    [fracId, lote.numero, lote.superficie_m2, lote.precio, lote.etapa, estado, lote.svg_path_id, propietarioId]
  )
  return rows[0]
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed no se ejecuta en producción')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Fraccionamientos ─────────────────────────────────────────────────────
    const fracc1 = await upsertFraccionamiento(
      client,
      'Residencial Las Palmas',
      'Av. Principal 100, Culiacán, Sinaloa',
      '{"etapas": 2, "total_lotes": 25}'
    )
    const fracc2 = await upsertFraccionamiento(
      client,
      'Jardines del Sol',
      'Blvd. Universitarios 250, Culiacán, Sinaloa',
      '{"etapas": 1, "total_lotes": 15}'
    )

    const fracId1 = fracc1.id
    const fracId2 = fracc2.id
    console.log(`Fraccionamiento 1: ${fracc1.nombre} (${fracId1})`)
    console.log(`Fraccionamiento 2: ${fracc2.nombre} (${fracId2})`)

    // ── Usuarios ─────────────────────────────────────────────────────────────
    // Un solo hash reutilizado: 20 hashes con coste 12 son ~8 segundos tirados.
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, SALT_ROUNDS)

    const usuarios = [
      { nombre: 'Admin UrbanFlow',  email: 'admin@urbanflow.test',       rol: 'admin',       fracId: fracId1 },
      { nombre: 'Vigilante Caseta', email: 'vigilante@urbanflow.test',   rol: 'vigilante',   fracId: fracId1 },
      { nombre: 'Juan Propietario', email: 'propietario@urbanflow.test', rol: 'propietario', fracId: fracId1 },
      { nombre: 'Carlos Técnico',   email: 'tecnico@urbanflow.test',     rol: 'tecnico',     fracId: fracId1 },
      { nombre: 'Admin Jardines',   email: 'admin2@urbanflow.test',      rol: 'admin',       fracId: fracId2 },
      // Propietarios adicionales para que las listas y el mapa tengan cuerpo.
      { nombre: 'María Fernanda Ríos', email: 'propietario2@urbanflow.test', rol: 'propietario', fracId: fracId1 },
      { nombre: 'Luis Ángel Beltrán',  email: 'propietario3@urbanflow.test', rol: 'propietario', fracId: fracId1 },
    ]

    const porEmail = {}
    for (const u of usuarios) {
      const row = await upsertUsuario(client, u, hash)
      porEmail[row.email] = row
      console.log(`  ✓ ${row.rol.padEnd(12)} ${row.email}`)
    }

    // ── Propietarios ─────────────────────────────────────────────────────────
    const propietarios = [
      {
        fracId: fracId1, usuarioId: porEmail['propietario@urbanflow.test'].id,
        nombre_completo: 'Juan Pérez Domínguez', telefono: '6671234567',
        whatsapp: '+526671234567', curp: 'PEDJ850312HSLRMN04', num_escritura: 'ESC-2024-0147',
      },
      {
        fracId: fracId1, usuarioId: porEmail['propietario2@urbanflow.test'].id,
        nombre_completo: 'María Fernanda Ríos Guzmán', telefono: '6679876543',
        whatsapp: '+526679876543', curp: 'RIGM900718MSLSZR07', num_escritura: 'ESC-2024-0212',
      },
      {
        fracId: fracId1, usuarioId: porEmail['propietario3@urbanflow.test'].id,
        nombre_completo: 'Luis Ángel Beltrán Soto', telefono: '6675554433',
        whatsapp: '+526675554433', curp: 'BESL881125HSLLTS02', num_escritura: 'ESC-2025-0033',
      },
    ]

    const propsCreados = []
    for (const p of propietarios) {
      const row = await upsertPropietario(client, p)
      propsCreados.push(row)

      // El QR se siembra para que POST /api/visitas/qr sea probable justo
      // después del seed, sin tener que pasar antes por el portal.
      await client.query(
        'UPDATE usuarios SET qr_token = $1 WHERE id = $2',
        [generarQrToken(p.usuarioId, p.fracId), p.usuarioId]
      )

      console.log(`  ✓ propietario  ${row.nombre_completo}`)
    }

    // ── Lotes ────────────────────────────────────────────────────────────────
    // 25 en Las Palmas (2 etapas) + 15 en Jardines del Sol.
    const lotesF1 = [
      ...generarLotes('A', 1, 15, 'Etapa 1'),
      ...generarLotes('B', 1, 10, 'Etapa 2'),
    ]
    const lotesF2 = generarLotes('C', 1, 15, 'Etapa 1')

    let vendidos = 0
    for (let i = 0; i < lotesF1.length; i++) {
      const estado = estadoPorIndice(i)
      // Los vendidos se reparten entre los tres propietarios en round-robin.
      const propietarioId = estado === 'vendido'
        ? propsCreados[vendidos++ % propsCreados.length].id
        : null
      await upsertLote(client, fracId1, lotesF1[i], estado, propietarioId)
    }

    for (let i = 0; i < lotesF2.length; i++) {
      // El fraccionamiento 2 no tiene propietarios sembrados todavía, así que
      // ningún lote suyo puede quedar 'vendido' (rompería la regla de que un
      // lote vendido tiene dueño y el cron de cuotas lo cobraría a nadie).
      const estado = i % 4 === 0 ? 'proceso' : 'disponible'
      await upsertLote(client, fracId2, lotesF2[i], estado, null)
    }

    console.log(`  ✓ lotes        ${lotesF1.length} en Las Palmas, ${lotesF2.length} en Jardines del Sol`)
    console.log(`  ✓ vendidos     ${vendidos} lotes con propietario asignado`)

    // ── Visitas ──────────────────────────────────────────────────────────────
    // Sin clave natural: se borran las del fraccionamiento y se regeneran, para
    // que el seed siga siendo idempotente.
    await client.query('DELETE FROM visitas WHERE fraccionamiento_id = $1', [fracId1])

    const { rows: lotesVendidos } = await client.query(
      `SELECT id, numero FROM lotes
       WHERE fraccionamiento_id = $1 AND estado = 'vendido' ORDER BY numero`,
      [fracId1]
    )
    const vigilanteId = porEmail['vigilante@urbanflow.test'].id

    const VISITANTES = [
      ['Rosa Elena Márquez', 'visita', 'SLP-4471'],
      ['Paquetería Estafeta', 'delivery', 'MXN-8820'],
      ['Ana Sofía Iribe', 'visita', null],
      ['Técnico Aire Frío', 'servicio', 'CUL-1193'],
      ['Reparto Amazon', 'delivery', 'AMZ-3364'],
      ['Jorge Luis Peraza', 'visita', 'SIN-7712'],
      ['Jardinería Verde', 'servicio', null],
      ['Fernanda Ochoa', 'visita', 'CUL-5508'],
      ['DiDi Food', 'delivery', null],
    ]

    // Las fechas son relativas a NOW(), así que la bitácora de 30 días siempre
    // tiene contenido sin importar cuándo se corra el seed o la demostración.
    let visitas = 0
    let dentro = 0
    for (let i = 0; i < 45; i++) {
      const [nombre, tipo, placa] = VISITANTES[i % VISITANTES.length]
      const lote = lotesVendidos[i % lotesVendidos.length]
      const horasAtras = i * 15 + (i % 7)          // reparte ~28 días hacia atrás
      const sigueDentro = i < 3                     // las 3 más recientes, adentro
      const duracion = 1 + (i % 5)

      await client.query(
        `INSERT INTO visitas
           (fraccionamiento_id, lote_destino_id, nombre_visitante, placa_vehiculo,
            tipo, entrada_at, salida_at, registrado_por)
         VALUES ($1, $2, $3, $4, $5,
                 NOW() - ($6 || ' hours')::interval,
                 CASE WHEN $7 THEN NULL
                      ELSE NOW() - ($6 || ' hours')::interval + ($8 || ' hours')::interval END,
                 $9)`,
        [fracId1, lote.id, nombre, placa, tipo, horasAtras, sigueDentro, duracion, vigilanteId]
      )
      visitas++
      if (sigueDentro) dentro++
    }

    console.log(`  ✓ visitas      ${visitas} en los últimos 30 días (${dentro} aún dentro)`)

    await client.query('COMMIT')
    console.log(`\nPassword para todos: ${DEFAULT_PASSWORD}`)
    console.log('Seed completado.')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(err => {
  console.error('Seed falló:', err.message)
  process.exit(1)
})
