import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Pages — to be implemented
// import LoginPage from './pages/auth/LoginPage'
// import AdminDashboard from './pages/admin/Dashboard'
// import CasetaPage from './pages/caseta/CasetaPage'
// import PropietarioPortal from './pages/propietario/Portal'
// import TecnicoPage from './pages/tecnico/TecnicoPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        {/* Auth */}
        <Route path="/login" element={<div className="p-8 text-center text-gray-500">Login — pendiente</div>} />
        {/* Admin */}
        <Route path="/admin/*" element={<div className="p-8 text-center text-gray-500">Admin — pendiente</div>} />
        {/* Caseta */}
        <Route path="/caseta/*" element={<div className="p-8 text-center text-gray-500">Caseta — pendiente</div>} />
        {/* Propietario */}
        <Route path="/propietario/*" element={<div className="p-8 text-center text-gray-500">Portal Propietario — pendiente</div>} />
        {/* Técnico */}
        <Route path="/tecnico/*" element={<div className="p-8 text-center text-gray-500">Técnico — pendiente</div>} />
        {/* 404 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
