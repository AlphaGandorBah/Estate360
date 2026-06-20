import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// For future Vitest/RTL integration tests (§7.7) — same handlers back both
// the dev-mode browser mocks and the test suite, so contract drift can't
// happen between them.
export const server = setupServer(...handlers)
