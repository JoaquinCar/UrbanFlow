const jwt = require('jsonwebtoken')
const service = require('./auth.service')

// La marca Secure depende de si la conexión es realmente cifrada, no de
// NODE_ENV.
//
// Antes iba atada a NODE_ENV=production, y eso rompía el despliegue mientras no
// hubiera HTTPS: el navegador descarta las cookies Secure recibidas por HTTP,
// así que la sesión no sobrevivía a un cambio de página. Con req.secure —que
// Express resuelve leyendo X-Forwarded-Proto gracias a trust proxy— la cookie
// se marca Secure en cuanto haya HTTPS, sin tener que tocar nada.
function cookieRefresh(req) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días en ms
    path: '/api/auth',
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' })
    }
    const result = await service.login(email, password)
    res.cookie('refreshToken', result.refreshToken, cookieRefresh(req))
    res.json({ accessToken: result.accessToken, user: result.user })
  } catch (err) {
    next(err)
  }
}

async function refresh(req, res, next) {
  try {
    const token = req.cookies?.refreshToken
    if (!token) return res.status(401).json({ error: 'No autorizado' })
    const result = await service.refresh(token)
    res.cookie('refreshToken', result.refreshToken, cookieRefresh(req))
    res.json({ accessToken: result.accessToken })
  } catch (err) {
    next(err)
  }
}

// Logout works even with expired access token — uses refresh cookie to identify user
async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET)
        await service.logout(payload.sub)
      } catch {
        // Token invalid — still clear cookie
      }
    }
    res.clearCookie('refreshToken', { path: '/api/auth' })
    res.json({ message: 'Sesión cerrada' })
  } catch (err) {
    next(err)
  }
}

async function me(req, res, next) {
  try {
    const user = await service.me(req.user.sub)
    res.json(user)
  } catch (err) {
    next(err)
  }
}

async function cambiarPassword(req, res, next) {
  try {
    const { passwordActual, passwordNueva } = req.body
    if (!passwordActual || !passwordNueva) {
      return res.status(400).json({ error: 'Contraseña actual y nueva requeridas' })
    }
    if (passwordNueva.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' })
    }
    await service.cambiarPassword(req.user.sub, passwordActual, passwordNueva)
    // El refresh token quedó invalidado: la cookie vieja ya no sirve.
    res.clearCookie('refreshToken', { path: '/api/auth' })
    res.json({ message: 'Contraseña actualizada. Inicia sesión de nuevo.' })
  } catch (err) {
    next(err)
  }
}

module.exports = { login, refresh, logout, me, cambiarPassword }
