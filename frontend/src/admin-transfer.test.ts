import { describe, it, expect } from 'vitest'
import { NoPendingAdminError, proposeNewAdmin, acceptAdmin } from './harpocratesRegistry'

describe('SDK Admin Transfer', () => {
  describe('NoPendingAdminError', () => {
    it('should have the correct name', () => {
      expect(NoPendingAdminError.name).toBe('NoPendingAdmin')
    })

    it('should have a message about pending admin', () => {
      expect(NoPendingAdminError.message).toContain('pending admin')
    })
  })

  describe('proposeNewAdmin', () => {
    it('should be a function', () => {
      expect(typeof proposeNewAdmin).toBe('function')
    })
  })

  describe('acceptAdmin', () => {
    it('should be a function', () => {
      expect(typeof acceptAdmin).toBe('function')
    })
  })
})
