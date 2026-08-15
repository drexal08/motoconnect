/**
 * Ops-console entry point (admin spec §2.4).
 *
 * A separate Vite entry from the consumer app so this bundle can be deployed to
 * its own host — ops.motoconnect.rw — rather than hanging off a guessable path
 * on the public domain. Nothing in the consumer app imports from src/admin, and
 * no public page links here.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from './AdminApp';
// Leaflet first, so the console's own styles in admin.css override it.
import 'leaflet/dist/leaflet.css';
import './admin.css';

const container = document.getElementById('admin-root');
if (!container) throw new Error('admin-root element is missing from admin.html');

createRoot(container).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>
);
