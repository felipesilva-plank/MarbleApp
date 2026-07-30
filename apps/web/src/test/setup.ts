import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'

/**
 * jsdom ships a `crypto` without `subtle`, but the auth adapter derives PBKDF2 hashes with it.
 * Swap in Node's WebCrypto so the tests exercise the real hashing path rather than a stub.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  cleanup()
})
