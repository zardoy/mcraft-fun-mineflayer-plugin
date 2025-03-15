import { describe, it, expect } from 'vitest'
import { processPacketDataForLogging } from './packetsLogger'

describe('processPacketDataForLogging', () => {
    it('should normalize bigints', () => {
        const data = { a: 0n, b: [2n, 3n], c: { d: Buffer.alloc(10) } }
        const result = processPacketDataForLogging(data)
        expect(result).toBe('{"a":0,"b":[2,3],"c":{"d":{"type":"Buffer","data":[0,0,0,0,0,0,0,0,0,0]}}}')
    })
})
