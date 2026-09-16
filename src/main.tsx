import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CartProvider } from './context/CartContext'
import './index.css'
import './phase3-ux.css'
import './checkout.css'
import './phase4-payment.css'
import './dev-database.css'
import './admin.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CartProvider><App /></CartProvider>
  </StrictMode>,
)
