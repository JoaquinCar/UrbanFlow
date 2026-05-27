import { Routes, Route } from 'react-router-dom';
import Onboarding from '../screens/Onboarding';
import CreateAccount from '../screens/CreateAccount';
import Login from '../screens/Login';
import NewAccount from '../screens/NewAccount';
import LostPassword from '../screens/LostPassword';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="/CreateAccount" element={<CreateAccount />} />
      <Route path="/Login" element={<Login />} />
      <Route path="/NewAccount" element={<NewAccount />} />
      <Route path="/LostPassword" element={<LostPassword />} />
    </Routes>
  );
}
export default AppRoutes;