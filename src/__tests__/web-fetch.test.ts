import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeFetchUrl } from '../security/network.js'

test('web fetch guard blocks private and localhost urls', () => {
  assert.throws(() => assertSafeFetchUrl('http://localhost:3000'), /Localhost/)
  assert.throws(() => assertSafeFetchUrl('http://127.0.0.1'), /Private IPv4/)
  assert.throws(() => assertSafeFetchUrl('http://[::1]/'), /Private IPv6/)
  assert.throws(() => assertSafeFetchUrl('http://[fd00::1]/'), /Private IPv6/)
  assert.throws(() => assertSafeFetchUrl('http://[fe80::1]/'), /Private IPv6/)
  assert.throws(() => assertSafeFetchUrl('file:///tmp/a'), /http\/https/)
})

test('web fetch guard allows public https urls', () => {
  assert.equal(assertSafeFetchUrl('https://example.com/path').hostname, 'example.com')
})
