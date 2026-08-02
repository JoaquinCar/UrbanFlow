const swaggerJsdoc = require('swagger-jsdoc')

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'UrbanFlow API',
      version: '1.0.0',
      description: 'API REST del sistema de administración de fraccionamientos UrbanFlow. Incluye gestión de propietarios, visitas, pagos, mantenimiento, reservaciones, comunicados y configuración del fraccionamiento.',
      contact: { name: 'UrbanFlow Team' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Desarrollo local' },
      { url: 'https://interdistrict-mica-maniacally.ngrok-free.dev', description: 'ngrok (desarrollo)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token. Se obtiene en POST /api/auth/login y se envía como `Authorization: Bearer <token>`.',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string', example: 'Mensaje de error' } },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nombre: { type: 'string' },
            email: { type: 'string', format: 'email' },
            rol: { type: 'string', enum: ['admin', 'propietario', 'vigilante', 'tecnico'] },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
          },
        },
        Owner: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            usuario_id: { type: 'string', format: 'uuid' },
            nombre_completo: { type: 'string' },
            telefono: { type: 'string', nullable: true },
            whatsapp: { type: 'string', nullable: true },
            curp: { type: 'string', nullable: true },
            num_escritura: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            email: { type: 'string', format: 'email' },
            activo: { type: 'boolean' },
            lotes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  numero: { type: 'string' },
                  estado: { type: 'string' },
                },
              },
            },
          },
        },
        Visit: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            lote_destino_id: { type: 'string', format: 'uuid' },
            nombre_visitante: { type: 'string' },
            placa_vehiculo: { type: 'string', nullable: true },
            tipo: { type: 'string', enum: ['visita', 'delivery', 'servicio', 'residente'], nullable: true },
            entrada_at: { type: 'string', format: 'date-time' },
            salida_at: { type: 'string', format: 'date-time', nullable: true },
            registrado_por: { type: 'string', format: 'uuid' },
            notas: { type: 'string', nullable: true },
            lote_numero: { type: 'string' },
            registrado_por_nombre: { type: 'string' },
          },
        },
        Cuota: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            propietario_id: { type: 'string', format: 'uuid' },
            tipo: { type: 'string' },
            monto: { type: 'number' },
            mes_anio: { type: 'string', example: '2026-07' },
            estado: { type: 'string' },
            concepto: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            estado_actual: { type: 'string', enum: ['pendiente', 'pagado', 'vencido'] },
            pago_id: { type: 'string', format: 'uuid', nullable: true },
            fecha_pago: { type: 'string', format: 'date-time', nullable: true },
            metodo: { type: 'string', nullable: true },
          },
        },
        Pago: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            cuota_id: { type: 'string', format: 'uuid' },
            monto_pagado: { type: 'number' },
            metodo: { type: 'string' },
            referencia_mp: { type: 'string', nullable: true },
            fecha_pago: { type: 'string', format: 'date-time' },
          },
        },
        Ticket: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            solicitante_id: { type: 'string', format: 'uuid' },
            tecnico_id: { type: 'string', format: 'uuid', nullable: true },
            descripcion: { type: 'string' },
            ubicacion: { type: 'string', nullable: true },
            estado: { type: 'string', enum: ['abierto', 'en_proceso', 'resuelto'] },
            created_at: { type: 'string', format: 'date-time' },
            resuelto_at: { type: 'string', format: 'date-time', nullable: true },
            solicitante_nombre: { type: 'string' },
            solicitante_rol: { type: 'string' },
            tecnico_nombre: { type: 'string', nullable: true },
          },
        },
        Comunicado: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            autor_id: { type: 'string', format: 'uuid' },
            titulo: { type: 'string' },
            cuerpo: { type: 'string' },
            canales: {
              type: 'object',
              properties: {
                email: { type: 'boolean' },
                whatsapp: { type: 'boolean' },
              },
            },
            resultado_envio: { type: 'object', nullable: true },
            enviado_at: { type: 'string', format: 'date-time' },
            autor_nombre: { type: 'string' },
          },
        },
        Area: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            nombre: { type: 'string' },
            capacidad: { type: 'integer', nullable: true },
            activa: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Reservacion: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            area_id: { type: 'string', format: 'uuid' },
            propietario_id: { type: 'string', format: 'uuid' },
            fecha: { type: 'string', example: '2026-07-15' },
            hora_inicio: { type: 'string', example: '10:00' },
            hora_fin: { type: 'string', example: '12:00' },
            estado: { type: 'string', enum: ['pendiente', 'confirmada', 'cancelada'] },
            created_at: { type: 'string', format: 'date-time' },
            area_nombre: { type: 'string' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            propietario_nombre: { type: 'string' },
          },
        },
        Lote: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            fraccionamiento_id: { type: 'string', format: 'uuid' },
            numero: { type: 'string' },
            superficie_m2: { type: 'number', nullable: true },
            precio: { type: 'number', nullable: true },
            etapa: { type: 'string', nullable: true },
            estado: { type: 'string', enum: ['disponible', 'proceso', 'vendido'] },
            svg_path_id: { type: 'string', nullable: true },
            propietario_id: { type: 'string', format: 'uuid', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            propietario_nombre: { type: 'string', nullable: true },
          },
        },
        Fraccionamiento: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            nombre: { type: 'string' },
            direccion: { type: 'string' },
            config_mapa: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./modules/**/*.routes.js'],
}

const swaggerSpec = swaggerJsdoc(options)

module.exports = swaggerSpec
