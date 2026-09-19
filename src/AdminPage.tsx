import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ClipboardList, Database, LogOut, Package, Plus, RefreshCw, ShieldCheck, UploadCloud } from 'lucide-react'
import { adminApi, type AdminOrder, type AdminProduct } from './services/adminService'
import { formatPrice } from './utils/format'
import { API_BASE_URL } from './config'
import BulkImportModal from './components/BulkImportModal'
import { useSEO } from './hooks/useSEO'

/** Convert any string to a URL-safe slug that satisfies /^[a-z0-9]+(?:-[a-z0-9]+)*$/ */
function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`]/g, '')          // remove apostrophes/backticks before splitting
    .replace(/[^a-z0-9]+/g, '-')   // replace every non-alphanumeric run with a hyphen
    .replace(/^-+|-+$/g, '')        // strip leading/trailing hyphens
}

const orderStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']
type ProductDraft = { name: string; slug: string; description: string; shortDescription: string; sku: string; categoryName: string; categorySlug: string; price: string; compareAtPrice: string; stock: string; active: boolean }
type ImageEntry = { key: string; src: string; file?: File; reference?: string }
const emptyDraft: ProductDraft = { name: '', slug: '', description: '', shortDescription: '', sku: '', categoryName: 'Home', categorySlug: 'home', price: '', compareAtPrice: '', stock: '0', active: true }

export default function AdminPage() {
  useSEO({ title: 'Admin Dashboard | Raja Store', noIndex: true })
  const [token, setToken] = useState(() => sessionStorage.getItem('raja-admin-token') ?? '')
  const [draftToken, setDraftToken] = useState(token)
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [selected, setSelected] = useState<AdminOrder>()
  const [tab, setTab] = useState<'orders' | 'products'>('orders')
  const [productDraft, setProductDraft] = useState(emptyDraft)
  const [imageEntries, setImageEntries] = useState<ImageEntry[]>([])
  const [editingId, setEditingId] = useState<string>()
  const [showProductForm, setShowProductForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [error, setError] = useState('')
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  // true once the admin manually edits the Slug field; stops auto-generation from name
  const slugTouchedRef = useRef(false)

  async function refresh() { if (!token) return; setLoading(true); setError(''); try { const [orderData, productData] = await Promise.all([adminApi.orders(token), adminApi.products(token)]); setOrders(orderData.orders); setProducts(productData.products) } catch (err) { setError(err instanceof Error ? err.message : 'Admin request failed') } finally { setLoading(false) } }
  useEffect(() => { void refresh() }, [token])
  function login(event: FormEvent) { event.preventDefault(); sessionStorage.setItem('raja-admin-token', draftToken); setToken(draftToken) }
  function setField(field: keyof ProductDraft, value: string | boolean) {
    if (field === 'slug') {
      // Admin is manually editing the slug — stop auto-generating from name
      slugTouchedRef.current = true
    }
    setProductDraft((current) => {
      const next = { ...current, [field]: value }
      // Auto-generate slug from name only while adding and the admin hasn't touched the slug field
      if (field === 'name' && !editingId && !slugTouchedRef.current) {
        next.slug = toSlug(String(value))
      }
      return next
    })
  }
  function startAddProduct() { slugTouchedRef.current = false; setEditingId(undefined); setProductDraft(emptyDraft); setImageEntries([]); setError(''); setShowProductForm(true) }
  function editProduct(product: AdminProduct) { const fallbackSlug = product.slug ? toSlug(product.slug) : toSlug(product.name); slugTouchedRef.current = true; setEditingId(product.productId); setProductDraft({ name: product.name, slug: fallbackSlug, description: product.description ?? product.shortDescription ?? product.name, shortDescription: product.shortDescription ?? product.name, sku: product.sku, categoryName: product.category?.name ?? 'Home', categorySlug: product.category?.slug ?? 'home', price: String(product.price), compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '', stock: String(product.stock), active: product.active !== false }); setImageEntries((product.images ?? []).map((reference, index) => ({ key: `existing-${index}-${reference}`, reference, src: reference.startsWith('http') ? reference : `${API_BASE_URL}/api/products/${product.productId}/images/${reference}` }))); setShowProductForm(true) }
  function addImages(files: FileList | null) { if (!files) return; const incoming = Array.from(files); if (incoming.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Images must be JPG, PNG, or WEBP files under 5 MB.'); return } if (imageEntries.length + incoming.length > 5) { setError('A product can have at most 5 images.'); return } setImageEntries((entries) => [...entries, ...incoming.map((file, index) => ({ key: `new-${Date.now()}-${index}`, file, src: URL.createObjectURL(file) }))]) }
  function removeImage(index: number) { setImageEntries((entries) => entries.filter((_, entryIndex) => entryIndex !== index)) }
  function moveImage(index: number, direction: -1 | 1) { setImageEntries((entries) => { const next = index + direction; if (next < 0 || next >= entries.length) return entries; const copy = [...entries]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy }) }
  async function saveProduct(event: FormEvent) { event.preventDefault(); if (!editingId && imageEntries.length < 1) { setError('Add at least one product image.'); return } const normalizedSlug = toSlug(productDraft.slug); if (!normalizedSlug) { setError('Slug is required. It will be generated from the product name automatically.'); return } const payload = { name: productDraft.name, slug: normalizedSlug, description: productDraft.description, shortDescription: productDraft.shortDescription, sku: productDraft.sku, category: { name: productDraft.categoryName, slug: productDraft.categorySlug }, price: Number(productDraft.price), ...(productDraft.compareAtPrice ? { compareAtPrice: Number(productDraft.compareAtPrice) } : {}), stock: Number(productDraft.stock), active: productDraft.active }; try { const files = imageEntries.flatMap((entry) => entry.file ? [entry.file] : []); const imageOrder = imageEntries.map((entry) => entry.reference ? `ref:${entry.reference}` : `file:${files.indexOf(entry.file!)}`); if (editingId) await adminApi.updateProduct(token, editingId, payload, files, imageOrder); else await adminApi.createProduct(token, payload, files, imageOrder); setShowProductForm(false); setEditingId(undefined); setProductDraft(emptyDraft); setImageEntries([]); slugTouchedRef.current = false; await refresh() } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save product') } }
  async function changeStock(product: AdminProduct) { const value = window.prompt(`Stock for ${product.name}`, String(product.stock)); if (value === null) return; try { await adminApi.updateStock(token, product.productId, Number(value)); await refresh() } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update stock') } }
  async function deleteProduct(product: AdminProduct) {
    if (!window.confirm(`Are you sure you want to delete "${product.name}"?\nThis will permanently remove the product and all its images.`)) return
    // Optimistically remove from list so UI feels instant
    setProducts((prev) => prev.filter((p) => p.productId !== product.productId))
    setDeleteMessage(null)
    try {
      await adminApi.deleteProduct(token, product.productId)
      setDeleteMessage({ type: 'success', text: `"${product.name}" was deleted.` })
      setTimeout(() => setDeleteMessage(null), 5000)
      // Full refresh to sync any server-side state
      await refresh()
    } catch (err) {
      // Restore product list on failure
      await refresh()
      setDeleteMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete product.' })
      setTimeout(() => setDeleteMessage(null), 7000)
    }
  }
  if (!token) return <main className="admin-login"><ShieldCheck size={30} /><p className="eyebrow">Protected workspace</p><h1>Raja Store Admin</h1><p>Enter the development/admin API token configured on the server.</p><form onSubmit={login}><input aria-label="Admin token" type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="Admin API token" required /><button className="solid-button">Open dashboard</button></form></main>
  return <main className="admin-shell"><aside className="admin-sidebar"><div className="admin-brand"><span className="brand-mark">R</span><strong>raja.store</strong></div><button className={tab === 'orders' ? 'admin-nav active' : 'admin-nav'} onClick={() => setTab('orders')}><ClipboardList size={17} /> Orders</button><button className={tab === 'products' ? 'admin-nav active' : 'admin-nav'} onClick={() => setTab('products')}><Package size={17} /> Inventory</button><a className="admin-nav" href="/dev/database"><Database size={17} /> Database check</a><button className="admin-nav admin-logout" onClick={() => { sessionStorage.removeItem('raja-admin-token'); setToken('') }}><LogOut size={17} /> Sign out</button></aside><section className="admin-content"><header className="admin-header"><div><p className="eyebrow">Operations</p><h1>{tab === 'orders' ? 'Orders' : 'Inventory'}</h1></div><button className="icon-button" onClick={() => void refresh()} aria-label="Refresh admin data"><RefreshCw className={loading ? 'is-spinning' : ''} size={19} /></button></header>{error && <p className="form-error">{error}</p>}{tab === 'orders' ? <OrdersPanel token={token} orders={orders} selected={selected} setSelected={setSelected} refresh={refresh} /> : <InventoryPanel products={products} showForm={showProductForm} setShowForm={setShowProductForm} startAdd={startAddProduct} openBulkImport={() => setShowBulkImport(true)} draft={productDraft} setField={setField} editingId={editingId} editProduct={editProduct} saveProduct={saveProduct} changeStock={changeStock} deleteProduct={deleteProduct} deleteMessage={deleteMessage} clearDeleteMessage={() => setDeleteMessage(null)} imageEntries={imageEntries} addImages={addImages} removeImage={removeImage} moveImage={moveImage} />}</section><BulkImportModal isOpen={showBulkImport} onClose={() => setShowBulkImport(false)} token={token} existingProducts={products} onImportSuccess={refresh} /></main>
}

function OrdersPanel({ token, orders, selected, setSelected, refresh }: { token: string; orders: AdminOrder[]; selected?: AdminOrder; setSelected: (order?: AdminOrder) => void; refresh: () => Promise<void> }) {
  const [proofUrl, setProofUrl] = useState<string>()
  const [proofLoading, setProofLoading] = useState(false)
  const [proofError, setProofError] = useState('')
  useEffect(() => {
    setProofUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return undefined })
    setProofError('')
    if (!selected?.payment?.proofFileId) return
    setProofLoading(true)
    adminApi.paymentProof(token, selected.orderId)
      .then((url) => { setProofUrl(url) })
      .catch((err: unknown) => { setProofError(err instanceof Error ? err.message : 'Could not load screenshot.') })
      .finally(() => { setProofLoading(false) })
  }, [selected?.orderId, selected?.payment?.proofFileId])
  return <div className="admin-orders"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead><tbody>{orders.map((order) => <tr key={order.orderId} onClick={() => void adminApi.order(token, order.orderId).then((data) => setSelected(data.order))}><td>{order.orderId}<small>{new Date(order.createdAt).toLocaleString('en-IN')}</small></td><td>{order.customer.fullName}<small>{order.customer.phone}</small></td><td>{formatPrice(order.pricing.total)}</td><td>{order.payment.method}<small>{order.payment.status}</small></td><td><select value={order.orderStatus} onClick={(event) => event.stopPropagation()} onChange={(event) => void adminApi.status(token, order.orderId, event.target.value).then(() => refresh())}>{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>{selected && <article className="admin-detail"><p className="eyebrow">Order detail</p><h2>{selected.orderId}</h2><p>{selected.customer.fullName} · {selected.customer.phone}</p><p>{selected.customer.address}, {selected.customer.city}, {selected.customer.state} {selected.customer.pincode}</p>{selected.items.map((item) => <div className="admin-line" key={item.skuSnapshot}><span>{item.productNameSnapshot} × {item.quantity}</span><strong>{formatPrice(item.lineTotal)}</strong></div>)}<div className="admin-line"><span>Total</span><strong>{formatPrice(selected.pricing.total)}</strong></div><p>UTR: {selected.payment.utrNumber ?? 'Not provided'}</p><p>Admin notification: {selected.notification?.status ?? 'pending'}{selected.notification?.sentAt ? ` · ${new Date(selected.notification.sentAt).toLocaleString('en-IN')}` : ''}</p>{selected.payment.proofFileId && <div className="admin-proof-section"><p className="eyebrow" style={{ marginTop: '1rem' }}>Payment Screenshot</p>{proofLoading && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Loading screenshot…</p>}{proofError && <p style={{ fontSize: '0.85rem', color: 'var(--error, #e53e3e)' }}>{proofError}</p>}{proofUrl && <img src={proofUrl} alt="Payment screenshot" style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px', border: '1px solid var(--border)', marginTop: '0.5rem', display: 'block' }} />}</div>}{selected.payment.status === 'pending_verification' && <div className="admin-actions"><button className="solid-button" onClick={() => void adminApi.payment(token, selected.orderId, 'paid').then(refresh)}>Verify payment</button><button className="reject-button" onClick={() => void adminApi.payment(token, selected.orderId, 'rejected').then(refresh)}>Reject payment</button></div>}</article>}</div>
}


function InventoryPanel({ products, showForm, setShowForm, startAdd, openBulkImport, draft, setField, editingId, editProduct, saveProduct, changeStock, deleteProduct, deleteMessage, clearDeleteMessage, imageEntries, addImages, removeImage, moveImage }: { products: AdminProduct[]; showForm: boolean; setShowForm: (value: boolean) => void; startAdd: () => void; openBulkImport: () => void; draft: ProductDraft; setField: (field: keyof ProductDraft, value: string | boolean) => void; editingId?: string; editProduct: (product: AdminProduct) => void; saveProduct: (event: FormEvent) => Promise<void>; changeStock: (product: AdminProduct) => Promise<void>; deleteProduct: (product: AdminProduct) => Promise<void>; deleteMessage: { type: 'success' | 'error'; text: string } | null; clearDeleteMessage: () => void; imageEntries: ImageEntry[]; addImages: (files: FileList | null) => void; removeImage: (index: number) => void; moveImage: (index: number, direction: -1 | 1) => void }) { return <div className="admin-inventory"><div className="inventory-toolbar"><p>MongoDB is the source of truth for price and stock.</p><div style={{ display: 'flex', gap: '10px' }}><button className="secondary-button" type="button" onClick={openBulkImport}><UploadCloud size={16} /> Bulk import</button><button className="solid-button" onClick={startAdd}><Plus size={16} /> Add product</button></div></div>{showForm && <form className="product-form" onSubmit={saveProduct}><h2>{editingId ? 'Edit product' : 'Add product'}</h2><div className="product-form-grid"><input required placeholder="Name" value={draft.name} onChange={(event) => setField('name', event.target.value)} /><input required placeholder="Slug" value={draft.slug} onChange={(event) => setField('slug', event.target.value)} /><input required placeholder="SKU" value={draft.sku} onChange={(event) => setField('sku', event.target.value)} /><input required type="number" min="0" placeholder="Price" value={draft.price} onChange={(event) => setField('price', event.target.value)} /><input type="number" min="0" placeholder="Compare at price" value={draft.compareAtPrice} onChange={(event) => setField('compareAtPrice', event.target.value)} /><input required type="number" min="0" placeholder="Stock" value={draft.stock} onChange={(event) => setField('stock', event.target.value)} /><input required placeholder="Category name" value={draft.categoryName} onChange={(event) => setField('categoryName', event.target.value)} /><input required placeholder="Category slug" value={draft.categorySlug} onChange={(event) => setField('categorySlug', event.target.value)} /><input required className="full-field" placeholder="Short description" value={draft.shortDescription} onChange={(event) => setField('shortDescription', event.target.value)} /><textarea required className="full-field" placeholder="Description" value={draft.description} onChange={(event) => setField('description', event.target.value)} rows={3} /><label className="active-toggle"><input type="checkbox" checked={draft.active} onChange={(event) => setField('active', event.target.checked)} /> Active</label></div><div className="image-manager"><label>Product images (1–5, JPG/PNG/WEBP, max 5 MB each)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addImages(event.target.files)} /></label><div className="image-preview-grid">{imageEntries.map((image, index) => <div className="image-preview" key={image.key}><img src={image.src} alt={`Product preview ${index + 1}`} /><span>Image {index + 1}</span><button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0}>←</button><button type="button" onClick={() => moveImage(index, 1)} disabled={index === imageEntries.length - 1}>→</button><button type="button" onClick={() => removeImage(index)}>Remove</button></div>)}</div></div><button className="solid-button" type="submit">Save product</button><button className="text-link" type="button" onClick={() => { setShowForm(false); startAdd(); }}>Cancel</button></form>}{deleteMessage && <div className={`delete-toast delete-toast--${deleteMessage.type}`} role="alert"><span>{deleteMessage.text}</span><button type="button" className="delete-toast-close" onClick={clearDeleteMessage} aria-label="Dismiss">×</button></div>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>State</th><th>Actions</th></tr></thead><tbody>{products.map((product) => <tr key={product.productId}><td>{product.name}</td><td>{product.sku}</td><td>{formatPrice(product.price)}</td><td className={product.stock === 0 ? 'stock-out' : product.stock <= 5 ? 'stock-low' : ''}>{product.stock}</td><td>{product.active === false ? 'Disabled' : product.stock === 0 ? 'Out of stock' : product.stock <= 5 ? 'Low stock' : 'Active'}</td><td><button className="text-link" onClick={() => editProduct(product)}>Edit</button><button className="text-link" onClick={() => void changeStock(product)}>Stock</button><button className="text-link delete-link" onClick={() => void deleteProduct(product)}>Delete</button></td></tr>)}</tbody></table></div></div> }
