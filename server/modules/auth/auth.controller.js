const service = require('./auth.service')

const login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' })
    }

    const result = await service.login(email, password)
    res.json(result)
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
}

const me = async (req, res) => {
  try {
    const user = await service.getMe(req.user.id)
    res.json(user)
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
}

module.exports = {
  login,
  me,
}
