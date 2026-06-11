const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../../shared/db/pool')

const login = async (email, password) => {
  // Buscar usuario por email
  const result = await pool.query(
    'SELECT id, email, password_hash, nombre, rol, fraccionamiento_id FROM usuarios WHERE email = $1',
    [email]
  )

  if (result.rows.length === 0) {
    throw new Error('Usuario o contraseña inválidos')
  }

  const user = result.rows[0]

  // Verificar contraseña
  const passwordMatch = await bcrypt.compare(password, user.password_hash)
  if (!passwordMatch) {
    throw new Error('Usuario o contraseña inválidos')
  }

  // Generar JWT
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      rol: user.rol,
      fraccionamiento_id: user.fraccionamiento_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  return {
    access_token: token,
    user: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
    },
  }
}

const getMe = async (userId) => {
  const result = await pool.query(
    'SELECT id, email, nombre, rol, fraccionamiento_id FROM usuarios WHERE id = $1',
    [userId]
  )

  if (result.rows.length === 0) {
    throw new Error('Usuario no encontrado')
  }

  return result.rows[0]
}

module.exports = {
  login,
  getMe,
}
