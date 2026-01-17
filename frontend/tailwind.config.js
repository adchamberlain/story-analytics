/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				terminal: {
					bg: '#0a0a0a',
					surface: '#111111',
					border: '#222222',
					text: '#e0e0e0',
					dim: '#666666',
					accent: '#7c9eff',
					'accent-bright': '#9fb8ff',
					'accent-dim': '#4a6eb3',
					amber: '#f59e0b',
					red: '#ef4444'
				}
			},
			fontFamily: {
				mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
			},
			animation: {
				blink: 'blink 1s step-end infinite',
				'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
			},
			keyframes: {
				blink: {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0' }
				}
			}
		}
	},
	plugins: []
};
