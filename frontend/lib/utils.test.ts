import { cn } from './utils';

describe('Utility functions', () => {
  describe('cn (tailwind-merge + clsx)', () => {
    it('should merge class names correctly', () => {
      expect(cn('btn', 'btn-primary')).toBe('btn btn-primary');
    });

    it('should handle conditional classes', () => {
      expect(cn('btn', true && 'active', false && 'hidden')).toBe('btn active');
    });

    it('should merge tailwind classes efficiently', () => {
      // tailwind-merge should resolve conflicts
      expect(cn('px-2 py-2', 'p-4')).toBe('p-4');
    });
  });
});
