import { Navigate } from 'react-router-dom';

/** Legacy route — keep one CustomerDashboard mount to avoid bookings/tracker state reset. */
export default function Services() {
  return <Navigate to="/customer/dashboard?section=services" replace />;
}
