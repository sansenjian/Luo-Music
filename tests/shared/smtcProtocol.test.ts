import { describe, expect, it } from 'vitest'

import { parseSmtcEventLine } from '@shared/smtc/protocol'

describe('SMTC protocol parsing', () => {
  it('validates ready event payload shape', () => {
    expect(parseSmtcEventLine('{"type":"ready","payload":{"protocolVersion":1}}')).toEqual({
      type: 'ready',
      payload: { protocolVersion: 1 }
    })
    expect(parseSmtcEventLine('{"type":"ready"}')).toBeNull()
    expect(parseSmtcEventLine('{"type":"ready","payload":{"protocolVersion":"1"}}')).toBeNull()
  })

  it('validates helper log level values', () => {
    expect(parseSmtcEventLine('{"type":"log","level":"warn","message":"hello"}')).toEqual({
      type: 'log',
      level: 'warn',
      message: 'hello'
    })
    expect(parseSmtcEventLine('{"type":"log","message":"hello"}')).toBeNull()
    expect(parseSmtcEventLine('{"type":"log","level":"verbose","message":"hello"}')).toBeNull()
  })
})
