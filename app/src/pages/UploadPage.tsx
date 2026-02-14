import { FileDropzone } from '../components/data/FileDropzone'
import { DataPreview } from '../components/data/DataPreview'
import { useDataStore } from '../stores/dataStore'

export function UploadPage() {
  const { source, preview, uploading, loadingPreview, error, uploadCSV, reset } = useDataStore()

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
          Create a Chart
        </h1>
        <p className="text-sm mt-1" style={{ color: '#666666' }}>
          Upload your data to get started
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Upload or preview */}
        {!source ? (
          <FileDropzone onFileSelected={uploadCSV} uploading={uploading} />
        ) : (
          <>
            <DataPreview
              filename={source.filename}
              rowCount={source.row_count}
              columns={source.columns}
              preview={preview}
              loadingPreview={loadingPreview}
            />

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={reset}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Upload different file
              </button>
              <div className="flex gap-3">
                <a
                  href={`/create/manual?source=${source.source_id}`}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Build manually
                </a>
                <a
                  href={`/create/ai?source=${source.source_id}`}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                >
                  Create with AI
                </a>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
