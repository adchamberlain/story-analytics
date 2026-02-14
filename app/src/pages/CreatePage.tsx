import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileDropzone } from '../components/data/FileDropzone'
import { DataPreview } from '../components/data/DataPreview'
import { ChartProposal } from '../components/create/ChartProposal'
import { useDataStore } from '../stores/dataStore'
import { useCreateStore } from '../stores/createStore'

export function CreatePage() {
  const [searchParams] = useSearchParams()
  const data = useDataStore()
  const create = useCreateStore()

  // If source_id is in URL params, auto-advance to proposing
  useEffect(() => {
    const sourceParam = searchParams.get('source')
    if (sourceParam && !create.sourceId) {
      create.setSourceId(sourceParam)
      create.proposeChart(sourceParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1a1a1a' }}>
              Create a Chart
            </h1>
            <p className="text-sm mt-1" style={{ color: '#666666' }}>
              {create.step === 'upload' && 'Upload your data to get started'}
              {create.step === 'preview' && 'Review your data, then let AI create a chart'}
              {create.step === 'proposing' && 'AI is analyzing your data...'}
              {create.step === 'result' && 'Here\'s what AI recommends'}
            </p>
          </div>
          {create.step !== 'upload' && (
            <button
              onClick={() => { create.reset(); data.reset() }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-8 space-y-6">
        {/* Error banner */}
        {(data.error || create.error) && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {data.error || create.error}
          </div>
        )}

        {/* Step 1: Upload */}
        {create.step === 'upload' && !data.source && (
          <FileDropzone onFileSelected={data.uploadCSV} uploading={data.uploading} />
        )}

        {/* Auto-advance: once upload is done, set source and show preview */}
        {data.source && create.step === 'upload' && (
          <AutoAdvance
            sourceId={data.source.source_id}
            onReady={(id) => create.setSourceId(id)}
          />
        )}

        {/* Step 2: Data Preview */}
        {(create.step === 'preview') && data.source && (
          <>
            <DataPreview
              filename={data.source.filename}
              rowCount={data.source.row_count}
              columns={data.source.columns}
              preview={data.preview}
              loadingPreview={data.loadingPreview}
            />
            <div className="flex justify-end">
              <button
                onClick={() => create.proposeChart(create.sourceId!)}
                className="px-5 py-2.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                Create with AI
              </button>
            </div>
          </>
        )}

        {/* Step 3: Proposing (loading) */}
        {create.step === 'proposing' && (
          <div className="bg-white rounded-lg border border-gray-200 px-8 py-16 text-center">
            <svg className="animate-spin h-8 w-8 mx-auto text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
              Analyzing your data...
            </p>
            <p className="text-xs mt-1" style={{ color: '#999999' }}>
              AI is choosing the best visualization and writing a query
            </p>
          </div>
        )}

        {/* Step 4: Result */}
        {create.step === 'result' && create.proposal && (
          <ChartProposal
            proposal={create.proposal}
            onSave={create.saveChart}
            onTryDifferent={create.tryDifferent}
            saving={create.saving}
            savedChartId={create.savedChartId}
          />
        )}
      </main>
    </div>
  )
}

/** Helper: auto-advance from upload to preview step */
function AutoAdvance({ sourceId, onReady }: { sourceId: string; onReady: (id: string) => void }) {
  useEffect(() => {
    onReady(sourceId)
  }, [sourceId, onReady])
  return null
}
