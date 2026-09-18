import { useState, useRef, useMemo, type ChangeEvent } from 'react'
import {
  Download,
  UploadCloud,
  X,
  AlertCircle,
  CheckCircle,
  Image as ImageIcon,
  AlertTriangle,
  RefreshCw,
  Layers,
} from 'lucide-react'
import {
  parseCsv,
  validateAndMatchBulkProducts,
  type ParsedBulkRow,
} from '../utils/bulkProductImport'
import {
  adminApi,
  downloadProductTemplateCsv,
  type AdminProduct,
  type BulkImportProductInput,
} from '../services/adminService'
import { formatPrice } from '../utils/format'

type BulkImportModalProps = {
  isOpen: boolean
  onClose: () => void
  token: string
  existingProducts: AdminProduct[]
  onImportSuccess: () => Promise<void>
}

export default function BulkImportModal({
  isOpen,
  onClose,
  token,
  existingProducts,
  onImportSuccess,
}: BulkImportModalProps) {
  const [csvFileName, setCsvFileName] = useState<string>('')
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [importProgressText, setImportProgressText] = useState('')
  const [importProgressPercent, setImportProgressPercent] = useState(0)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [generalError, setGeneralError] = useState('')

  const csvInputRef = useRef<HTMLInputElement>(null)
  const photosInputRef = useRef<HTMLInputElement>(null)

  // Run validation & matching whenever CSV rows or selected files change
  const validationReport = useMemo(() => {
    if (rawRows.length === 0) return null
    return validateAndMatchBulkProducts(rawRows, selectedFiles, existingProducts)
  }, [rawRows, selectedFiles, existingProducts])

  if (!isOpen) return null

  function handleCsvUpload(e: ChangeEvent<HTMLInputElement>) {
    setGeneralError('')
    setImportResult(null)
    const file = e.target.files?.[0]
    if (!file) return

    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result ?? '')
        const rows = parseCsv(text)
        if (rows.length === 0) {
          setGeneralError('CSV file is empty or has invalid formatting.')
          setRawRows([])
        } else {
          setRawRows(rows)
        }
      } catch (err) {
        setGeneralError(err instanceof Error ? err.message : 'Error reading CSV file.')
        setRawRows([])
      }
    }
    reader.readAsText(file)
  }

  function handlePhotosUpload(e: ChangeEvent<HTMLInputElement>) {
    setGeneralError('')
    setImportResult(null)
    const fileList = e.target.files
    if (!fileList) return
    const incoming = Array.from(fileList)
    setSelectedFiles(incoming)
  }

  async function handleStartImport() {
    if (!validationReport || !validationReport.canImport) return
    setIsImporting(true)
    setGeneralError('')
    setImportResult(null)

    try {
      // 1. Collect all unique files that need to be uploaded
      const fileToProductSku = new Map<File, string>()
      const allFilesToUpload: File[] = []

      for (const item of validationReport.products) {
        for (const file of item.matchedFiles) {
          allFilesToUpload.push(file)
          fileToProductSku.set(file, item.sku)
        }
      }

      // Map from File to Cloudinary/server reference
      const fileReferenceMap = new Map<File, string>()

      // 2. Upload photos in chunks of 5
      if (allFilesToUpload.length > 0) {
        const chunkSize = 5
        for (let i = 0; i < allFilesToUpload.length; i += chunkSize) {
          const chunk = allFilesToUpload.slice(i, i + chunkSize)
          const currentCount = i + chunk.length
          const percent = Math.round((currentCount / allFilesToUpload.length) * 80)
          setImportProgressPercent(percent)
          setImportProgressText(
            `Uploading photos to Cloudinary (${currentCount} of ${allFilesToUpload.length})...`
          )

          const res = await adminApi.bulkUploadImages(token, chunk)
          res.uploaded.forEach((item, index) => {
            fileReferenceMap.set(chunk[index], item.reference)
          })
        }
      }

      // 3. Assemble final products payload
      setImportProgressPercent(90)
      setImportProgressText(`Saving ${validationReport.products.length} products to database...`)

      const payload: BulkImportProductInput[] = validationReport.products.map((item) => {
        const images = item.matchedFiles
          .map((f) => fileReferenceMap.get(f))
          .filter((ref): ref is string => Boolean(ref))

        return {
          sku: item.sku,
          name: item.name,
          category: { name: item.categoryName, slug: item.categorySlug },
          price: item.price,
          compareAtPrice: item.compareAtPrice,
          stock: item.stock,
          shortDescription: item.shortDescription,
          description: item.description,
          active: item.active,
          isBestSeller: item.isBestSeller,
          isNew: item.isNew,
          tone: item.tone,
          slug: item.slug,
          images,
        }
      })

      // 4. Commit to database
      const result = await adminApi.bulkImport(token, payload)
      setImportProgressPercent(100)
      setImportProgressText('Import completed!')
      setImportResult({
        success: true,
        message: `Successfully imported ${result.totalProcessed} products (${result.createdCount} created, ${result.updatedCount} updated).`,
      })

      // Refresh product list in Admin
      await onImportSuccess()
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Bulk import failed.')
    } finally {
      setIsImporting(false)
    }
  }

  function resetAll() {
    setCsvFileName('')
    setRawRows([])
    setSelectedFiles([])
    setImportResult(null)
    setGeneralError('')
    setImportProgressPercent(0)
    setImportProgressText('')
    if (csvInputRef.current) csvInputRef.current.value = ''
    if (photosInputRef.current) photosInputRef.current.value = ''
  }

  return (
    <div className="bulk-modal-overlay">
      <div className="bulk-modal-card">
        {/* Header */}
        <div className="bulk-modal-header">
          <div>
            <div className="bulk-badge-pill">Admin Operations</div>
            <h2>Bulk Product Import</h2>
            <p className="bulk-modal-sub">
              Upload 100–500 products with automatic photo matching by SKU.
            </p>
          </div>
          <div className="bulk-header-actions">
            <button
              type="button"
              className="bulk-template-btn"
              onClick={downloadProductTemplateCsv}
              title="Download CSV template with 5 example products"
            >
              <Download size={15} /> Download CSV Template
            </button>
            <button
              type="button"
              className="bulk-close-btn"
              onClick={onClose}
              disabled={isImporting}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {generalError && (
          <div className="bulk-error-banner">
            <AlertCircle size={18} />
            <span>{generalError}</span>
          </div>
        )}

        {/* Success Banner */}
        {importResult && (
          <div className="bulk-success-banner">
            <CheckCircle size={20} />
            <div>
              <strong>Import Successful!</strong>
              <p>{importResult.message}</p>
            </div>
            <button type="button" className="solid-button" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {/* Upload Setup Steps */}
        {!importResult && (
          <div className="bulk-setup-grid">
            {/* Step 1: Upload CSV */}
            <div className="bulk-step-box">
              <div className="bulk-step-title">
                <span className="step-num">1</span>
                <div>
                  <strong>Upload CSV Sheet</strong>
                  <p>Excel / CSV containing products with unique SKUs</p>
                </div>
              </div>

              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleCsvUpload}
              />

              <div
                className={`bulk-dropzone ${csvFileName ? 'has-file' : ''}`}
                onClick={() => csvInputRef.current?.click()}
              >
                <UploadCloud size={24} className="dropzone-icon" />
                {csvFileName ? (
                  <div>
                    <span className="dropzone-filename">{csvFileName}</span>
                    <span className="dropzone-hint">
                      {rawRows.length} products loaded (Click to change)
                    </span>
                  </div>
                ) : (
                  <div>
                    <span>Click to choose or drag CSV file</span>
                    <span className="dropzone-hint">Must contain column: sku, name, price, stock...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Select Photos */}
            <div className="bulk-step-box">
              <div className="bulk-step-title">
                <span className="step-num">2</span>
                <div>
                  <strong>Select Product Photos</strong>
                  <p>Named by SKU: &lt;SKU&gt;.jpg or &lt;SKU&gt;-1.jpg</p>
                </div>
              </div>

              <input
                ref={photosInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handlePhotosUpload}
              />

              <div
                className={`bulk-dropzone ${selectedFiles.length > 0 ? 'has-file' : ''}`}
                onClick={() => photosInputRef.current?.click()}
              >
                <ImageIcon size={24} className="dropzone-icon" />
                {selectedFiles.length > 0 ? (
                  <div>
                    <span className="dropzone-filename">
                      {selectedFiles.length} photo files selected
                    </span>
                    <span className="dropzone-hint">
                      {validationReport?.totalPhotosMatched ?? 0} photos matched to products
                    </span>
                  </div>
                ) : (
                  <div>
                    <span>Click to select product photos</span>
                    <span className="dropzone-hint">JPG, PNG, or WEBP (up to 5 images per SKU)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pre-Import Preview & Validation Summary */}
        {validationReport && !importResult && (
          <div className="bulk-preview-section">
            <div className="bulk-summary-bar">
              <div className="bulk-stat-chip">
                <Layers size={15} />
                <strong>{validationReport.products.length}</strong> Total Products
              </div>
              <div className="bulk-stat-chip text-success">
                <CheckCircle size={15} />
                <strong>
                  {validationReport.products.filter((p) => p.errors.length === 0).length}
                </strong>{' '}
                Ready
              </div>
              {validationReport.totalErrors > 0 && (
                <div className="bulk-stat-chip text-error">
                  <AlertCircle size={15} />
                  <strong>{validationReport.totalErrors}</strong> Errors
                </div>
              )}
              <div className="bulk-stat-chip text-info">
                <ImageIcon size={15} />
                <strong>{validationReport.totalPhotosMatched}</strong> Photos Matched
              </div>
              {validationReport.unmatchedFiles.length > 0 && (
                <div className="bulk-stat-chip text-warning">
                  <AlertTriangle size={15} />
                  <strong>{validationReport.unmatchedFiles.length}</strong> Unmatched Photos
                </div>
              )}
            </div>

            {/* Unmatched photos notice */}
            {validationReport.unmatchedFiles.length > 0 && (
              <div className="bulk-unmatched-alert">
                <strong>Unmatched Photo Files:</strong>
                <span>
                  {' '}
                  {validationReport.unmatchedFiles.slice(0, 8).join(', ')}
                  {validationReport.unmatchedFiles.length > 8
                    ? ` and ${validationReport.unmatchedFiles.length - 8} more`
                    : ''}
                </span>
              </div>
            )}

            {/* Table */}
            <div className="bulk-table-wrap">
              <table className="bulk-preview-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Photos</th>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Issues / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {validationReport.products.map((item) => {
                    const hasErr = item.errors.length > 0
                    return (
                      <tr key={item.sku || item.rowNumber} className={hasErr ? 'row-error' : ''}>
                        <td>
                          {hasErr ? (
                            <span className="badge-pill error">
                              <AlertCircle size={12} /> Error
                            </span>
                          ) : item.isExisting ? (
                            <span className="badge-pill info">Update</span>
                          ) : (
                            <span className="badge-pill success">
                              <CheckCircle size={12} /> New
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="thumb-gallery">
                            {item.matchedFiles.length > 0 ? (
                              item.matchedFiles.map((file, idx) => (
                                <img
                                  key={idx}
                                  src={URL.createObjectURL(file)}
                                  alt=""
                                  className="bulk-preview-thumb"
                                  title={file.name}
                                />
                              ))
                            ) : item.isExisting ? (
                              <span className="text-muted-tag">Keep existing</span>
                            ) : (
                              <span className="text-error-tag">0 photos</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong>{item.sku}</strong>
                        </td>
                        <td>{item.name}</td>
                        <td>
                          <span className="category-tag">{item.categoryName}</span>
                        </td>
                        <td>{formatPrice(item.price)}</td>
                        <td>{item.stock}</td>
                        <td>
                          {hasErr ? (
                            <ul className="row-errors-list">
                              {item.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-success-tag">Ready to import</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Progress Display */}
        {isImporting && (
          <div className="bulk-progress-box">
            <div className="bulk-progress-text">
              <RefreshCw size={16} className="is-spinning" />
              <span>{importProgressText}</span>
              <strong>{importProgressPercent}%</strong>
            </div>
            <div className="bulk-progress-track">
              <div
                className="bulk-progress-fill"
                style={{ width: `${importProgressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        {!importResult && (
          <div className="bulk-modal-footer">
            <button
              type="button"
              className="text-link"
              onClick={resetAll}
              disabled={isImporting || rawRows.length === 0}
            >
              Reset All
            </button>
            <div className="bulk-footer-right">
              <button
                type="button"
                className="text-link"
                onClick={onClose}
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="solid-button"
                onClick={handleStartImport}
                disabled={
                  isImporting ||
                  !validationReport ||
                  !validationReport.canImport ||
                  validationReport.products.length === 0
                }
              >
                {isImporting
                  ? 'Importing...'
                  : `Import ${validationReport?.products.length ?? 0} Products`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
