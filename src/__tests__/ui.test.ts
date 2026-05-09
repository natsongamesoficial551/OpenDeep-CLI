import test from 'node:test'
import assert from 'node:assert/strict'
import { box, padVisible } from '../ui/terminal.js'

test('pads visible terminal text', () => {
  assert.equal(padVisible('abc', 5), 'abc  ')
})

test('renders a terminal box', () => {
  const rendered = box('Title', 'hello', { width: 32 })
  assert.match(rendered, /Title/)
  assert.match(rendered, /hello/)
})
