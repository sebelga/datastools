import chai from 'chai';
import defaultValues from './defaultValues';

const { expect } = chai;

describe('Query Helpers', () => {
  describe('defaultValues constants handler()', () => {
    test('should return the current time', () => {
      const value = defaultValues.NOW;
      const result = defaultValues.__handler__(value) as Date;

      /**
       * we might have a slightly difference, that's ok :)
       */
      const dif = Math.abs(result.getTime() - new Date().getTime());

      expect(dif).to.be.below(100);
    });

    test('should return null if value passed not in map', () => {
      const value = 'DOES_NOT_EXIST';
      const result = defaultValues.__handler__(value);

      expect(result).equal(null);
    });
  });
});
