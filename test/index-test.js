
'use strict';

const chai = require('chai');
const sinon = require('sinon');

const { expect, assert } = chai;

const ds = require('@google-cloud/datastore')({
    namespace: 'com.mydomain',
    apiEndpoint: 'http://localhost:8080',
});

const gstore = require('../lib');
const { Schema } = require('../lib');
const pkg = require('../package.json');
const Transaction = require('./mocks/transaction');

describe('gstore-node', () => {
    let schema;
    let ModelInstance;
    let transaction;

    beforeEach(() => {
        gstore.models = {};
        gstore.modelSchemas = {};

        schema = new Schema({
            name: { type: 'string' },
            email: { type: 'string', read: false },
        });
        ModelInstance = gstore.model('Blog', schema, {});

        transaction = new Transaction();
        sinon.spy(transaction, 'save');
        sinon.spy(transaction, 'commit');
        sinon.spy(transaction, 'rollback');
    });

    afterEach(() => {
        transaction.save.restore();
        transaction.commit.restore();
        transaction.rollback.restore();
    });

    it('should initialized its properties', () => {
        assert.isDefined(gstore.models);
        assert.isDefined(gstore.modelSchemas);
        assert.isDefined(gstore.options);
        assert.isDefined(gstore.Schema);
    });

    it('should save ds instance', () => {
        gstore.connect(ds);
        expect(gstore.ds).to.equal(ds);
    });

    it('should throw an error if ds passed on connect is not a Datastore instance', () => {
        const fn = () => {
            gstore.connect({});
        };

        expect(fn).to.throw();
    });

    describe('should create models', () => {
        beforeEach(() => {
            schema = new gstore.Schema({
                title: { type: 'string' },
            });

            gstore.models = {};
            gstore.modelSchemas = {};
            gstore.options = {};
        });

        it('and add it with its schema to the cache', () => {
            const Model = gstore.model('Blog', schema);

            assert.isDefined(Model);
            assert.isDefined(gstore.models.Blog);
            assert.isDefined(gstore.modelSchemas.Blog);
        });

        it('and convert schema object to Schema class instance', () => {
            schema = {};

            const Model = gstore.model('Blog', schema);

            expect(Model.schema.constructor.name).to.equal('Schema');
        });

        it('and attach schema to compiled Model', () => {
            const Blog = gstore.model('Blog', schema);
            const schemaUser = new gstore.Schema({ name: { type: 'string' } });
            const User = gstore.model('User', schemaUser);

            expect(Blog.schema).not.equal(User.schema);
        });

        it('and not add them to cache if told so', () => {
            const options = { cache: false };

            gstore.model('Image', schema, options);

            assert.isUndefined(gstore.models.Image);
        });

        it('reading them from cache', () => {
            const mockModel = { schema };
            gstore.models.Blog = mockModel;

            const model = gstore.model('Blog', schema);

            expect(model).equal(mockModel);
        });

        it('allowing to pass an existing Schema', () => {
            gstore.modelSchemas.Blog = schema;

            const model = gstore.model('Blog', schema);

            expect(model.schema).to.equal(schema);
        });

        it('and throw error if trying to override schema', () => {
            const newSchema = new gstore.Schema({});
            const mockModel = { schema };
            gstore.models.Blog = mockModel;

            const fn = () => gstore.model('Blog', newSchema);

            expect(fn).to.throw(Error);
        });

        it('and throw error if no Schema is passed', () => {
            const fn = () => gstore.model('Blog');

            expect(fn).to.throw(Error);
        });
    });

    it('should return the models names', () => {
        gstore.models = { Blog: {}, Image: {} };

        const names = gstore.modelNames();

        expect(names).eql(['Blog', 'Image']);
    });

    it('should return the package version', () => {
        const { version } = pkg;

        expect(gstore.version).equal(version);
    });

    it('should return the datastore instance', () => {
        gstore.connect(ds);

        expect(gstore.ds).equal(ds);
    });

    it('should create shortcut of datastore.transaction', () => {
        gstore.connect(ds);
        sinon.spy(ds, 'transaction');

        const trans = gstore.transaction();

        expect(ds.transaction.called).equal(true);
        expect(trans.constructor.name).equal('Transaction');
    });

    describe('save() alias', () => {
        beforeEach(() => {
            sinon.stub(ds, 'save').resolves();
            gstore.connect(ds);
        });

        afterEach(() => {
            ds.save.restore();
        });

        it('should call datastore save passing the arguments', () => (
            gstore.save([1, 2, 3]).then(() => {
                expect(ds.save.called).equal(true);
                expect(ds.save.getCall(0).args).deep.equal([[1, 2, 3]]);
            })
        ));

        it('should convert entity instances to datastore Format', () => {
            const model1 = new ModelInstance({ name: 'John' });
            const model2 = new ModelInstance({ name: 'Mick' });

            return gstore.save([model1, model2]).then(() => {
                const { args } = ds.save.getCall(0);
                const firstEntity = args[0][0];
                assert.isUndefined(firstEntity.className);
                expect(Object.keys(firstEntity)).deep.equal(['key', 'data']);
            });
        });

        it('should work inside a transaction', () => {
            const model1 = new ModelInstance({ name: 'John' });

            gstore.save(model1, transaction);

            expect(transaction.save.called).equal(true);
            expect(ds.save.called).equal(false);
        });

        it('should also work with a callback', () => {
            ds.save.restore();

            sinon.stub(ds, 'save').callsFake((entity, cb) => cb());

            const model = new ModelInstance({ name: 'John' });

            return gstore.save(model, () => {
                const { args } = ds.save.getCall(0);
                const firstEntity = args[0];
                assert.isUndefined(firstEntity.className);
                expect(Object.keys(firstEntity)).deep.equal(['key', 'data']);
            });
        });

        it('should throw an error if no entities passed', () => {
            const func = () => gstore.save();

            expect(func).to.throw('No entities passed');
        });
    });
});
