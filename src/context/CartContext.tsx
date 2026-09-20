import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Product, ProductVariant } from '../types/product'
import { formatPrice } from '../utils/format'

export type CartItem = {
  key: string
  product: Product
  quantity: number
  variant?: ProductVariant
}

export type CartSnackbarData = {
  id: number
  productName: string
  message: string
  subMessage: string
  type: 'below_min' | 'below_free' | 'free_unlocked'
  subtotal: number
}

type CartContextValue = {
  cartItems: CartItem[]
  addToCart: (product: Product, quantity?: number, variant?: ProductVariant) => void
  removeFromCart: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  clearCart: () => void
  getCartItemCount: () => number
  getCartSubtotal: () => number
  snackbar: CartSnackbarData | null
  dismissSnackbar: () => void
}

const CartContext = createContext<CartContextValue | null>(null)
const CART_KEY = 'raja-store-cart'

function readStoredCart(): CartItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]') as CartItem[]
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>(readStoredCart)
  const [snackbar, setSnackbar] = useState<CartSnackbarData | null>(null)
  const dismissTimerRef = useRef<number | null>(null)

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cartItems)) }, [cartItems])

  function dismissSnackbar() {
    if (dismissTimerRef.current) {
      window.clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    setSnackbar(null)
  }

  function addToCart(product: Product, quantity = 1, variant?: ProductVariant) {
    if (product.stock === 0 || quantity <= 0) return
    const key = `${product.id}:${variant?.id ?? 'default'}`
    const availableStock = variant?.stock ?? product.stock
    const unitPrice = variant?.price ?? product.price

    setCartItems((items) => {
      const existing = items.find((item) => item.key === key)
      let nextItems: CartItem[]
      let actualAdded = quantity

      if (existing) {
        const cappedQty = Math.min(availableStock, existing.quantity + quantity)
        actualAdded = cappedQty - existing.quantity
        nextItems = items.map((item) => item.key === key ? { ...item, quantity: cappedQty } : item)
      } else {
        actualAdded = Math.min(availableStock, quantity)
        nextItems = [...items, { key, product, quantity: actualAdded, variant }]
      }

      // Calculate new subtotal dynamically for contextual feedback
      const newSubtotal = nextItems.reduce((sum, it) => sum + (it.variant?.price ?? it.product.price) * it.quantity, 0)
      
      let message = ''
      let type: CartSnackbarData['type'] = 'below_min'

      if (newSubtotal < 200) {
        message = `Add ${formatPrice(200 - newSubtotal)} more to place your order`
        type = 'below_min'
      } else {
        message = 'FREE delivery unlocked'
        type = 'free_unlocked'
      }

      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current)
      }

      setSnackbar({
        id: Date.now(),
        productName: product.name,
        message,
        subMessage: `${product.name} added to bag`,
        type,
        subtotal: newSubtotal,
      })

      dismissTimerRef.current = window.setTimeout(() => {
        setSnackbar(null)
        dismissTimerRef.current = null
      }, 3500)

      return nextItems
    })
  }

  function updateQuantity(key: string, quantity: number) {
    setCartItems((items) => items.map((item) => {
      if (item.key !== key) return item
      const availableStock = item.variant?.stock ?? item.product.stock
      return { ...item, quantity: Math.max(1, Math.min(availableStock, Math.floor(quantity))) }
    }))
  }

  const value = useMemo<CartContextValue>(() => ({
    cartItems,
    addToCart,
    removeFromCart: (key) => setCartItems((items) => items.filter((item) => item.key !== key)),
    updateQuantity,
    clearCart: () => setCartItems([]),
    getCartItemCount: () => cartItems.reduce((total, item) => total + item.quantity, 0),
    getCartSubtotal: () => cartItems.reduce((total, item) => total + (item.variant?.price ?? item.product.price) * item.quantity, 0),
    snackbar,
    dismissSnackbar,
  }), [cartItems, snackbar])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
