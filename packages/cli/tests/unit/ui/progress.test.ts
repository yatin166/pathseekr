import { describe, it, expect } from 'vitest'
import { formatDuration } from '../../../src/ui/progress'

describe('formatDuration', () => {
  describe('milliseconds', () => {
    it('formats 0ms', () => {
      expect(formatDuration(0)).toBe('0ms')
    })

    it('formats values below 1000ms as milliseconds', () => {
      expect(formatDuration(42)).toBe('42ms')
    })

    it('formats exactly 999ms as milliseconds', () => {
      expect(formatDuration(999)).toBe('999ms')
    })
  })

  describe('seconds', () => {
    it('formats exactly 1000ms as 1.0s', () => {
      expect(formatDuration(1000)).toBe('1.0s')
    })

    it('formats values in the seconds range', () => {
      expect(formatDuration(5000)).toBe('5.0s')
    })

    it('formats non-round second values with one decimal', () => {
      expect(formatDuration(1500)).toBe('1.5s')
    })

    it('formats exactly 59999ms as seconds', () => {
      expect(formatDuration(59_999)).toBe('60.0s')
    })
  })

  describe('minutes', () => {
    it('formats exactly 60000ms as 1m 0s', () => {
      expect(formatDuration(60_000)).toBe('1m 0s')
    })

    it('formats values with remaining seconds', () => {
      expect(formatDuration(90_000)).toBe('1m 30s')
    })

    it('formats multiple minutes correctly', () => {
      expect(formatDuration(125_000)).toBe('2m 5s')
    })

    it('formats exactly 0 remaining seconds', () => {
      expect(formatDuration(120_000)).toBe('2m 0s')
    })
  })
})