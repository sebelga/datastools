/* eslint-disable no-unused-expressions */

'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const { argv } = require('yargs');
const gstore = require('../../lib')();
const Entity = require('../../lib/entity');

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const { Schema } = gstore;
const {
    k1, k2, k3, k4, user1,
} = require('./data')(ds);

const allKeys = [k1, k2, k3, k4];

const cleanUp = (cb) => {
    ds.delete(allKeys).then(cb);
};

const addKey = (key) => {
    if (key) {
        allKeys.push(key);
    }
};

describe('Model (Integration Tests)', () => {
    beforeEach(function integrationTest() {
        gstore.models = {};
        gstore.modelSchemas = {};

        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
    });

    afterEach((done) => {
        cleanUp(() => done());
    });

    it('check that Local Datastore is up and running', () => ds.get(k1).then((res) => {
        expect(typeof res[0]).equal('undefined');

        return ds
            .save({ key: k1, data: user1 })
            .then(() => ds.get(k1))
            .then((res2) => {
                expect(res2[0]).deep.equal(user1);
            });
    }));

    it('Schema.read set to false should work as expected', () => {
        const schema = new Schema({
            email: {
                type: String,
                validate: 'isEmail',
                required: true,
            },
            password: {
                type: String,
                validate: {
                    rule: 'isLength',
                    args: [{ min: 8, max: undefined }],
                },
                required: true,
                read: false,
                excludeFromIndexes: true,
            },
            state: {
                type: String,
                default: 'requested',
                write: false,
                read: false,
                excludeFromIndexes: true,
            },
        });

        const User = gstore.model('User', schema);
        const user = new User({ email: 'test@test.com', password: 'abcd1234' });

        return user.save().then((entity) => {
            addKey(entity.entityKey);
            const response = entity.plain();
            expect(response.password).to.not.exist;
            expect(response.requested).to.not.exist;

            const response2 = entity.plain({ readAll: true });
            expect(response2.password).equal('abcd1234');
            expect(response2.state).equal('requested');
        });
    });

    describe('hooks', () => {
        it('post delete hook should set scope on entity instance', (done) => {
            const schema = new Schema({ name: { type: 'string' } });
            schema.post('delete', function postDelete({ key }) {
                expect(key.kind).equal('User');
                expect(key.id).equal(123);
                expect(this instanceof Entity);
                expect(key).equal(this.entityKey);
                done();
                return Promise.resolve();
            });
            const Model = gstore.model('User', schema);
            Model.delete(123).then(() => { });
        });
    });
});
