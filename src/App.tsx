import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardList,
  Copy,
  CreditCard,
  MapPin,
  Menu,
  Moon,
  Package,
  QrCode,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Truck,
  X,
} from 'lucide-react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getProductCategories, getProducts } from './services/productService'
import { useCart } from './context/CartContext'
import type { Category, Product, ProductVariant } from './types/product'
import { formatPrice, getDiscountPercent } from './utils/format'
import { createOrder, trackOrder, type TrackedOrder } from './services/orderService'
import { appendMyOrder, getMyOrders } from './services/myOrdersService'
import DevDatabasePage from './DevDatabasePage'
import AdminPage from './AdminPage'
import { API_BASE_URL } from './config'

type SortOption = 'featured' | 'price-low' | 'price-high' | 'newest' | 'name'

/* ==========================================================================
   THEME HOOK & STATE
   ========================================================================== */
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('raja-store-theme')
      if (saved === 'dark' || saved === 'light') return saved
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      localStorage.setItem('raja-store-theme', theme)
    } catch {
      /* ignore storage errors */
    }
  }, [theme])

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  return { theme, toggleTheme }
}

/* ==========================================================================
   CATALOG DATA HOOK
   ========================================================================== */
function useCatalog() {
  const [products, setProducts] = useState<Product[]>([])
  useEffect(() => {
    const refresh = () => {
      void getProducts().then(setProducts)
    }
    refresh()
    window.addEventListener('raja-store-products-invalidated', refresh)
    return () => window.removeEventListener('raja-store-products-invalidated', refresh)
  }, [])
  return products
}

/* ==========================================================================
   STICKY HEADER & MOBILE NAVIGATION DRAWER
   ========================================================================== */
function SiteHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { getCartItemCount } = useCart()
  const { theme, toggleTheme } = useTheme()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchVal, setSearchVal] = useState('')
  const count = getCartItemCount()

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Prevent background scrolling when mobile drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    const trimmed = searchVal.trim()
    navigate(trimmed ? `/products?search=${encodeURIComponent(trimmed)}` : '/products')
  }

  return (
    <>
      <div className="site-header-wrapper">
        <header className="site-header">
          <div className="header-left">
            <button
              className="icon-btn mobile-menu-btn"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} />
            </button>
            <Link className="brand" to="/" aria-label="Raja Store Home">
              <span className="brand-mark">R</span>
              <span className="brand-text">
                raja<span className="brand-dot">.</span>store
              </span>
            </Link>
            <nav className="desktop-nav" aria-label="Primary navigation">
              <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
                Home
              </Link>
              <Link to="/products" className={location.pathname === '/products' ? 'active' : ''}>
                Shop
              </Link>
              <Link to="/track-order" className={location.pathname === '/track-order' ? 'active' : ''}>
                Track Order
              </Link>
              <MyOrdersNavLink />
            </nav>
          </div>

          <div className="header-actions">
            <form className="header-search-form" onSubmit={handleSearch}>
              <Search size={15} className="header-search-icon" />
              <input
                className="header-search-input"
                placeholder="Search products..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                aria-label="Search collection"
              />
            </form>

            <button
              className="icon-btn theme-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <button
              className="icon-btn bag-btn"
              aria-label={`Shopping bag with ${count} items`}
              onClick={() => navigate('/cart')}
            >
              <ShoppingBag size={19} />
              {count > 0 && <span className="bag-count">{count}</span>}
            </button>
          </div>
        </header>
      </div>

      {/* Mobile Navigation Drawer */}
      <div
        className={`drawer-backdrop ${drawerOpen ? 'is-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`mobile-drawer ${drawerOpen ? 'is-open' : ''}`}
        aria-label="Mobile Navigation"
        aria-hidden={!drawerOpen}
      >
        <div className="drawer-header">
          <Link className="brand" to="/" onClick={() => setDrawerOpen(false)}>
            <span className="brand-mark">R</span>
            <span className="brand-text">
              raja<span className="brand-dot">.</span>store
            </span>
          </Link>
          <button
            className="icon-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="drawer-nav">
          <Link
            to="/"
            className={`drawer-link ${location.pathname === '/' ? 'active' : ''}`}
            onClick={() => setDrawerOpen(false)}
          >
            <Sparkles size={18} />
            <span>Home</span>
          </Link>
          <Link
            to="/products"
            className={`drawer-link ${location.pathname === '/products' ? 'active' : ''}`}
            onClick={() => setDrawerOpen(false)}
          >
            <ShoppingBag size={18} />
            <span>Shop All Products</span>
          </Link>
          <Link
            to="/track-order"
            className={`drawer-link ${location.pathname === '/track-order' ? 'active' : ''}`}
            onClick={() => setDrawerOpen(false)}
          >
            <Truck size={18} />
            <span>Track My Order</span>
          </Link>
          <Link
            to="/my-orders"
            className={`drawer-link ${location.pathname === '/my-orders' ? 'active' : ''}`}
            onClick={() => setDrawerOpen(false)}
          >
            <Package size={18} />
            <span>My Orders</span>
          </Link>
        </nav>

        <div className="drawer-footer">
          <div className="drawer-theme-toggle">
            <span>Dark Theme</span>
            <button
              className="icon-btn"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            © 2026 Raja Store • Handcrafted in India
          </div>
        </div>
      </aside>
    </>
  )
}

/* ==========================================================================
   MY ORDERS NAV LINK (desktop) — shows count badge when orders exist
   ========================================================================== */
function MyOrdersNavLink() {
  const location = useLocation()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const refresh = () => setCount(getMyOrders().length)
    refresh()
    // Re-read when storage changes (e.g. after order success)
    window.addEventListener('storage', refresh)
    window.addEventListener('raja-my-orders-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('raja-my-orders-updated', refresh)
    }
  }, [])

  return (
    <Link to="/my-orders" className={location.pathname === '/my-orders' ? 'active' : ''} style={{ display: 'inline-flex', alignItems: 'center' }}>
      My Orders
      {count > 0 && <span className="my-orders-nav-badge" aria-label={`${count} saved orders`}>{count}</span>}
    </Link>
  )
}

/* ==========================================================================
   FOOTER (COMPACT & RESTRAINED)
   ========================================================================== */
function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-col footer-col-brand">
          <Link className="brand" to="/" aria-label="Raja Store Home">
            <span className="brand-mark">R</span>
            <span className="brand-text">
              raja<span className="brand-dot">.</span>store
            </span>
          </Link>
          <p className="footer-tagline">Made with care in India</p>
        </div>

        <div className="footer-col footer-col-nav">
          <h4 className="footer-col-title">Explore</h4>
          <ul className="footer-links">
            <li><Link to="/products">Shop</Link></li>
            <li><Link to="/track-order">Track Order</Link></li>
            <li><Link to="/products?category=kitchen">Kitchen</Link></li>
            <li><Link to="/products?category=home">Home</Link></li>
          </ul>
        </div>

        <div className="footer-col footer-col-delivery">
          <h4 className="footer-col-title">Visit &amp; Delivery</h4>
          <div className="footer-local-info">
            <div className="footer-city-tag">
              <MapPin size={13} />
              <span>Chennai Local Dispatch</span>
            </div>
            <p className="footer-delivery-text">
              Fast delivery around Chennai — eligible local orders may arrive within 1–12 hours after order confirmation.
            </p>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 Raja Store</span>
        <span>Made with intention in India • All prices inclusive of taxes</span>
      </div>
    </footer>
  )
}

/* ==========================================================================
   CART ADD MORE / PROGRESS SNACKBAR (NON-INTRUSIVE, INDIAN E-COMMERCE STYLE)
   ========================================================================== */
function CartSnackbar() {
  const { snackbar, dismissSnackbar } = useCart()
  const navigate = useNavigate()

  if (!snackbar) return null

  return (
    <div className="cart-snackbar-container" role="status" aria-live="polite">
      <div className="cart-snackbar">
        <div className="cart-snackbar-content">
          <div className={`cart-snackbar-icon ${snackbar.type === 'free_unlocked' ? 'unlocked' : ''}`}>
            {snackbar.type === 'free_unlocked' ? <Check size={16} /> : <Truck size={15} />}
          </div>
          <div className="cart-snackbar-text">
            <span className="cart-snackbar-title">{snackbar.message}</span>
            <span className="cart-snackbar-sub">{snackbar.subMessage}</span>
          </div>
        </div>
        <div className="cart-snackbar-actions">
          <button
            className="cart-snackbar-view-btn"
            onClick={() => {
              dismissSnackbar()
              navigate('/cart')
            }}
          >
            View Bag
          </button>
          <button
            className="cart-snackbar-close-btn"
            onClick={dismissSnackbar}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   LAYOUT WRAPPER
   ========================================================================== */
function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
      <CartSnackbar />
    </div>
  )
}

/* ==========================================================================
   PRODUCT CARD (NO HEART / LIKE BUTTON)
   ========================================================================== */
function ProductCard({
  product,
  onAdd,
  onOpen,
}: {
  product: Product
  onAdd: (product: Product) => void
  onOpen: (slug: string) => void
}) {
  const discount = getDiscountPercent(product.price, product.compareAtPrice)
  const isOutOfStock = product.stock === 0
  const isLowStock = product.stock > 0 && product.stock <= 5

  return (
    <article className="product-card">
      <div className="card-media-wrap" onClick={() => onOpen(product.slug)}>
        <img
          src={product.images[0]}
          alt={product.name}
          loading="lazy"
        />

        <div className="badge-stack">
          {product.isBestSeller && <span className="badge-tag bestseller">Bestseller</span>}
          {product.isNew && <span className="badge-tag new">New</span>}
          {discount > 0 && <span className="badge-tag discount">{discount}% OFF</span>}
        </div>

        {isOutOfStock ? (
          <span className="stock-warning-pill out">Out of Stock</span>
        ) : isLowStock ? (
          <span className="stock-warning-pill">Only {product.stock} Left</span>
        ) : null}
      </div>

      <div className="card-body">
        <span className="card-category">{product.category.name}</span>

        <button
          className="card-title"
          onClick={() => onOpen(product.slug)}
          title={product.name}
        >
          {product.name}
        </button>

        <div className="card-rating-row">
          <span className="rating-pill">
            <Star size={11} /> {product.rating}
          </span>
        </div>

        <div className="price-row">
          <span className="current-price">{formatPrice(product.price)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.price && (
            <span className="original-price">{formatPrice(product.compareAtPrice)}</span>
          )}
          {discount > 0 && <span className="discount-text">({discount}% off)</span>}
        </div>

        <button
          className="card-add-btn"
          disabled={isOutOfStock}
          onClick={() => onAdd(product)}
          aria-label={isOutOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
        >
          <ShoppingBag size={14} />
          {isOutOfStock ? 'Out of stock' : 'Add to bag'}
        </button>
      </div>
    </article>
  )
}

/* ==========================================================================
   HOMEPAGE (COMPACT HERO, CATEGORIES & ROWS)
   ========================================================================== */
function HomePage() {
  const products = useCatalog()
  const { addToCart } = useCart()
  const navigate = useNavigate()

  function handleAdd(product: Product) {
    addToCart(product)
  }

  const categories = useMemo(() => getProductCategories(products), [products])

  const bestSellers = useMemo(
    () => products.filter((p) => p.isBestSeller),
    [products]
  )
  const newArrivals = useMemo(
    () => products.filter((p) => p.isNew),
    [products]
  )

  // Specific category groups based on existing data
  const kitchenProducts = useMemo(
    () => products.filter((p) => p.category.slug === 'kitchen'),
    [products]
  )
  const homeProducts = useMemo(
    () => products.filter((p) => p.category.slug === 'home'),
    [products]
  )
  const everydayProducts = useMemo(
    () => products.filter((p) => p.category.slug === 'everyday'),
    [products]
  )

  return (
    <Layout>
      <div className="home-container">
        {/* Compact Modern Hero Banner */}
        <section className="home-hero-banner" aria-label="Hero promotion">
          <div className="hero-banner-content">
            <div className="hero-pill">
              <Sparkles size={12} /> Indian Craft Heritage
            </div>
            <h1>
              Authentic Goods,<br />
              <em>chosen well.</em>
            </h1>
            <p className="hero-banner-desc">
              Small-batch handcrafted essentials for peaceful mornings, shared meals, and everyday rituals.
            </p>
            <button className="hero-cta-btn" onClick={() => navigate('/products')}>
              Shop the Collection <ArrowRight size={16} />
            </button>
          </div>
          <div className="hero-banner-media">
            <img
              src="https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=900&q=85"
              alt="Warm Indian interior with handcrafted living essentials"
            />
          </div>
        </section>

        {/* Category Quick Access Chips */}
        <section className="category-quick-bar" aria-label="Browse by category">
          <div className="quick-bar-heading">
            <h3>Explore by Category</h3>
            <Link to="/products" className="view-all-link">
              View All <ChevronRight size={15} />
            </Link>
          </div>
          <div className="category-chips-row">
            <button
              className="category-chip"
              onClick={() => navigate('/products')}
            >
              All Items ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.slug}
                className="category-chip"
                onClick={() => navigate(`/products?category=${cat.slug}`)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </section>

        {/* Section 1: Best Sellers Row */}
        {bestSellers.length > 0 && (
          <section className="product-showcase-section" aria-label="Best Sellers">
            <div className="showcase-header">
              <div className="showcase-title-area">
                <h2 className="showcase-title">
                  <Star size={20} fill="#d97706" color="#d97706" /> Best Sellers
                </h2>
                <p className="showcase-subtitle">Our most popular handcrafted pieces loved across India</p>
              </div>
              <Link to="/products?sort=featured" className="view-all-link">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            <div className="product-row-carousel">
              {bestSellers.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={handleAdd}
                  onOpen={(slug) => navigate(`/product/${slug}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 2: New Arrivals Row */}
        {newArrivals.length > 0 && (
          <section className="product-showcase-section" aria-label="New Arrivals">
            <div className="showcase-header">
              <div className="showcase-title-area">
                <h2 className="showcase-title">
                  <Sparkles size={20} color="var(--color-primary)" /> New Arrivals
                </h2>
                <p className="showcase-subtitle">Fresh additions to our curated everyday collection</p>
              </div>
              <Link to="/products?sort=newest" className="view-all-link">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            <div className="product-row-carousel">
              {newArrivals.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={handleAdd}
                  onOpen={(slug) => navigate(`/product/${slug}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 3: Kitchen Collection */}
        {kitchenProducts.length > 0 && (
          <section className="product-showcase-section" aria-label="Kitchen Essentials">
            <div className="showcase-header">
              <div className="showcase-title-area">
                <h2 className="showcase-title">Kitchen Essentials</h2>
                <p className="showcase-subtitle">Traditional brass, storage, and enduring tableware</p>
              </div>
              <Link to="/products?category=kitchen" className="view-all-link">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            <div className="product-row-carousel">
              {kitchenProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={handleAdd}
                  onOpen={(slug) => navigate(`/product/${slug}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 4: Home & Decor */}
        {homeProducts.length > 0 && (
          <section className="product-showcase-section" aria-label="Handcrafted Home">
            <div className="showcase-header">
              <div className="showcase-title-area">
                <h2 className="showcase-title">Handcrafted for Home</h2>
                <p className="showcase-subtitle">Textiles, ceramics, and warm accents for living spaces</p>
              </div>
              <Link to="/products?category=home" className="view-all-link">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            <div className="product-row-carousel">
              {homeProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={handleAdd}
                  onOpen={(slug) => navigate(`/product/${slug}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Everyday Living */}
        {everydayProducts.length > 0 && (
          <section className="product-showcase-section" aria-label="Everyday Living">
            <div className="showcase-header">
              <div className="showcase-title-area">
                <h2 className="showcase-title">Everyday Living</h2>
                <p className="showcase-subtitle">Natural fibers and thoughtful carries for daily journeys</p>
              </div>
              <Link to="/products?category=everyday" className="view-all-link">
                View All <ChevronRight size={16} />
              </Link>
            </div>
            <div className="product-row-carousel">
              {everydayProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={handleAdd}
                  onOpen={(slug) => navigate(`/product/${slug}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Trust Value Strip */}
        <section className="home-value-strip" aria-label="Why shop with us">
          <div className="home-value-item">
            <div className="value-item-icon">
              <ShieldCheck size={22} />
            </div>
            <div className="value-item-text">
              <h4>100% Authentic</h4>
              <p>Hand-finished by Indian artisans</p>
            </div>
          </div>

          <div className="home-value-item">
            <div className="value-item-icon">
              <Truck size={22} />
            </div>
            <div className="value-item-text">
              <h4>Safe Delivery</h4>
              <p>Carefully packed & tracked parcel</p>
            </div>
          </div>

          <div className="home-value-item">
            <div className="value-item-icon">
              <CreditCard size={22} />
            </div>
            <div className="value-item-text">
              <h4>COD & UPI Available</h4>
              <p>Flexible and safe payment options</p>
            </div>
          </div>

          <div className="home-value-item">
            <div className="value-item-icon">
              <RotateCcw size={22} />
            </div>
            <div className="value-item-text">
              <h4>Easy 7-Day Support</h4>
              <p>Simple returns & customer care</p>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  )
}

/* ==========================================================================
   SHOP / CATALOG PAGE (NO LARGE HERO BANNER)
   ========================================================================== */
function ProductsPage() {
  const products = useCatalog()
  const { addToCart } = useCart()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeCategory = searchParams.get('category') ?? 'all'
  const searchQuery = searchParams.get('search') ?? ''
  const [sort, setSort] = useState<SortOption>('featured')

  const categories = useMemo(() => getProductCategories(products), [products])

  const visibleProducts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    const filtered = products.filter((product) => {
      const matchCat = activeCategory === 'all' || product.category.slug === activeCategory
      const matchSearch =
        !query ||
        [product.name, product.category.name, product.description, product.sku].some((v) =>
          v.toLowerCase().includes(query)
        )
      return matchCat && matchSearch
    })

    return filtered.sort((a, b) => {
      if (sort === 'price-low') return a.price - b.price
      if (sort === 'price-high') return b.price - a.price
      if (sort === 'newest') return Number(Boolean(b.isNew)) - Number(Boolean(a.isNew))
      if (sort === 'name') return a.name.localeCompare(b.name)
      return Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller))
    })
  }, [activeCategory, products, searchQuery, sort])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [searchQuery, activeCategory])

  function handleAdd(product: Product) {
    addToCart(product)
  }

  function chooseCategory(catSlug: string) {
    const next = new URLSearchParams(searchParams)
    if (catSlug === 'all') next.delete('category')
    else next.set('category', catSlug)
    setSearchParams(next)
  }

  return (
    <Layout>
      <div className="shop-page-wrapper">
        <div className="catalog-header-bar">
          <div className="catalog-title-line">
            <div>
              <h1>{searchQuery ? `Results for “${searchQuery}”` : 'Shop Collection'}</h1>
              <span className="catalog-item-count">
                Showing {visibleProducts.length} handcrafted items
              </span>
            </div>

            <div className="sort-select-wrap">
              <label htmlFor="sort-select">Sort by:</label>
              <select
                id="sort-select"
                className="sort-select"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="newest">Newest First</option>
                <option value="name">Name: A to Z</option>
              </select>
            </div>
          </div>

          <div className="catalog-controls-row">
            <div className="category-filter-tabs" role="tablist">
              <button
                className={`filter-tab ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => chooseCategory('all')}
              >
                All Items
              </button>
              {categories.map((category) => (
                <button
                  key={category.slug}
                  className={`filter-tab ${activeCategory === category.slug ? 'active' : ''}`}
                  onClick={() => chooseCategory(category.slug)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="state-box">
            <h3>Loading Collection...</h3>
            <p>Fetching the handcrafted edit from Raja Store.</p>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="state-box">
            <h3>No products found</h3>
            <p>We couldn't find anything matching your filters or search.</p>
            <button
              className="hero-cta-btn"
              onClick={() => setSearchParams({})}
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="catalog-product-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAdd={handleAdd}
                onOpen={(slug) => navigate(`/product/${slug}`)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}

/* ==========================================================================
   PRODUCT DETAIL PAGE (NO HEART BUTTON)
   ========================================================================== */
function ProductPage() {
  const { slug } = useParams()
  const products = useCatalog()
  const product = products.find((item) => item.slug === slug)
  const { addToCart } = useCart()
  const navigate = useNavigate()

  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [selectedVariant, setSelectedVariant] = useState(product?.variants[0]?.id ?? '')

  useEffect(() => {
    window.scrollTo(0, 0)
    setSelectedImage(0)
    setQuantity(1)
    if (product?.variants[0]?.id) {
      setSelectedVariant(product.variants[0].id)
    }
  }, [slug, product])

  const relatedProducts = useMemo(() => {
    if (!product) return []
    const sameCategory = products.filter(
      (p) => p.id !== product.id && p.category.slug === product.category.slug
    )
    const otherProducts = products.filter(
      (p) => p.id !== product.id && p.category.slug !== product.category.slug
    )
    return [...sameCategory, ...otherProducts].slice(0, 6)
  }, [product, products])

  if (products.length > 0 && !product) {
    return (
      <Layout>
        <div className="detail-container">
          <div className="state-box">
            <h3>Product not found</h3>
            <p>The piece you are looking for might have moved or is unavailable.</p>
            <button className="hero-cta-btn" onClick={() => navigate('/products')}>
              Back to Collection
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  if (!product) {
    return (
      <Layout>
        <div className="detail-container">
          <div className="state-box">
            <h3>Loading details...</h3>
          </div>
        </div>
      </Layout>
    )
  }

  const selectedVariantData = product.variants.find((v) => v.id === selectedVariant)
  const availableStock = selectedVariantData?.stock ?? product.stock
  const discount = getDiscountPercent(product.price, product.compareAtPrice)

  function handleAdd() {
    if (!product) return
    addToCart(product, quantity, selectedVariantData)
  }

  return (
    <Layout>
      <div className="detail-container">
        <Link to="/products" className="breadcrumb-back">
          <ArrowLeft size={16} /> Back to Collection
        </Link>

        <div className="detail-grid">
          {/* Gallery Column */}
          <div className="detail-gallery-col">
            <div className="detail-main-img-wrap">
              <img
                src={product.images[selectedImage] ?? product.images[0]}
                alt={product.name}
              />
            </div>
            {product.images.length > 1 && (
              <div className="thumbnails-strip">
                {product.images.map((img, idx) => (
                  <button
                    key={img}
                    className={`thumb-btn ${selectedImage === idx ? 'active' : ''}`}
                    onClick={() => setSelectedImage(idx)}
                  >
                    <img src={img} alt={`View ${idx + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="detail-info-col">
            <div className="detail-cat-sku">
              {product.category.name} • SKU: {product.sku}
            </div>

            <h1 className="detail-title">{product.name}</h1>

            <div className="detail-rating-stock">
              <span className="rating-pill">
                <Star size={12} /> {product.rating}
              </span>
              <span style={{ fontSize: '13px', color: availableStock > 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>
                {availableStock > 0 ? `In Stock (${availableStock} available)` : 'Out of stock'}
              </span>
            </div>

            <div className="detail-price-box">
              <span className="detail-current-price">{formatPrice(product.price)}</span>
              {product.compareAtPrice && product.compareAtPrice > product.price && (
                <span className="detail-original-price">{formatPrice(product.compareAtPrice)}</span>
              )}
              {discount > 0 && <span className="detail-discount-tag">{discount}% OFF</span>}
            </div>

            <p className="detail-desc">{product.description}</p>

            {/* Variant selector */}
            {product.variants.length > 0 && (
              <div className="variant-picker">
                <label>Select Option:</label>
                <div className="variant-pills">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`variant-pill ${selectedVariant === v.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedVariant(v.id)
                        setQuantity(1)
                      }}
                    >
                      {v.label} ({v.stock > 0 ? `${v.stock} in stock` : 'Out of stock'})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity and Add to Cart */}
            <div className="detail-cta-row">
              <div className="qty-stepper">
                <button
                  type="button"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span>{quantity}</span>
                <button
                  type="button"
                  disabled={quantity >= availableStock}
                  onClick={() => setQuantity((q) => Math.min(availableStock, q + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <button
                className="detail-add-btn"
                disabled={availableStock === 0}
                onClick={handleAdd}
              >
                <ShoppingBag size={18} />
                {availableStock === 0 ? 'Out of stock' : 'Add to Bag'}
              </button>
            </div>

            {/* Trust Assurances */}
            <div className="trust-badges-grid">
              <div className="trust-item">
                <Truck size={18} />
                <span>Fast Dispatched in 24-48 hrs</span>
              </div>
              <div className="trust-item">
                <CreditCard size={18} />
                <span>Cash on Delivery Available</span>
              </div>
              <div className="trust-item">
                <RotateCcw size={18} />
                <span>Easy 7-Day Returns</span>
              </div>
            </div>
          </div>
        </div>

        {/* Related Products Section */}
        {relatedProducts.length > 0 && (
          <section className="detail-related-section" aria-label="Related Products">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title">You May Also Like</h2>
                <p className="section-subtitle">Complementary handcrafted pieces from our collection</p>
              </div>
              <Link to={`/products?category=${product.category.slug}`} className="view-more-link">
                Explore {product.category.name} <ChevronRight size={15} />
              </Link>
            </div>

            <div className="related-products-scroll" role="region" aria-label="Related products carousel">
              {relatedProducts.map((rel) => (
                <div key={rel.id} className="related-product-card-wrap">
                  <ProductCard
                    product={rel}
                    onAdd={(p) => addToCart(p)}
                    onOpen={(targetSlug) => navigate(`/product/${targetSlug}`)}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  )
}

/* ==========================================================================
   CART DELIVERY PROGRESS INDICATOR (COMPACT FLIPKART/MEESHO STYLE)
   ========================================================================== */
function CartDeliveryProgress({ subtotal }: { subtotal: number }) {
  if (subtotal <= 0) return null

  const percent = Math.min(100, Math.round((subtotal / 300) * 100))

  return (
    <div className="cart-delivery-banner" role="status">
      <div className="progress-header">
        <div className="progress-label">
          {subtotal < 200 ? (
            <>
              <span className="progress-icon">📦</span>
              <span>
                Add <strong>{formatPrice(200 - subtotal)}</strong> more to place your order
              </span>
            </>
          ) : subtotal < 300 ? (
            <>
              <Truck size={15} className="progress-icon-truck" />
              <span>
                Add <strong>{formatPrice(300 - subtotal)}</strong> more for <strong>FREE delivery</strong>
              </span>
            </>
          ) : (
            <>
              <span className="progress-check">✓</span>
              <span className="progress-unlocked">
                FREE delivery unlocked
              </span>
            </>
          )}
        </div>
        <span className="progress-subtotal">{formatPrice(subtotal)} / ₹300</span>
      </div>

      <div className="progress-track-wrapper">
        <div className="progress-track" aria-hidden="true">
          <div
            className={`progress-fill ${subtotal >= 300 ? 'complete' : ''}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="progress-milestones">
          <span>₹0</span>
          <span className={`milestone-tag ${subtotal >= 200 ? (subtotal >= 300 ? 'completed' : 'active') : ''}`}>
            ₹200 Min Order {subtotal >= 200 ? '✓' : ''}
          </span>
          <span className={`milestone-tag ${subtotal >= 300 ? 'completed' : ''}`}>
            ₹300 Free Delivery {subtotal >= 300 ? '✓' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ==========================================================================
   CART PAGE
   ========================================================================== */
function CartPage() {
  const { cartItems, updateQuantity, removeFromCart, getCartItemCount, getCartSubtotal } = useCart()
  const navigate = useNavigate()
  const subtotal = getCartSubtotal()
  const delivery = Number(import.meta.env.VITE_DELIVERY_CHARGE ?? 50)
  const isFreeDelivery = subtotal >= 300
  const deliveryFee = isFreeDelivery ? 0 : delivery
  const total = subtotal + deliveryFee

  return (
    <Layout>
      <div className="cart-page-wrapper">
        <div className="cart-header-title">
          <h1>Shopping Bag</h1>
          <p>
            {getCartItemCount()} {getCartItemCount() === 1 ? 'item' : 'items'} in your bag
          </p>
        </div>

        {cartItems.length === 0 ? (
          <div className="state-box">
            <ShoppingBag size={42} style={{ color: 'var(--color-primary)', margin: '0 auto 16px' }} />
            <h3>Your shopping bag is empty</h3>
            <p>Discover our range of handcrafted everyday goods.</p>
            <button className="hero-cta-btn" onClick={() => navigate('/products')}>
              Start Shopping <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <CartDeliveryProgress subtotal={subtotal} />

            <div className="cart-layout-grid">
              <div className="cart-items-column">
                {cartItems.map((item) => (
                  <div className="cart-item-card" key={item.key}>
                    <img src={item.product.images[0]} alt={item.product.name} />

                    <div className="cart-item-details">
                      <h3>{item.product.name}</h3>
                      {item.variant && <p className="cart-item-variant">Option: {item.variant.label}</p>}
                      <span className="cart-item-price">{formatPrice(item.product.price)}</span>
                    </div>

                    <div className="cart-item-actions">
                      <div className="qty-stepper">
                        <button
                          type="button"
                          disabled={item.quantity <= 1}
                          onClick={() => updateQuantity(item.key, item.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          disabled={item.quantity >= (item.variant?.stock ?? item.product.stock)}
                          onClick={() => updateQuantity(item.key, item.quantity + 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      <button
                        className="remove-btn"
                        onClick={() => removeFromCart(item.key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary Sidebar */}
              <aside className="summary-box">
                <h2>Order Summary</h2>
                <div className="summary-row">
                  <span>Items Subtotal</span>
                  <strong>{formatPrice(subtotal)}</strong>
                </div>
                <div className="summary-row">
                  <span>Delivery Charge</span>
                  <span>{isFreeDelivery ? 'FREE' : formatPrice(deliveryFee)}</span>
                </div>
                <div className="summary-row total">
                  <span>Estimated Total</span>
                  <strong>{formatPrice(total)}</strong>
                </div>

                {subtotal < 200 ? (
                  <div className="cart-min-order-note">
                    Add {formatPrice(200 - subtotal)} more to place your order
                  </div>
                ) : subtotal < 300 ? (
                  <div className="cart-min-order-note" style={{ color: 'var(--color-primary)' }}>
                    Add {formatPrice(300 - subtotal)} more for FREE delivery
                  </div>
                ) : (
                  <div className="cart-min-order-note" style={{ color: 'var(--color-success)' }}>
                    ✓ FREE delivery unlocked
                  </div>
                )}

                <button
                  className="checkout-btn"
                  disabled={subtotal < 200}
                  onClick={() => navigate('/checkout')}
                >
                  {subtotal < 200 ? `Add ${formatPrice(200 - subtotal)} to Order` : 'Proceed to Checkout'}{' '}
                  <ArrowRight size={16} />
                </button>
              </aside>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

/* ==========================================================================
   CHECKOUT PAGE (REDESIGNED CONTINUOUS FLOW & AUTO-PRESERVED DATA)
   ========================================================================== */
type CheckoutForm = {
  fullName: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  pincode: string
  notes: string
}
type PaymentMethod = 'cod' | 'manual_upi'

const CHECKOUT_FORM_STORAGE_KEY = 'raja-checkout-form-draft'
const CHECKOUT_METHOD_STORAGE_KEY = 'raja-checkout-method-draft'

const defaultCheckoutForm: CheckoutForm = {
  fullName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  notes: '',
}

function loadSavedCheckoutForm(): CheckoutForm {
  try {
    const saved = sessionStorage.getItem(CHECKOUT_FORM_STORAGE_KEY)
    if (saved) return { ...defaultCheckoutForm, ...JSON.parse(saved) }
  } catch {
    /* fallback to default */
  }
  return defaultCheckoutForm
}

function loadSavedPaymentMethod(): PaymentMethod | '' {
  try {
    const saved = sessionStorage.getItem(CHECKOUT_METHOD_STORAGE_KEY)
    if (saved === 'cod' || saved === 'manual_upi') return saved
  } catch {
    /* fallback */
  }
  return ''
}

function CheckoutPage() {
  const { cartItems, getCartSubtotal, clearCart } = useCart()
  const navigate = useNavigate()

  // Form state initialized with auto-preserved draft
  const [form, setForm] = useState<CheckoutForm>(loadSavedCheckoutForm)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(loadSavedPaymentMethod)
  const [utrNumber, setUtrNumber] = useState('')
  const [proof, setProof] = useState<File | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')
  // Validation: which fields have been interacted with (or all set on submit attempt)
  const [touched, setTouched] = useState<Partial<Record<keyof CheckoutForm | 'payment' | 'utr' | 'proof', boolean>>>({})
  // Whether Place Order was clicked with invalid fields (shows banner)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const [paymentConfig, setPaymentConfig] = useState({
    storeName: 'Raja Store',
    upiId: 'yourupi@upi',
    qrUrl: 'https://placehold.co/360x360/f3eadb/29382a?text=Raja+Store+UPI+QR',
  })
  const submittedRef = useRef(false)
  // Refs for scroll-to-first-error
  const fullNameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLTextAreaElement>(null)
  const cityRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef<HTMLInputElement>(null)
  const pincodeRef = useRef<HTMLInputElement>(null)
  const paymentRef = useRef<HTMLDivElement>(null)
  const utrRef = useRef<HTMLInputElement>(null)
  const proofRef = useRef<HTMLInputElement>(null)

  const subtotal = getCartSubtotal()
  const delivery = Number(import.meta.env.VITE_DELIVERY_CHARGE ?? 50)
  const isFreeDelivery = subtotal >= 300
  const deliveryFee = isFreeDelivery ? 0 : delivery
  const total = subtotal + deliveryFee

  // Auto-save form fields to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(CHECKOUT_FORM_STORAGE_KEY, JSON.stringify(form))
    } catch {
      /* ignore */
    }
  }, [form])

  // Auto-save payment method to sessionStorage
  useEffect(() => {
    try {
      if (paymentMethod) {
        sessionStorage.setItem(CHECKOUT_METHOD_STORAGE_KEY, paymentMethod)
      }
    } catch {
      /* ignore */
    }
  }, [paymentMethod])

  // Fetch store payment config
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/payment-config`)
      .then((res) => res.json())
      .then((payload: { payment?: typeof paymentConfig }) => {
        if (payload.payment) setPaymentConfig(payload.payment)
      })
      .catch(() => undefined)
  }, [])

  // Redirect if cart is empty and order wasn't just placed
  useEffect(() => {
    if (cartItems.length === 0 && !submittedRef.current) {
      navigate('/cart', { replace: true })
    }
  }, [cartItems.length, navigate])

  if (cartItems.length === 0) return null

  // --- Validation helpers ---
  function getFieldError(field: keyof CheckoutForm | 'payment' | 'utr' | 'proof'): string {
    switch (field) {
      case 'fullName':
        return form.fullName.trim().length >= 2 ? '' : 'Full name is required (min. 2 characters)'
      case 'phone':
        return /^[6-9][0-9]{9}$/.test(form.phone.trim()) ? '' : 'Enter a valid 10-digit Indian mobile number'
      case 'address':
        return form.address.trim().length >= 5 ? '' : 'Delivery address is required (min. 5 characters)'
      case 'city':
        return form.city.trim().length >= 2 ? '' : 'City / Town is required'
      case 'state':
        return form.state.trim().length >= 2 ? '' : 'State is required'
      case 'pincode':
        return /^[1-9][0-9]{5}$/.test(form.pincode.trim()) ? '' : 'Enter a valid 6-digit pincode'
      case 'payment':
        return paymentMethod !== '' ? '' : 'Please select a payment method'
      case 'utr':
        return paymentMethod === 'manual_upi' && !utrNumber.trim() ? 'Enter the UPI transaction ID / UTR number' : ''
      case 'proof':
        return paymentMethod === 'manual_upi' && !proof ? 'Please upload your payment screenshot' : ''
      default:
        return ''
    }
  }

  function showError(field: keyof CheckoutForm | 'payment' | 'utr' | 'proof'): string {
    return touched[field] ? getFieldError(field) : ''
  }

  const handleFieldChange =
    (field: keyof CheckoutForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const handleBlur = (field: keyof CheckoutForm | 'payment' | 'utr' | 'proof') => () => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function handleCopyUPI() {
    navigator.clipboard
      ?.writeText(paymentConfig.upiId)
      .then(() => {
        setCopyFeedback('UPI ID copied!')
        setTimeout(() => setCopyFeedback(''), 2000)
      })
      .catch(() => setCopyFeedback('Copy failed'))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (subtotal < 200) {
      setError('Minimum order amount is ₹200.')
      return
    }

    // Mark all required fields as touched to surface all errors
    const allFields: Array<keyof CheckoutForm | 'payment' | 'utr' | 'proof'> = [
      'fullName', 'phone', 'address', 'city', 'state', 'pincode', 'payment', 'utr', 'proof',
    ]
    const allTouched = Object.fromEntries(allFields.map((f) => [f, true]))
    setTouched(allTouched)

    // Check if any required field has an error
    const hasErrors = allFields.some((f) => getFieldError(f) !== '')
    if (hasErrors) {
      setSubmitAttempted(true)
      // Scroll to the first invalid field
      const refMap: Array<[keyof CheckoutForm | 'payment' | 'utr' | 'proof', React.RefObject<HTMLElement | null>]> = [
        ['fullName', fullNameRef],
        ['phone', phoneRef],
        ['address', addressRef],
        ['city', cityRef],
        ['state', stateRef],
        ['pincode', pincodeRef],
        ['payment', paymentRef],
        ['utr', utrRef],
        ['proof', proofRef],
      ]
      for (const [field, ref] of refMap) {
        if (getFieldError(field) !== '' && ref.current) {
          ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ref.current.focus()
          break
        }
      }
      return
    }

    setSubmitAttempted(false)
    setSubmitting(true)
    setError('')

    try {
      const requestKey = crypto.randomUUID()
      const response = await createOrder(
        {
          ...form,
          email: form.email || undefined,
          notes: form.notes || undefined,
        },
        cartItems,
        requestKey,
        {
          method: paymentMethod as PaymentMethod,
          utrNumber: paymentMethod === 'manual_upi' ? utrNumber : undefined,
          proof: paymentMethod === 'manual_upi' ? proof : undefined,
        }
      )

      submittedRef.current = true
      sessionStorage.removeItem(CHECKOUT_FORM_STORAGE_KEY)
      sessionStorage.removeItem(CHECKOUT_METHOD_STORAGE_KEY)
      clearCart()
      window.dispatchEvent(new Event('raja-store-products-invalidated'))
      navigate(`/order-success/${response.order.orderId}`, { state: response.order })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete order. Please review and try again.')
      navigate('/order-failure')
    } finally {
      setSubmitting(false)
    }
  }

  const isFormValid =
    form.fullName.trim().length >= 2 &&
    form.phone.trim().length === 10 &&
    form.address.trim().length >= 5 &&
    form.city.trim().length >= 2 &&
    form.state.trim().length >= 2 &&
    form.pincode.trim().length === 6 &&
    paymentMethod !== '' &&
    (paymentMethod === 'cod' || (Boolean(utrNumber) && Boolean(proof)))

  return (
    <Layout>
      <div className="checkout-page-wrapper">
        <div className="checkout-header-bar">
          <h1>Express Checkout</h1>
          <div className="checkout-steps-badge">
            <span className="step-active">1. Delivery Details</span>
            <span>•</span>
            <span className="step-active">2. Payment Method</span>
            <span>•</span>
            <span className="step-active">3. Order Confirmation</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="checkout-main-grid">
            {/* Left: Continuous Form Sections */}
            <div className="checkout-form-column">
              {/* Section 1: Customer Delivery Details */}
              <section className="checkout-card-section" aria-label="Shipping Address">
                <div className="section-title-row">
                  <span className="section-num-badge">1</span>
                  <h2>Where should we deliver?</h2>
                </div>

                <div className="checkout-fields-grid">
                  <div className="field-group">
                    <label htmlFor="fullName">Full Name<span className="field-required-star">*</span></label>
                    <input
                      id="fullName"
                      ref={fullNameRef}
                      className={`field-input${showError('fullName') ? ' error-field' : ''}`}
                      required
                      minLength={2}
                      maxLength={100}
                      value={form.fullName}
                      onChange={handleFieldChange('fullName')}
                      onBlur={handleBlur('fullName')}
                      placeholder="e.g. Ramesh Kumar"
                      autoComplete="name"
                      aria-describedby={showError('fullName') ? 'err-fullName' : undefined}
                      aria-invalid={Boolean(showError('fullName'))}
                    />
                    {showError('fullName') && <span id="err-fullName" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('fullName')}</span>}
                  </div>

                  <div className="field-group">
                    <label htmlFor="phone">Mobile Number<span className="field-required-star">*</span></label>
                    <input
                      id="phone"
                      ref={phoneRef}
                      className={`field-input${showError('phone') ? ' error-field' : ''}`}
                      required
                      pattern="[6-9][0-9]{9}"
                      title="Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9"
                      value={form.phone}
                      onChange={handleFieldChange('phone')}
                      onBlur={handleBlur('phone')}
                      placeholder="9876543210"
                      inputMode="numeric"
                      autoComplete="tel"
                      aria-describedby={showError('phone') ? 'err-phone' : undefined}
                      aria-invalid={Boolean(showError('phone'))}
                    />
                    {showError('phone') && <span id="err-phone" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('phone')}</span>}
                  </div>

                  <div className="field-group full-width">
                    <label htmlFor="email">
                      Email Address <span>(Optional for receipts)</span>
                    </label>
                    <input
                      id="email"
                      className="field-input"
                      type="email"
                      value={form.email}
                      onChange={handleFieldChange('email')}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>

                  <div className="field-group full-width">
                    <label htmlFor="address">Delivery Address (House No, Building, Street, Area)<span className="field-required-star">*</span></label>
                    <textarea
                      id="address"
                      ref={addressRef}
                      className={`field-textarea${showError('address') ? ' error-field' : ''}`}
                      required
                      minLength={5}
                      maxLength={300}
                      value={form.address}
                      onChange={handleFieldChange('address')}
                      onBlur={handleBlur('address')}
                      placeholder="Flat 102, Shanti Vihar, MG Road"
                      autoComplete="street-address"
                      aria-describedby={showError('address') ? 'err-address' : undefined}
                      aria-invalid={Boolean(showError('address'))}
                    />
                    {showError('address') && <span id="err-address" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('address')}</span>}
                  </div>

                  <div className="field-group">
                    <label htmlFor="city">City / Town<span className="field-required-star">*</span></label>
                    <input
                      id="city"
                      ref={cityRef}
                      className={`field-input${showError('city') ? ' error-field' : ''}`}
                      required
                      minLength={2}
                      maxLength={80}
                      value={form.city}
                      onChange={handleFieldChange('city')}
                      onBlur={handleBlur('city')}
                      placeholder="e.g. Jaipur"
                      autoComplete="address-level2"
                      aria-describedby={showError('city') ? 'err-city' : undefined}
                      aria-invalid={Boolean(showError('city'))}
                    />
                    {showError('city') && <span id="err-city" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('city')}</span>}
                  </div>

                  <div className="field-group">
                    <label htmlFor="state">State<span className="field-required-star">*</span></label>
                    <input
                      id="state"
                      ref={stateRef}
                      className={`field-input${showError('state') ? ' error-field' : ''}`}
                      required
                      minLength={2}
                      maxLength={80}
                      value={form.state}
                      onChange={handleFieldChange('state')}
                      onBlur={handleBlur('state')}
                      placeholder="e.g. Rajasthan"
                      autoComplete="address-level1"
                      aria-describedby={showError('state') ? 'err-state' : undefined}
                      aria-invalid={Boolean(showError('state'))}
                    />
                    {showError('state') && <span id="err-state" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('state')}</span>}
                  </div>

                  <div className="field-group">
                    <label htmlFor="pincode">6-Digit Pincode<span className="field-required-star">*</span></label>
                    <input
                      id="pincode"
                      ref={pincodeRef}
                      className={`field-input${showError('pincode') ? ' error-field' : ''}`}
                      required
                      pattern="[1-9][0-9]{5}"
                      title="Enter a valid 6-digit Indian pincode"
                      value={form.pincode}
                      onChange={handleFieldChange('pincode')}
                      onBlur={handleBlur('pincode')}
                      placeholder="302001"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      aria-describedby={showError('pincode') ? 'err-pincode' : undefined}
                      aria-invalid={Boolean(showError('pincode'))}
                    />
                    {showError('pincode') && <span id="err-pincode" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('pincode')}</span>}
                  </div>

                  <div className="field-group">
                    <label htmlFor="notes">
                      Delivery Notes <span>(Optional)</span>
                    </label>
                    <input
                      id="notes"
                      className="field-input"
                      maxLength={300}
                      value={form.notes}
                      onChange={handleFieldChange('notes')}
                      placeholder="Leave at front door / call on arrival"
                    />
                  </div>
                </div>
              </section>

              {/* Section 2: Payment Method */}
              <section className="checkout-card-section" aria-label="Payment Selection">
                <div className="section-title-row">
                  <span className="section-num-badge">2</span>
                  <h2>Payment Method<span className="field-required-star" style={{ marginLeft: 4 }}>*</span></h2>
                </div>

                <div className="payment-selector-grid" ref={paymentRef}>
                  <label
                    className={`payment-card-option ${paymentMethod === 'cod' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="checkoutPayment"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => { setPaymentMethod('cod'); setTouched((p) => ({ ...p, payment: true })) }}
                    />
                    <div className="option-content">
                      <strong>Cash on Delivery (COD)</strong>
                      <small>Pay with cash or UPI directly when your parcel arrives.</small>
                    </div>
                  </label>

                  <label
                    className={`payment-card-option ${paymentMethod === 'manual_upi' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="checkoutPayment"
                      value="manual_upi"
                      checked={paymentMethod === 'manual_upi'}
                      onChange={() => { setPaymentMethod('manual_upi'); setTouched((p) => ({ ...p, payment: true })) }}
                    />
                    <div className="option-content">
                      <strong>UPI / QR Code Instant Payment</strong>
                      <small>Scan QR using GPay, PhonePe, Paytm, and upload UTR screenshot.</small>
                    </div>
                  </label>
                </div>

                {/* UPI Instructions & Screenshot Upload Panel */}
                {paymentMethod === 'manual_upi' && (
                  <div className="upi-checkout-panel">
                    <div className="upi-amount-callout">
                      <span>Exact Amount to Pay:</span>
                      <strong>{formatPrice(total)}</strong>
                    </div>

                    <div className="upi-store-info">
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>UPI ID for {paymentConfig.storeName}:</div>
                        <div className="upi-id-text">{paymentConfig.upiId}</div>
                      </div>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={handleCopyUPI}
                      >
                        <Copy size={13} /> {copyFeedback || 'Copy UPI ID'}
                      </button>
                    </div>

                    <div className="qr-code-wrapper">
                      <img src={paymentConfig.qrUrl} alt="Store UPI QR Code" />
                      <span>Scan with any UPI App</span>
                    </div>

                    <ol className="upi-instructions">
                      <li>Scan the QR code or pay to the UPI ID above.</li>
                      <li>Pay exactly {formatPrice(total)}.</li>
                      <li>Take a screenshot of the successful transaction.</li>
                      <li>Enter the 12-digit UPI UTR number and upload the screenshot below.</li>
                    </ol>

                    <div className="manual-proof-upload">
                      <div className="field-group">
                        <label htmlFor="utr">UPI Transaction ID / UTR Number<span className="field-required-star">*</span></label>
                        <input
                          id="utr"
                          ref={utrRef}
                          className={`field-input${showError('utr') ? ' error-field' : ''}`}
                          required
                          minLength={6}
                          maxLength={40}
                          value={utrNumber}
                          onChange={(e) => setUtrNumber(e.target.value)}
                          onBlur={handleBlur('utr')}
                          placeholder="e.g. 429381029381"
                          aria-describedby={showError('utr') ? 'err-utr' : undefined}
                          aria-invalid={Boolean(showError('utr'))}
                        />
                        {showError('utr') && <span id="err-utr" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('utr')}</span>}
                      </div>

                      <div className="field-group">
                        <label htmlFor="proof">Payment Screenshot<span className="field-required-star">*</span></label>
                        <div className="file-input-wrapper">
                          <input
                            id="proof"
                            ref={proofRef}
                            type="file"
                            required
                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                            onChange={(e) => { setProof(e.target.files?.[0]); setTouched((p) => ({ ...p, proof: true })) }}
                            aria-describedby={showError('proof') ? 'err-proof' : undefined}
                            aria-invalid={Boolean(showError('proof'))}
                          />
                        </div>
                        {showError('proof') && <span id="err-proof" className="field-error-msg" role="alert"><AlertCircle size={12} />{showError('proof')}</span>}
                      </div>

                      <div className="payment-safety-note">
                        Payment screenshots are manually verified by our fulfillment team before parcel dispatch.
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Right: Sticky Order Summary */}
            <aside className="checkout-summary-card">
              <h2 style={{ fontSize: '18px', margin: '0 0 16px', fontWeight: 700 }}>
                Order Summary ({cartItems.length} items)
              </h2>

              <div className="checkout-items-preview">
                {cartItems.map((item) => (
                  <div className="preview-item-row" key={item.key}>
                    <div className="preview-item-title">
                      {item.product.name} <small>× {item.quantity}</small>
                    </div>
                    <div className="preview-item-price">
                      {formatPrice(item.product.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="checkout-line-item">
                <span>Subtotal</span>
                <strong>{formatPrice(subtotal)}</strong>
              </div>

              <div className="checkout-line-item">
                <span>Delivery Charge</span>
                <span>{isFreeDelivery ? 'FREE' : formatPrice(deliveryFee)}</span>
              </div>

              <div className="checkout-line-item total">
                <span>Total Payable</span>
                <strong>{formatPrice(total)}</strong>
              </div>

              {subtotal < 200 ? (
                <div className="checkout-delivery-note below-min">
                  Add {formatPrice(200 - subtotal)} more to place your order (Minimum order ₹200).
                </div>
              ) : subtotal < 300 ? (
                <div className="checkout-delivery-note free-eligible">
                  Add {formatPrice(300 - subtotal)} more for FREE delivery.
                </div>
              ) : (
                <div className="checkout-delivery-note free-unlocked">
                  ✓ FREE delivery unlocked on this order!
                </div>
              )}

              {!paymentMethod && touched.payment && (
                <div style={{ fontSize: '12px', color: 'var(--color-error)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertCircle size={12} /> Please select a payment method above.
                </div>
              )}
              {!paymentMethod && !touched.payment && (
                <div style={{ fontSize: '12px', color: 'var(--color-primary)', marginTop: '8px' }}>
                  Please select a payment method above.
                </div>
              )}

              {error && <div className="error-banner">{error}</div>}

              {/* Incomplete fields banner — shown only after a failed submit attempt */}
              {submitAttempted && !isFormValid && (
                <div className="checkout-incomplete-banner" role="alert">
                  <AlertCircle size={16} /> Please complete the highlighted fields above.
                </div>
              )}

              <button
                className="checkout-place-order-btn"
                type="submit"
                disabled={submitting || subtotal < 200}
              >
                {submitting
                  ? 'Placing Order...'
                  : subtotal < 200
                  ? `Add ${formatPrice(200 - subtotal)} to Order`
                  : `Place Order • ${formatPrice(total)}`}
              </button>

              <Link
                to="/cart"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '14px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                <ArrowLeft size={14} /> Back to Bag
              </Link>
            </aside>
          </div>

          {/* Mobile Sticky Bottom Action Bar */}
          <div className="mobile-sticky-checkout-bar">
            <div className="mobile-bar-total">
              <small>Total Amount</small>
              <strong>{formatPrice(total)}</strong>
            </div>
            <button
              className="mobile-bar-btn"
              type="submit"
              disabled={submitting || subtotal < 200}
              aria-label="Confirm and place order"
            >
              {submitting
                ? 'Placing...'
                : subtotal < 200
                ? `Add ${formatPrice(200 - subtotal)}`
                : 'Place Order'}{' '}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </div>
    </Layout>
  )
}

/* ==========================================================================
   GUEST ORDER TRACKING PAGE
   ========================================================================== */
function TrackOrderPage() {
  const [orderId, setOrderId] = useState('')
  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState<TrackedOrder>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function lookup(id: string, mobile: string) {
    setLoading(true)
    setError('')
    try {
      const data = await trackOrder(id.trim(), mobile.trim())
      setOrder(data)
      sessionStorage.setItem(
        'raja-store-tracking-lookup',
        JSON.stringify({ orderId: id.trim(), phone: mobile.trim() })
      )
    } catch {
      setOrder(undefined)
      setError('Could not locate your order. Please check the Order ID and mobile number.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem('raja-store-tracking-lookup') ?? 'null'
      ) as { orderId?: string; phone?: string } | null
      if (saved?.orderId && saved.phone) {
        setOrderId(saved.orderId)
        setPhone(saved.phone)
        void lookup(saved.orderId, saved.phone)
      }
    } catch {
      sessionStorage.removeItem('raja-store-tracking-lookup')
    }
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void lookup(orderId, phone)
  }

  const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered']
  const currentIndex = order ? statuses.indexOf(order.status) : -1

  return (
    <Layout>
      <div className="tracking-container">
        <div className="tracking-hero-card">
          <h1>Track Your Order</h1>
          <p>Enter your Order ID (from your confirmation) and the 10-digit mobile number used at checkout.</p>

          <form className="tracking-search-form" onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="trackId">Order ID</label>
              <input
                id="trackId"
                className="field-input"
                required
                pattern="ORD-[0-9]{4}-[0-9]{6}"
                placeholder="ORD-2026-000001"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label htmlFor="trackPhone">Mobile Number</label>
              <input
                id="trackPhone"
                className="field-input"
                required
                pattern="[6-9][0-9]{9}"
                placeholder="9876543210"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <button className="track-submit-btn" type="submit" disabled={loading}>
              {loading ? 'Checking...' : 'Track Order'}
            </button>
          </form>

          {error && <div className="error-banner" style={{ marginTop: '16px' }}>{error}</div>}
        </div>

        {order && (
          <div className="tracking-details-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tracking Order</span>
                <h2 style={{ fontSize: '20px', margin: '4px 0 0', fontWeight: 700 }}>#{order.orderId}</h2>
              </div>
              <span
                style={{
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  textTransform: 'uppercase',
                }}
              >
                {order.status.replaceAll('_', ' ')}
              </span>
            </div>

            {/* Stages timeline */}
            <div className="timeline-stages-bar">
              {statuses.map((s, idx) => {
                const isDone = idx < currentIndex
                const isCurrent = idx === currentIndex
                return (
                  <div
                    key={s}
                    className={`stage-step ${isDone ? 'completed' : isCurrent ? 'active' : ''}`}
                  >
                    <span>{isDone ? '✓' : isCurrent ? '●' : '○'}</span>
                    <span style={{ textTransform: 'capitalize' }}>{s.replaceAll('_', ' ')}</span>
                  </div>
                )
              })}
            </div>

            <div className="tracking-info-grid">
              <div>
                <h4 style={{ fontSize: '14px', margin: '0 0 12px', fontWeight: 700 }}>Ordered Items</h4>
                {order.items.map((item) => (
                  <div
                    key={`${item.skuSnapshot}-${item.quantity}`}
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}
                  >
                    <span>{item.productNameSnapshot} × {item.quantity}</span>
                    <strong>{formatPrice(item.lineTotal)}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '12px', fontWeight: 700 }}>
                  <span>Total Amount Paid / Due:</span>
                  <strong>{formatPrice(order.total)}</strong>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '14px', margin: '0 0 12px', fontWeight: 700 }}>Shipping & Payment</h4>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                  <div><strong>Payment:</strong> {order.payment.method === 'cod' ? 'Cash on Delivery' : 'UPI / QR'}</div>
                  <div><strong>Payment Status:</strong> {order.payment.status.replaceAll('_', ' ')}</div>
                  <div style={{ marginTop: '10px' }}><strong>Delivery Address:</strong></div>
                  <div>{order.shippingAddress.address}</div>
                  <div>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

/* ==========================================================================
   ORDER SUCCESS & FAILURE PAGES
   ========================================================================== */
function OrderSuccessPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    orderId,
    total,
    paymentMethod,
    paymentStatus,
    status: orderStatus,
  } = (location.state ?? {}) as {
    orderId?: string
    total?: number
    paymentMethod?: string
    paymentStatus?: string
    status?: string // fulfillment status from order response
  }
  const { orderId: routeOrderId } = useParams()
  const finalId = orderId ?? routeOrderId

  // Persist this order to device localStorage (idempotent — no phone stored)
  useEffect(() => {
    if (!finalId) return
    appendMyOrder({
      orderId: finalId,
      total: typeof total === 'number' ? total : 0,
      paymentMethod: paymentMethod ?? 'cod',
      orderStatus: orderStatus ?? 'pending',
      placedAt: new Date().toISOString(),
    })
    // Notify My Orders nav badge to refresh
    window.dispatchEvent(new Event('raja-my-orders-updated'))
  }, [finalId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout>
      <div className="order-status-wrapper">
        <div className="order-status-card">
          <div className="status-icon-bubble success">
            <Check size={32} />
          </div>

          <h1>{paymentMethod === 'manual_upi' ? 'Order Received for Review' : 'Order Placed Successfully!'}</h1>
          <p>
            {paymentMethod === 'manual_upi'
              ? 'Your payment proof has been submitted. Our team will verify your UTR and begin packing your order shortly.'
              : 'Thank you for shopping with Raja Store! Your Cash on Delivery order is confirmed and will be dispatched soon.'}
          </p>

          <div className="status-meta-grid">
            <div className="meta-box">
              <span>Order ID</span>
              <strong>#{finalId}</strong>
            </div>
            <div className="meta-box">
              <span>Payment Mode</span>
              <strong>{paymentMethod === 'manual_upi' ? 'UPI / QR' : 'Cash on Delivery'}</strong>
            </div>
            <div className="meta-box">
              <span>Payment Status</span>
              <strong>{paymentStatus === 'pending_verification' ? 'Pending Verification' : 'Confirmed'}</strong>
            </div>
            <div className="meta-box">
              <span>Total Payable</span>
              <strong>{typeof total === 'number' ? formatPrice(total) : 'Confirmed'}</strong>
            </div>
          </div>

          {/* Save Order ID reminder + View My Orders */}
          {finalId && (
            <div className="order-success-save-box">
              <p>Keep your Order ID safe for tracking on any device:</p>
              <strong>#{finalId}</strong>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                It has been saved to your My Orders on this device.
              </p>
              <Link className="view-my-orders-btn" to="/my-orders">
                <ClipboardList size={15} /> View My Orders
              </Link>
            </div>
          )}

          <div className="status-actions-row">
            <Link className="status-primary-btn" to="/track-order">
              <Truck size={16} /> Track My Order
            </Link>
            <Link className="status-secondary-btn" to="/products">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}

function OrderFailurePage() {
  return (
    <Layout>
      <div className="order-status-wrapper">
        <div className="order-status-card">
          <div className="status-icon-bubble failure">
            <X size={32} />
          </div>

          <h1>Order Could Not Be Completed</h1>
          <p>
            We encountered an issue placing your order. Don't worry — your bag items have been preserved. Please check your network and details and try again.
          </p>

          <div className="status-actions-row">
            <Link className="status-primary-btn" to="/checkout">
              Return to Checkout <ArrowRight size={16} />
            </Link>
            <Link className="status-secondary-btn" to="/cart">
              View Bag
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}

/* ==========================================================================
   MY ORDERS PAGE
   ========================================================================== */
const COMPLETED_STATUSES = new Set(['delivered', 'cancelled'])

function isCompletedOrder(status: string) {
  return COMPLETED_STATUSES.has(status)
}

function MyOrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<import('./services/myOrdersService').StoredOrder[]>(
    () => getMyOrders()
  )

  // Refresh on storage events (multi-tab)
  useEffect(() => {
    const refresh = () => setOrders(getMyOrders())
    window.addEventListener('storage', refresh)
    window.addEventListener('raja-my-orders-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('raja-my-orders-updated', refresh)
    }
  }, [])

  // Sort: active orders first (newest first within group), then completed (delivered/cancelled)
  const sortedOrders = [...orders].sort((a, b) => {
    const aCompleted = isCompletedOrder(a.orderStatus)
    const bCompleted = isCompletedOrder(b.orderStatus)
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
    return new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime()
  })

  function handleTrack(orderId: string) {
    // Pre-fill the orderId in the tracking page via sessionStorage; customer still must enter phone
    try {
      const existing = JSON.parse(
        sessionStorage.getItem('raja-store-tracking-lookup') ?? 'null'
      ) as { orderId?: string; phone?: string } | null
      sessionStorage.setItem(
        'raja-store-tracking-lookup',
        JSON.stringify({ orderId, phone: existing?.phone ?? '' })
      )
    } catch { /* ignore */ }
    navigate('/track-order')
  }

  function formatOrderDate(isoString: string) {
    try {
      return new Date(isoString).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    } catch {
      return isoString
    }
  }

  function paymentLabel(method: string) {
    if (method === 'manual_upi') return 'UPI / QR'
    if (method === 'cod') return 'Cash on Delivery'
    return method
  }

  function orderStatusBadgeClass(status: string) {
    return `my-order-status-badge status-fulfillment-${status.replace(/[^a-z_]/g, '')}`
  }

  function orderStatusLabel(status: string) {
    const labels: Record<string, string> = {
      pending: 'Pending',
      confirmed: 'Confirmed',
      processing: 'Processing',
      shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
    }
    return labels[status] ?? status.replaceAll('_', ' ')
  }

  return (
    <Layout>
      <div className="my-orders-container">
        <div className="my-orders-header">
          <h1>My Orders</h1>
          <p>Orders placed on this browser. Use Order ID + mobile to track on any device.</p>
        </div>

        {sortedOrders.length === 0 ? (
          <div className="my-orders-empty">
            <div className="my-orders-empty-icon">
              <Package size={28} />
            </div>
            <h2>No orders yet</h2>
            <p>
              Orders you place on Raja Store will appear here for easy reference. You can also track any order using your Order ID and mobile number.
            </p>
            <button
              className="my-orders-empty-shop-btn"
              onClick={() => navigate('/products')}
            >
              <ShoppingBag size={16} /> Start Shopping
            </button>
          </div>
        ) : (
          <>
            {sortedOrders.map((order) => {
              const completed = isCompletedOrder(order.orderStatus)
              return (
                <div
                  className={`my-order-card${completed ? ' is-completed' : ''}`}
                  key={order.orderId}
                >
                  <div className="my-order-icon">
                    <Package size={20} />
                  </div>

                  <div className="my-order-info">
                    <p className="my-order-id">#{order.orderId}</p>
                    <div className="my-order-meta">
                      <span>{formatOrderDate(order.placedAt)}</span>
                      <span>•</span>
                      <span>{formatPrice(order.total)}</span>
                      <span>•</span>
                      <span>{paymentLabel(order.paymentMethod)}</span>
                      <span>•</span>
                      <span className={orderStatusBadgeClass(order.orderStatus)}>
                        {orderStatusLabel(order.orderStatus)}
                      </span>
                    </div>
                  </div>

                  <button
                    className="my-order-track-btn"
                    onClick={() => handleTrack(order.orderId)}
                    aria-label={`Track order ${order.orderId}`}
                  >
                    <Truck size={14} /> Track Order
                  </button>
                </div>
              )
            })}
          </>
        )}

        <div className="my-orders-device-note">
          🔒 Orders are saved only on this browser. Use Order ID + mobile number on{' '}
          <Link to="/track-order" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Track Order</Link>{' '}
          to check from any device.
        </div>
      </div>
    </Layout>
  )
}

/* ==========================================================================
   MAIN APP ROUTER
   ========================================================================== */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/product/:slug" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order-success/:orderId" element={<OrderSuccessPage />} />
        <Route path="/order-failure" element={<OrderFailurePage />} />
        <Route path="/track-order" element={<TrackOrderPage />} />
        <Route path="/my-orders" element={<MyOrdersPage />} />
        <Route path="/dev/database" element={<DevDatabasePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  )
}
