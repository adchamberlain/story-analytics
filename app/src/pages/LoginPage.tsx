/**
 * Login page with magic link authentication.
 */

import { useState } from 'react'
import { requestMagicLink } from '../api/client'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [sentToEmail, setSentToEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await requestMagicLink(email)
      setEmailSent(true)
      setSentToEmail(email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send link')
    } finally {
      setLoading(false)
    }
  }

  const handleTryAgain = () => {
    setEmailSent(false)
    setSentToEmail('')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-gray-900)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--color-gray-800)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--color-gray-700)',
        }}
      >
        {/* Terminal header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-gray-700)',
            borderBottom: '1px solid var(--color-gray-600)',
          }}
        >
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#ff5f57',
            }}
          />
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#febc2e',
            }}
          />
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#28c840',
            }}
          />
          <span
            style={{
              marginLeft: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-gray-400)',
            }}
          >
            login
          </span>
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--space-6)' }}>
          {/* Logo */}
          <h1
            style={{
              color: 'var(--color-primary)',
              fontWeight: 700,
              fontSize: 'var(--text-2xl)',
              letterSpacing: '0.1em',
              margin: 0,
            }}
          >
            STORY
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '24px',
                backgroundColor: 'var(--color-primary)',
                marginLeft: '4px',
                verticalAlign: 'middle',
                animation: 'blink 1s step-end infinite',
              }}
            />
          </h1>
          <p
            style={{
              color: 'var(--color-gray-400)',
              fontSize: 'var(--text-sm)',
              marginTop: 'var(--space-1)',
              marginBottom: 'var(--space-6)',
            }}
          >
            AI-native analytics.
          </p>

          {emailSent ? (
            /* Success state */
            <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
              <div
                style={{
                  fontSize: '3rem',
                  color: 'var(--color-primary)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                &#10003;
              </div>
              <p
                style={{
                  color: 'var(--color-gray-200)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                Check your email!
              </p>
              <p
                style={{
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                We sent a sign-in link to
                <br />
                <span style={{ color: 'var(--color-warning)' }}>{sentToEmail}</span>
              </p>
              <p
                style={{
                  color: 'var(--color-gray-500)',
                  fontSize: 'var(--text-xs)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                The link expires in 15 minutes.
              </p>
              <button
                onClick={handleTryAgain}
                style={{
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                  background: 'none',
                  border: 'none',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* Login form */
            <>
              <p
                style={{
                  color: 'var(--color-gray-400)',
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-6)',
                }}
              >
                Enter your email to sign in
              </p>

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label
                    htmlFor="email"
                    style={{
                      display: 'block',
                      color: 'var(--color-gray-400)',
                      fontSize: 'var(--text-sm)',
                      marginBottom: 'var(--space-1)',
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    style={{
                      width: '100%',
                      padding: 'var(--space-2) var(--space-3)',
                      backgroundColor: 'var(--color-gray-900)',
                      border: '1px solid var(--color-gray-600)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-gray-200)',
                      fontSize: 'var(--text-base)',
                    }}
                  />
                </div>

                {error && (
                  <p
                    style={{
                      color: 'var(--color-error)',
                      fontSize: 'var(--text-sm)',
                      marginBottom: 'var(--space-4)',
                    }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-base)',
                    fontWeight: 500,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  {loading ? 'Sending...' : 'Send link'}
                </button>
              </form>

              <p
                style={{
                  marginTop: 'var(--space-6)',
                  textAlign: 'center',
                  color: 'var(--color-gray-500)',
                  fontSize: 'var(--text-xs)',
                }}
              >
                We'll email you a link to sign in instantly.
                <br />
                No password needed.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Blink animation */}
      <style>{`
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
