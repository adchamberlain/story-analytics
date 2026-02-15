# Contributing to Story Analytics

Thank you for your interest in contributing! Story Analytics is an open-source project and we welcome contributions of all kinds.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/story-analytics.git`
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   cd app && npm install && cd ..
   ```
4. Start the dev server: `./dev.sh`
5. Create a branch for your changes: `git checkout -b my-feature`

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm

### Running Locally

```bash
# Start both API and frontend
./dev.sh

# Or run separately:
# API: uvicorn api.main:app --reload --port 8000
# Frontend: cd app && npm run dev
```

### AI Features (Optional)

AI features require an API key. Set one in your `.env`:
```
ANTHROPIC_API_KEY=sk-...
```

All chart creation and editing works without AI via direct controls.

## Making Changes

### Code Style

- **Python**: Follow PEP 8. Use type hints.
- **TypeScript**: Use strict TypeScript. No `any` types.
- **React**: Functional components with hooks. Zustand for state.
- **CSS**: Tailwind with semantic tokens (no hardcoded colors).

### Commit Messages

Write clear, concise commit messages:
- `Add annotation reference lines to chart renderer`
- `Fix ordinal x-axis sorting in Observable Plot`
- `Update Postgres connector to handle schema parameter`

### Testing

```bash
# TypeScript type check
cd app && npx tsc --noEmit

# Python tests
pytest tests/
```

## Pull Requests

1. Ensure your code compiles without errors
2. Test your changes manually
3. Write a clear PR description explaining what and why
4. Link any related issues

## Reporting Bugs

Use the GitHub issue tracker. Include:
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS if relevant
- Screenshots for visual bugs

## Feature Requests

Open a GitHub issue with the "feature request" template. Describe:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
