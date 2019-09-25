'use strict';

const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');
const { Gstore } = require('../../lib');

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
const gstore = new Gstore();
gstore.connect(ds);

const { Schema } = gstore;
const { expect, assert } = chai;
const userSchema = new Schema({ address: { type: Schema.Types.Key } });
const addressBookSchema = new Schema({ label: { type: String } });
const addressSchema = new Schema({
  city: { type: String },
  country: { type: String },
  addressBook: { type: Schema.Types.Key },
});
const chance = new Chance();

let generatedIds = [];
const allKeys = [];

const UserModel = gstore.model('EntityTests-User', userSchema);
const AddressModel = gstore.model('EntityTests-Address', addressSchema);
const AddressBookModel = gstore.model('EntityTests-AddressBook', addressBookSchema);

const getId = () => {
  const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });
  if (generatedIds.indexOf(id) >= 0) {
    return getId();
  }
  generatedIds.push(id);
  return id;
};

const getAddressBook = () => {
  const key = AddressBookModel.key(getId());
  allKeys.push(key);
  const data = { label: chance.string() };
  const addressBook = new AddressBookModel(data, null, null, null, key);
  return addressBook;
};

const getAddress = (addressBookEntity = null) => {
  const key = AddressModel.key(getId());
  allKeys.push(key);
  const data = { city: chance.city(), country: chance.country(), addressBook: addressBookEntity.entityKey };
  const address = new AddressModel(data, null, null, null, key);
  return address;
};

const getUser = (addressEntity, id = getId()) => {
  const key = UserModel.key(id);
  allKeys.push(key);
  const data = { address: addressEntity.entityKey };
  const user = new UserModel(data, null, null, null, key);
  return user;
};

const cleanUp = () =>
  ds
    .delete(allKeys)
    .then(() => Promise.all([UserModel.deleteAll(), AddressModel.deleteAll(), AddressBookModel.deleteAll()]))
    .catch(err => {
                console.log('Error cleaning up'); // eslint-disable-line
                console.log(err); // eslint-disable-line
    });

describe('Entity (Integration Tests)', () => {
  const addressBook = getAddressBook();
  const address = getAddress(addressBook);
  let user;

  before(() => {
    generatedIds = [];
    return gstore.save([addressBook, address]);
  });

  after(() => cleanUp());

  beforeEach(() => {
    user = getUser(address);
  });

  describe('save()', () => {
    it('should replace a populated ref to its key before saving', () =>
      user
        .populate()
        .then(() => user.save())
        .then(() => UserModel.get(user.entityKey.name))
        .then(entityFetched => {
          expect(entityFetched.entityData.address).deep.equal(address.entityKey);
        }));

    it('should add the id or name to the entity', async () => {
      const entity1 = await user.save();
      expect(entity1.id).equal(entity1.entityKey.name);

      const user2 = getUser(address, 1234);
      const entity2 = await user2.save();

      expect(entity2.id).equal(entity2.entityKey.id);
    });
  });

  describe('populate()', () => {
    it('should populate the user address', () =>
      user
        .populate()
        .populate('unknown') // allow chaining populate() calls
        .then(() => {
          expect(user.address.city).equal(address.city);
          expect(user.address.country).equal(address.country);
          expect(user.entityData.unknown).equal(null);
        }));

    it('should only populate the user address country', () =>
      user.populate('address', 'country').then(() => {
        expect(user.address.country).equal(address.country);
        assert.isUndefined(user.address.city);
      }));

    it('should allow deep fetching', () =>
      user
        .populate()
        .populate('address.addressBook', ['label', 'unknown'])
        .then(() => {
          expect(user.address.city).equal(address.city);
          expect(user.address.country).equal(address.country);
          expect(user.address.addressBook.label).equal(addressBook.label);
          expect(user.address.addressBook.unknown).equal(null);
        }));
  });
});
