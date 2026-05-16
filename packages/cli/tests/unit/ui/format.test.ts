import { describe, it, expect } from 'vitest'
import { formatBytes } from '../../../src/ui/format'

describe('formatBytes', () => {
  describe('bytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B')
    })

    it('formats values below 1024 as bytes', () => {
      expect(formatBytes(512)).toBe('512 B')
    })

    it('formats exactly 1023 bytes', () => {
      expect(formatBytes(1023)).toBe('1023 B')
    })
  })

  describe('kilobytes', () => {
    it('formats exactly 1024 bytes as 1.0 KB', () => {
      expect(formatBytes(1024)).toBe('1.0 KB')
    })

    it('formats values in the kilobyte range', () => {
      expect(formatBytes(2048)).toBe('2.0 KB')
    })

    it('formats non-round kilobyte values with one decimal', () => {
      expect(formatBytes(1536)).toBe('1.5 KB')
    })

    it('formats exactly 1 byte below the megabyte threshold', () => {
      expect(formatBytes(1_048_575)).toBe('1024.0 KB')
    })
  })

  describe('megabytes', () => {
    it('formats exactly 1048576 bytes as 1.0 MB', () => {
      expect(formatBytes(1_048_576)).toBe('1.0 MB')
    })

    it('formats large values in megabytes', () => {
      expect(formatBytes(10_485_760)).toBe('10.0 MB')
    })

    it('formats non-round megabyte values with one decimal', () => {
      expect(formatBytes(1_572_864)).toBe('1.5 MB')
    })
  })
})