import { describe, it, expect } from 'vitest'
import { processPacketDataForLogging } from './packetsLogger'

describe('processPacketDataForLogging', () => {
    it('should normalize bigints', () => {
        const data = { a: 1n, b: [2n, 3n], c: { d: Buffer.alloc(0) } }
        const result = processPacketDataForLogging(data)
        expect(result).toBe('{"a":1,"b":[2,3],"c":{"d":{"type":"Buffer","data":[]}}}')
    })
})
