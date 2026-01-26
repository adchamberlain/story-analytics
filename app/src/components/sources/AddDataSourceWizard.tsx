/**
 * Add Data Source wizard modal.
 * Multi-step wizard for connecting new databases.
 */

import { useState } from 'react'
import {
  testSnowflakeConnection,
  saveSnowflakeConnection,
  generateSemanticLayer,
  type SnowflakeConnectionRequest,
} from '../../api/client'
import { useSourceStore } from '../../stores/sourceStore'

type WizardStep = 'connection' | 'testing' | 'generate' | 'generating' | 'complete'

interface AddDataSourceWizardProps {
  isOpen: boolean
  onClose: () => void
}

export function AddDataSourceWizard({ isOpen, onClose }: AddDataSourceWizardProps) {
  const { loadSources, openSchemaBrowser } = useSourceStore()

  const [step, setStep] = useState<WizardStep>('connection')
  const [sourceName, setSourceName] = useState('')
  const [connection, setConnection] = useState<SnowflakeConnectionRequest>({
    account: '',
    username: '',
    password: '',
    warehouse: '',
    database: '',
    schema_name: '',
  })
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    tables: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generationResult, setGenerationResult] = useState<{
    tables_count: number
    domain: string
  } | null>(null)

  if (!isOpen) return null

  const handleTestConnection = async () => {
    setStep('testing')
    setError(null)

    try {
      const result = await testSnowflakeConnection(connection)
      setTestResult({
        success: result.success,
        message: result.message,
        tables: result.tables || [],
      })

      if (result.success) {
        // Save the connection
        await saveSnowflakeConnection(connection, sourceName || 'snowflake_new')
        await loadSources()
        setStep('generate')
      } else {
        setError(result.message)
        setStep('connection')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed')
      setStep('connection')
    }
  }

  const handleGenerateSemantic = async () => {
    setStep('generating')
    setError(null)

    try {
      const result = await generateSemanticLayer(sourceName || 'snowflake_new', { force: true })

      if (result.success) {
        setGenerationResult({
          tables_count: result.tables_count || 0,
          domain: result.domain || 'Unknown',
        })
        await loadSources()
        setStep('complete')
      } else {
        setError(result.message)
        setStep('generate')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStep('generate')
    }
  }

  const handleComplete = () => {
    onClose()
    // Open schema browser for the new source
    openSchemaBrowser(sourceName || 'snowflake_new')
    // Reset state
    setStep('connection')
    setSourceName('')
    setConnection({
      account: '',
      username: '',
      password: '',
      warehouse: '',
      database: '',
      schema_name: '',
    })
    setTestResult(null)
    setError(null)
    setGenerationResult(null)
  }

  const handleClose = () => {
    onClose()
    // Reset state
    setStep('connection')
    setSourceName('')
    setConnection({
      account: '',
      username: '',
      password: '',
      warehouse: '',
      database: '',
      schema_name: '',
    })
    setTestResult(null)
    setError(null)
    setGenerationResult(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'testing' && step !== 'generating') {
          handleClose()
        }
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-gray-900)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-gray-700)',
          width: '90%',
          maxWidth: '500px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--color-gray-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--text-lg)',
              fontFamily: 'var(--font-brand)',
              color: 'var(--color-gray-100)',
            }}
          >
            Add Data Source
          </h2>
          {step !== 'testing' && step !== 'generating' && (
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-gray-400)',
                cursor: 'pointer',
                fontSize: 'var(--text-xl)',
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-gray-850)',
            borderBottom: '1px solid var(--color-gray-700)',
            gap: 'var(--space-2)',
          }}
        >
          {['Connect', 'Generate', 'Complete'].map((label, idx) => {
            const currentIdx =
              step === 'connection' || step === 'testing'
                ? 0
                : step === 'generate' || step === 'generating'
                  ? 1
                  : 2
            const isActive = idx === currentIdx
            const isComplete = idx < currentIdx

            return (
              <div
                key={label}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    backgroundColor: isComplete
                      ? 'var(--color-success)'
                      : isActive
                        ? 'var(--color-primary)'
                        : 'var(--color-gray-700)',
                    color: isComplete || isActive ? 'white' : 'var(--color-gray-400)',
                  }}
                >
                  {isComplete ? '\u2713' : idx + 1}
                </div>
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: isActive ? 'var(--color-gray-100)' : 'var(--color-gray-500)',
                    fontFamily: 'var(--font-brand)',
                  }}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--space-4)' }}>
          {step === 'connection' && (
            <ConnectionForm
              sourceName={sourceName}
              setSourceName={setSourceName}
              connection={connection}
              setConnection={setConnection}
              error={error}
              onSubmit={handleTestConnection}
            />
          )}

          {step === 'testing' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  border: '3px solid var(--color-gray-700)',
                  borderTopColor: 'var(--color-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto var(--space-4)',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p style={{ margin: 0, color: 'var(--color-gray-300)' }}>
                Testing connection...
              </p>
            </div>
          )}

          {step === 'generate' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--space-3)',
                  fontSize: '24px',
                  color: 'white',
                }}
              >
                {'\u2713'}
              </div>
              <h3
                style={{
                  margin: '0 0 var(--space-2)',
                  fontSize: 'var(--text-lg)',
                  fontFamily: 'var(--font-brand)',
                  color: 'var(--color-gray-100)',
                }}
              >
                Connection Successful!
              </h3>
              <p style={{ margin: '0 0 var(--space-2)', color: 'var(--color-gray-400)' }}>
                Found {testResult?.tables.length || 0} tables in your database.
              </p>
              <div
                style={{
                  maxHeight: '100px',
                  overflowY: 'auto',
                  marginBottom: 'var(--space-4)',
                  padding: 'var(--space-2)',
                  backgroundColor: 'var(--color-gray-800)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-gray-400)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {testResult?.tables.join(', ')}
              </div>
              {error && (
                <div
                  style={{
                    marginBottom: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-3)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid var(--color-error)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-error)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  {error}
                </div>
              )}
              <p style={{ margin: '0 0 var(--space-4)', color: 'var(--color-gray-300)' }}>
                Now let's generate a semantic layer with AI to describe your data.
              </p>
              <button
                onClick={handleGenerateSemantic}
                style={{
                  padding: 'var(--space-3) var(--space-6)',
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-md)',
                  fontFamily: 'var(--font-brand)',
                  fontWeight: 500,
                }}
              >
                Generate Semantic Layer
              </button>
            </div>
          )}

          {step === 'generating' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  border: '3px solid var(--color-gray-700)',
                  borderTopColor: 'var(--color-primary)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto var(--space-4)',
                }}
              />
              <h3
                style={{
                  margin: '0 0 var(--space-2)',
                  fontSize: 'var(--text-lg)',
                  fontFamily: 'var(--font-brand)',
                  color: 'var(--color-gray-100)',
                }}
              >
                Generating Semantic Layer...
              </h3>
              <p style={{ margin: 0, color: 'var(--color-gray-400)' }}>
                AI is analyzing your schema and sample data.
                <br />
                This may take a moment.
              </p>
            </div>
          )}

          {step === 'complete' && (
            <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--space-3)',
                  fontSize: '32px',
                  color: 'white',
                }}
              >
                {'\u2713'}
              </div>
              <h3
                style={{
                  margin: '0 0 var(--space-2)',
                  fontSize: 'var(--text-xl)',
                  fontFamily: 'var(--font-brand)',
                  color: 'var(--color-gray-100)',
                }}
              >
                Data Source Ready!
              </h3>
              <p style={{ margin: '0 0 var(--space-4)', color: 'var(--color-gray-400)' }}>
                {generationResult?.tables_count || 0} tables documented
                <br />
                Domain: <strong>{generationResult?.domain || 'Unknown'}</strong>
              </p>
              <button
                onClick={handleComplete}
                style={{
                  padding: 'var(--space-3) var(--space-6)',
                  backgroundColor: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-md)',
                  fontFamily: 'var(--font-brand)',
                  fontWeight: 500,
                }}
              >
                Browse Schema
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Connection form component
function ConnectionForm({
  sourceName,
  setSourceName,
  connection,
  setConnection,
  error,
  onSubmit,
}: {
  sourceName: string
  setSourceName: (name: string) => void
  connection: SnowflakeConnectionRequest
  setConnection: (conn: SnowflakeConnectionRequest) => void
  error: string | null
  onSubmit: () => void
}) {
  const updateField = (field: keyof SnowflakeConnectionRequest, value: string) => {
    setConnection({ ...connection, [field]: value })
  }

  const isValid =
    sourceName &&
    connection.account &&
    connection.username &&
    connection.password &&
    connection.warehouse &&
    connection.database &&
    connection.schema_name

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Source Name *
        </label>
        <input
          type="text"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
          placeholder="my_database"
          style={{
            width: '100%',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--color-gray-800)',
            color: 'var(--color-gray-200)',
            border: '1px solid var(--color-gray-600)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        />
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)' }}>
          Used to identify this connection (lowercase, no spaces)
        </p>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Account Identifier *
        </label>
        <input
          type="text"
          value={connection.account}
          onChange={(e) => updateField('account', e.target.value)}
          placeholder="abc12345.us-east-1"
          style={{
            width: '100%',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--color-gray-800)',
            color: 'var(--color-gray-200)',
            border: '1px solid var(--color-gray-600)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-500)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Username *
          </label>
          <input
            type="text"
            value={connection.username}
            onChange={(e) => updateField('username', e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-800)',
              color: 'var(--color-gray-200)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-500)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Password *
          </label>
          <input
            type="password"
            value={connection.password}
            onChange={(e) => updateField('password', e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-800)',
              color: 'var(--color-gray-200)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <label
          style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-gray-500)',
            marginBottom: 'var(--space-1)',
          }}
        >
          Warehouse *
        </label>
        <input
          type="text"
          value={connection.warehouse}
          onChange={(e) => updateField('warehouse', e.target.value)}
          placeholder="COMPUTE_WH"
          style={{
            width: '100%',
            padding: 'var(--space-2)',
            backgroundColor: 'var(--color-gray-800)',
            color: 'var(--color-gray-200)',
            border: '1px solid var(--color-gray-600)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-500)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Database *
          </label>
          <input
            type="text"
            value={connection.database}
            onChange={(e) => updateField('database', e.target.value)}
            placeholder="ANALYTICS"
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-800)',
              color: 'var(--color-gray-200)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-500)',
              marginBottom: 'var(--space-1)',
            }}
          >
            Schema *
          </label>
          <input
            type="text"
            value={connection.schema_name}
            onChange={(e) => updateField('schema_name', e.target.value)}
            placeholder="PUBLIC"
            style={{
              width: '100%',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-gray-800)',
              color: 'var(--color-gray-200)',
              border: '1px solid var(--color-gray-600)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!isValid}
        style={{
          width: '100%',
          padding: 'var(--space-3)',
          backgroundColor: isValid ? 'var(--color-primary)' : 'var(--color-gray-700)',
          color: isValid ? 'white' : 'var(--color-gray-500)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: isValid ? 'pointer' : 'not-allowed',
          fontSize: 'var(--text-md)',
          fontFamily: 'var(--font-brand)',
          fontWeight: 500,
        }}
      >
        Test Connection
      </button>
    </div>
  )
}
