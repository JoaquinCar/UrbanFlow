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

// Catálogo de propietarios de la demostración. El primero conserva el correo
// propietario@urbanflow.test que documenta el README.
const PROPIETARIOS = [
  { email: 'propietario@urbanflow.test',   nombre_completo: 'Juan Pérez Domínguez',        telefono: '6671234567', whatsapp: '+526671234567', curp: 'PEDJ850312HSLRMN04', num_escritura: 'ESC-2024-0147' },
  { email: 'propietario2@urbanflow.test',  nombre_completo: 'María Fernanda Ríos Guzmán',  telefono: '6679876543', whatsapp: '+526679876543', curp: 'RIGM900718MSLSZR07', num_escritura: 'ESC-2024-0212' },
  { email: 'propietario3@urbanflow.test',  nombre_completo: 'Luis Ángel Beltrán Soto',     telefono: '6675554433', whatsapp: '+526675554433', curp: 'BESL881125HSLLTS02', num_escritura: 'ESC-2025-0033' },
  { email: 'propietario4@urbanflow.test',  nombre_completo: 'Carmen Alicia Zazueta Lara',  telefono: '6671112233', whatsapp: '+526671112233', curp: 'ZALC920405MSLZRR09', num_escritura: 'ESC-2024-0288' },
  { email: 'propietario5@urbanflow.test',  nombre_completo: 'Ricardo Iván Salazar Mora',   telefono: '6674445566', whatsapp: '+526674445566', curp: 'SAMR870920HSLLRC01', num_escritura: 'ESC-2025-0104' },
  { email: 'propietario6@urbanflow.test',  nombre_completo: 'Gabriela Ochoa Verdugo',      telefono: '6678889900', whatsapp: '+526678889900', curp: 'OOVG950214MSLCRB05', num_escritura: 'ESC-2025-0119' },
  { email: 'propietario7@urbanflow.test',  nombre_completo: 'Héctor Manuel Angulo Cota',   telefono: '6673332211', whatsapp: '+526673332211', curp: 'AUCH830601HSLNTC08', num_escritura: 'ESC-2024-0355' },
  { email: 'propietario8@urbanflow.test',  nombre_completo: 'Diana Laura Payán Félix',     telefono: '6676667788', whatsapp: '+526676667788', curp: 'PAFD910830MSLYLN03', num_escritura: 'ESC-2025-0176' },
  { email: 'propietario9@urbanflow.test',  nombre_completo: 'Sergio Alonso Inzunza Ruiz',  telefono: '6672223344', whatsapp: '+526672223344', curp: 'IURS860117HSLNZR06', num_escritura: 'ESC-2024-0401' },
  { email: 'propietario10@urbanflow.test', nombre_completo: 'Alejandra Tirado Camacho',    telefono: '6675556677', whatsapp: '+526675556677', curp: 'TICA930523MSLRML02', num_escritura: 'ESC-2025-0210' },
]

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
      { nombre: 'Juan Pérez Domínguez', email: 'propietario@urbanflow.test', rol: 'propietario', fracId: fracId1 },
      { nombre: 'Carlos Técnico',   email: 'tecnico@urbanflow.test',     rol: 'tecnico',     fracId: fracId1 },
      { nombre: 'Admin Jardines',   email: 'admin2@urbanflow.test',      rol: 'admin',       fracId: fracId2 },
      { nombre: 'Vigilante Nocturno', email: 'vigilante2@urbanflow.test',  rol: 'vigilante',   fracId: fracId1 },
      { nombre: 'Sofía Técnica',      email: 'tecnico2@urbanflow.test',    rol: 'tecnico',     fracId: fracId1 },
      // Propietarios adicionales: el plan pide ~10 para la entrega final.
      ...PROPIETARIOS.slice(1).map(p => ({
        nombre: p.nombre_completo, email: p.email, rol: 'propietario', fracId: fracId1,
      })),
    ]

    const porEmail = {}
    for (const u of usuarios) {
      const row = await upsertUsuario(client, u, hash)
      porEmail[row.email] = row
      console.log(`  ✓ ${row.rol.padEnd(12)} ${row.email}`)
    }

    // ── Propietarios ─────────────────────────────────────────────────────────
    const propietarios = PROPIETARIOS.map(p => ({
      fracId: fracId1,
      usuarioId: porEmail[p.email].id,
      nombre_completo: p.nombre_completo,
      telefono: p.telefono,
      whatsapp: p.whatsapp,
      curp: p.curp,
      num_escritura: p.num_escritura,
    }))

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

    // ── Cuotas y pagos ───────────────────────────────────────────────────────
    // Los pagos se borran y regeneran; las cuotas mensuales sí tienen clave
    // natural (el índice parcial propietario+mes), así que van por upsert.
    await client.query(
      `DELETE FROM pagos pg USING cuotas c
       WHERE c.id = pg.cuota_id AND c.fraccionamiento_id = $1`,
      [fracId1]
    )
    await client.query(
      `DELETE FROM cuotas WHERE fraccionamiento_id = $1 AND tipo = 'extraordinaria'`,
      [fracId1]
    )

    const MONTO = parseFloat(process.env.MONTO_CUOTA_MENSUAL) || 1500
    let cuotasCreadas = 0
    let pagosCreados = 0
    let morosos = 0

    for (let p = 0; p < propsCreados.length; p++) {
      const propId = propsCreados[p].id

      // Seis meses hacia atrás, contando el actual.
      for (let m = 5; m >= 0; m--) {
        // Tres propietarios quedan morosos en los meses anteriores, para que el
        // reporte de morosidad tenga contenido realista.
        const esMesActual = m === 0
        const esMoroso = p < 3 && m <= p + 1 && m > 0
        const dejarPendiente = esMesActual || esMoroso

        const { rows: cuotaRows } = await client.query(
          `INSERT INTO cuotas (fraccionamiento_id, propietario_id, tipo, monto, mes_anio, estado)
           VALUES ($1, $2, 'mensual', $3,
                   (date_trunc('month', CURRENT_DATE) - ($4 || ' months')::interval)::date,
                   $5::estado_cuota)
           ON CONFLICT (propietario_id, mes_anio) WHERE tipo = 'mensual'
           DO UPDATE SET monto = EXCLUDED.monto, estado = EXCLUDED.estado
           RETURNING id`,
          [fracId1, propId, MONTO, m, dejarPendiente ? 'pendiente' : 'pagado']
        )
        cuotasCreadas++

        if (dejarPendiente) {
          if (esMoroso) morosos++
          continue
        }

        // Cada cuota pagada lleva su pago, alternando método.
        const metodos = ['efectivo', 'transferencia', 'online']
        const metodo = metodos[(p + m) % metodos.length]
        await client.query(
          `INSERT INTO pagos (cuota_id, monto_pagado, metodo, referencia_mp, fecha_pago)
           VALUES ($1, $2, $3::metodo_pago, $4,
                   date_trunc('month', CURRENT_DATE) - ($5 || ' months')::interval + interval '5 days')`,
          [
            cuotaRows[0].id, MONTO, metodo,
            metodo === 'online' ? `SEED-MP-${propId.slice(0, 8)}-${m}` : null,
            m,
          ]
        )
        pagosCreados++
      }
    }

    // Dos cuotas extraordinarias para todos, con concepto real.
    for (const prop of propsCreados) {
      await client.query(
        `INSERT INTO cuotas (fraccionamiento_id, propietario_id, tipo, monto, mes_anio, estado, concepto)
         VALUES ($1, $2, 'extraordinaria', 2500, date_trunc('month', CURRENT_DATE)::date, 'pendiente',
                 'Reparación del portón principal')`,
        [fracId1, prop.id]
      )
      cuotasCreadas++
    }

    console.log(`  ✓ cuotas       ${cuotasCreadas} (${pagosCreados} pagadas, ${morosos} moroso(s))`)

    // ── Tickets de mantenimiento ─────────────────────────────────────────────
    await client.query(
      'DELETE FROM solicitudes_mantenimiento WHERE fraccionamiento_id = $1',
      [fracId1]
    )

    const tecnicoId = porEmail['tecnico@urbanflow.test'].id
    const adminId = porEmail['admin@urbanflow.test'].id
    const solicitantes = propietarios.map(p => p.usuarioId)

    // Dos de cada estado. Los resueltos llevan resuelto_at, que la restricción
    // chk_ticket_resuelto exige que vaya siempre en pareja con el estado.
    const TICKETS = [
      { desc: 'La luminaria de la calle Palmas lleva tres noches apagada.', ubi: 'Calle Palmas, frente al A-04', estado: 'abierto',    tecnico: null,      dias: 2 },
      { desc: 'Fuga de agua en la banqueta cerca del acceso principal.',     ubi: 'Acceso principal',            estado: 'abierto',    tecnico: null,      dias: 1 },
      { desc: 'El portón automático tarda en cerrar y a veces se traba.',    ubi: 'Portón vehicular',            estado: 'en_proceso', tecnico: tecnicoId, dias: 6 },
      { desc: 'La bomba de la alberca hace un ruido fuerte al arrancar.',    ubi: 'Área de alberca',             estado: 'en_proceso', tecnico: tecnicoId, dias: 4 },
      { desc: 'Reposición de la malla ciclónica del área de juegos.',        ubi: 'Área de juegos',              estado: 'resuelto',   tecnico: tecnicoId, dias: 20 },
      { desc: 'Poda de los árboles del camellón central.',                   ubi: 'Camellón central',            estado: 'resuelto',   tecnico: tecnicoId, dias: 12 },
    ]

    for (let i = 0; i < TICKETS.length; i++) {
      const t = TICKETS[i]
      // Los reportes de área común los levanta el administrador; los demás,
      // los propietarios.
      const solicitante = i % 3 === 0 ? adminId : solicitantes[i % solicitantes.length]

      await client.query(
        `INSERT INTO solicitudes_mantenimiento
           (fraccionamiento_id, solicitante_id, tecnico_id, descripcion, ubicacion,
            estado, created_at, resuelto_at)
         VALUES ($1, $2, $3, $4, $5, $6::estado_ticket,
                 NOW() - ($7 || ' days')::interval,
                 CASE WHEN $6::estado_ticket = 'resuelto'
                      THEN NOW() - ($7 || ' days')::interval + interval '2 days'
                      ELSE NULL END)`,
        [fracId1, solicitante, t.tecnico, t.desc, t.ubi, t.estado, t.dias]
      )
    }

    console.log(`  ✓ tickets      ${TICKETS.length} de mantenimiento en los tres estados`)

    // ── Áreas comunes y reservaciones ────────────────────────────────────────
    const AREAS = [
      { nombre: 'Salón de eventos', capacidad: 80 },
      { nombre: 'Alberca', capacidad: 40 },
      { nombre: 'Cancha de pádel', capacidad: 8 },
      { nombre: 'Área de asadores', capacidad: 20 },
    ]

    const areasCreadas = {}
    for (const fracId of [fracId1, fracId2]) {
      for (const a of AREAS) {
        const { rows } = await client.query(
          `INSERT INTO areas_comunes (fraccionamiento_id, nombre, capacidad)
           VALUES ($1, $2, $3)
           ON CONFLICT (fraccionamiento_id, nombre) DO UPDATE SET capacidad = EXCLUDED.capacidad
           RETURNING id, nombre`,
          [fracId, a.nombre, a.capacidad]
        )
        if (fracId === fracId1) areasCreadas[a.nombre] = rows[0].id
      }
    }

    // Las reservaciones se borran y regeneran: no tienen clave natural y la
    // restricción EXCLUDE rechazaría un solapamiento al re-insertar.
    await client.query(
      `DELETE FROM reservaciones r USING areas_comunes a
       WHERE a.id = r.area_id AND a.fraccionamiento_id = $1`,
      [fracId1]
    )

    // Fechas relativas para que siempre haya reservas futuras en la demo.
    const RESERVAS = [
      { area: 'Salón de eventos',  dias: 3,  ini: '16:00', fin: '22:00', estado: 'confirmada', prop: 0 },
      { area: 'Alberca',           dias: 5,  ini: '10:00', fin: '14:00', estado: 'confirmada', prop: 1 },
      { area: 'Cancha de pádel',   dias: 1,  ini: '18:00', fin: '20:00', estado: 'pendiente',  prop: 2 },
      { area: 'Área de asadores',  dias: 7,  ini: '13:00', fin: '18:00', estado: 'pendiente',  prop: 0 },
      { area: 'Salón de eventos',  dias: -6, ini: '17:00', fin: '23:00', estado: 'cancelada',  prop: 1 },
    ]

    for (const r of RESERVAS) {
      await client.query(
        `INSERT INTO reservaciones (area_id, propietario_id, fecha, hora_inicio, hora_fin, estado)
         VALUES ($1, $2, (CURRENT_DATE + $3::int), $4::time, $5::time, $6::estado_reservacion)`,
        [areasCreadas[r.area], propsCreados[r.prop].id, r.dias, r.ini, r.fin, r.estado]
      )
    }

    console.log(`  ✓ áreas        ${AREAS.length} por fraccionamiento, ${RESERVAS.length} reservaciones`)

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
