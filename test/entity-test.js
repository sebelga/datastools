'use strict';

const chai = require('chai');
const sinon = require('sinon');
const Joi = require('joi');

const ds = require('@google-cloud/datastore')({
    namespace: 'com.mydomain',
    apiEndpoint: 'http://localhost:8080',
});
const datastoreSerializer = require('../lib/serializer').Datastore;
const gstore = require('../lib')({ namespace: 'entity-no-cache' });
const gstoreWithCache = require('../')({ namespace: 'entity-with-cache', cache: { config: { ttl: { keys: 600 } } } });
const { Schema } = require('../lib')();

const { expect, assert } = chai;

describe('Entity', () => {
    let schema;
    let ModelInstance;

    beforeEach(() => {
        gstore.models = {};
        gstore.modelSchemas = {};
        gstore.options = {};
        gstore.connect(ds);
        gstoreWithCache.connect(ds);

        schema = new Schema({
            name: { type: 'string', default: 'Mick' },
            lastname: { type: 'string' },
            password: { type: 'string', read: false },
        });

        schema.virtual('fullname').get(function getFullName() {
            return `${this.name} ${this.lastname}`;
        });

        schema.virtual('fullname').set(function setFullName(name) {
            const split = name.split(' ');
            [this.name, this.lastname] = split;
        });

        ModelInstance = gstore.model('User', schema);

        sinon.stub(ds, 'save').resolves();
    });

    afterEach(() => {
        ds.save.restore();
    });

    describe('intantiate', () => {
        it('should initialized properties', () => {
            const entity = new ModelInstance({}, 'keyid');

            assert.isDefined(entity.entityData);
            assert.isDefined(entity.entityKey);
            assert.isDefined(entity.schema);
            assert.isDefined(entity.pre);
            assert.isDefined(entity.post);
            expect(entity.excludeFromIndexes).deep.equal([]);
        });

        it('should add data passed to entityData', () => {
            const entity = new ModelInstance({ name: 'John' });
            expect(entity.entityData.name).to.equal('John');
        });

        it('should have default if no data passed', () => {
            const entity = new ModelInstance();
            expect(entity.entityData.name).to.equal('Mick');
        });

        it('should not add any data if nothing is passed', () => {
            schema = new Schema({
                name: { type: 'string', optional: true },
            });
            ModelInstance = gstore.model('BlogPost', schema);

            const entity = new ModelInstance();

            expect(Object.keys(entity.entityData).length).to.equal(0);
        });

        it('should set default values or null from schema', () => {
            function fn() {
                return 'generatedValue';
            }

            schema = new Schema({
                name: { type: 'string', default: 'John' },
                lastname: { type: 'string' },
                email: { optional: true },
                generatedValue: { type: 'string', default: fn },
                availableValues: { values: ['a', 'b', 'c'] },
                availableValuesRequired: { values: ['a', 'b', 'c'], required: true },
            });

            ModelInstance = gstore.model('BlogPost', schema);

            const entity = new ModelInstance({});

            expect(entity.entityData.name).equal('John');
            expect(entity.entityData.lastname).equal(null);
            expect(entity.entityData.email).equal(undefined);
            expect(entity.entityData.generatedValue).equal('generatedValue');
            expect(entity.entityData.availableValues).equal('a');
            expect(entity.entityData.availableValuesRequired).equal(null);
        });

        it('should set values from Joi schema', () => {
            const generateFullName = context => (
                `${context.name} ${context.lastname}`
            );

            schema = new Schema({
                name: { joi: Joi.string() },
                lastname: { joi: Joi.string().default('Jagger') },
                fullname: { joi: Joi.string().default(generateFullName, 'generated fullname') },
            }, { joi: true });

            ModelInstance = gstore.model('EntityKind', schema);

            const user = new ModelInstance({ name: 'Mick' });

            expect(user.entityData.lastname).equal('Jagger');
            expect(user.entityData.fullname).equal('Mick Jagger');
        });

        it('should not set default if Joi validation does not pass', () => {
            schema = new Schema({
                name: { joi: Joi.string().default('test').required() },
                lastname: { joi: Joi.string().default('Jagger') },
                age: { joi: Joi.number() },
            }, { joi: true });

            ModelInstance = gstore.model('EntityKind', schema);

            const user = new ModelInstance({ age: 77 });

            expect(user.age).equal(77);
            assert.isUndefined(user.entityData.lastname);
        });

        it('should call handler for default values in gstore.defaultValues constants', () => {
            sinon.spy(gstore.defaultValues, '__handler__');
            schema = new Schema({
                createdOn: { type: 'dateTime', default: gstore.defaultValues.NOW },
            });
            ModelInstance = gstore.model('BlogPost', schema);
            const entity = new ModelInstance({});

            expect(gstore.defaultValues.__handler__.calledOnce).equal(true);
            return entity;
        });

        it('should not add default to optional properties', () => {
            schema = new Schema({
                name: { type: 'string' },
                email: { optional: true },
            });
            ModelInstance = gstore.model('BlogPost', schema);

            const entity = new ModelInstance({});

            expect(entity.entityData.email).equal(undefined);
        });

        it('should create its array of excludeFromIndexes', () => {
            schema = new Schema({
                name: { excludeFromIndexes: true },
                age: { excludeFromIndexes: true, type: 'int' },
                embedded: { excludeFromIndexes: ['prop1', 'prop2'] },
                arrayValue: { excludeFromIndexes: 'property', type: 'array' },
                // Array in @google-cloud have to be set on the data value
                arrayValue2: { excludeFromIndexes: true, type: 'array' },
                arrayValue3: { excludeFromIndexes: true, joi: Joi.array() },
            });
            ModelInstance = gstore.model('BlogPost', schema);

            const entity = new ModelInstance({ name: 'John' });

            expect(entity.excludeFromIndexes).deep.equal([
                'name', 'age', 'embedded.prop1', 'embedded.prop2', 'arrayValue[].property',
            ]);
        });

        describe('should create Datastore Key', () => {
            let Model;

            beforeEach(() => {
                sinon.spy(ds, 'key');

                Model = gstore.model('BlogPost', schema);
            });

            afterEach(() => {
                ds.key.restore();
            });

            it('---> with a full Key (String keyname passed)', () => {
                const entity = new Model({}, 'keyid');

                expect(entity.entityKey.kind).equal('BlogPost');
                expect(entity.entityKey.name).equal('keyid');
            });

            it('---> with a full Key (String with including numbers)', () => {
                const entity = new Model({}, '123:456');

                expect(entity.entityKey.name).equal('123:456');
            });

            it('---> with a full Key (Integer keyname passed)', () => {
                const entity = new Model({}, 123);

                expect(entity.entityKey.id).equal(123);
            });

            it('---> with a full Key ("string" Integer keyname passed)', () => {
                const entity = new Model({}, '123');

                expect(entity.entityKey.id).equal('123');
            });

            it('---> with a full Key ("string" Integer **not** converted)', () => {
                schema = new Schema({
                    name: { type: 'string' },
                }, { keyType: 'name' });
                Model = gstore.model('EntityKind', schema);

                const entity = new Model({}, '123');

                expect(entity.entityKey.name).equal('123');
            });

            it('---> throw error is id passed is not string or number', () => {
                const fn = () => {
                    const entity = new Model({}, {});
                    return entity;
                };

                expect(fn).throw(Error);
            });

            it('---> with a partial Key (auto-generated id)', () => {
                const model = new Model({});

                expect(model.entityKey.kind).to.deep.equal('BlogPost');
            });

            it('---> with an ancestor path (auto-generated id)', () => {
                const entity = new Model({}, null, ['Parent', 1234]);

                expect(entity.entityKey.parent.kind).equal('Parent');
                expect(entity.entityKey.parent.id).equal(1234);
                expect(entity.entityKey.kind).equal('BlogPost');
            });

            it('---> with an ancestor path (manual id)', () => {
                const entity = new Model({}, 'entityKind', ['Parent', 1234]);

                expect(entity.entityKey.parent.kind).equal('Parent');
                expect(entity.entityKey.parent.id).equal(1234);
                expect(entity.entityKey.kind).equal('BlogPost');
                expect(entity.entityKey.name).equal('entityKind');
            });

            it('---> with a namespace', () => {
                const model = new Model({}, null, null, 'com.otherdomain');

                expect(model.entityKey.namespace).equal('com.otherdomain');
            });

            it('---> with a gcloud Key', () => {
                const key = ds.key('BlogPost', 1234);

                const entity = new Model({}, null, null, null, key);

                expect(entity.entityKey).equal(key);
            });

            it('---> throw error if key is not instance of Key', () => {
                function fn() {
                    const entity = new Model({}, null, null, null, {});
                    return entity;
                }

                expect(fn).to.throw();
            });
        });

        describe('should register schema hooks', () => {
            let Model;
            let entity;
            let spyOn;

            beforeEach(() => {
                spyOn = {
                    fnHookPre: () => Promise.resolve(),
                    fnHookPost: () => Promise.resolve({ __override: 1234 }),
                };

                sinon.spy(spyOn, 'fnHookPre');
                sinon.spy(spyOn, 'fnHookPost');
            });

            afterEach(() => {
                spyOn.fnHookPost.restore();
                spyOn.fnHookPre.restore();
            });

            it('should call pre hooks before saving and override arguments', () => {
                schema.pre('save', spyOn.fnHookPre);
                Model = gstore.model('BlogPost', schema);
                entity = new Model({ name: 'John' });

                return entity.save().then(() => {
                    expect(spyOn.fnHookPre.callCount).to.equal(1);
                });
            });

            it('should call pre and post hooks on custom method', () => {
                schema.method('newmethod', () => Promise.resolve());
                schema.pre('newmethod', spyOn.fnHookPre);
                schema.post('newmethod', spyOn.fnHookPost);
                Model = gstore.model('BlogPost', schema);
                entity = new Model({ name: 'John' });

                return entity.newmethod().then(() => {
                    expect(spyOn.fnHookPre.callCount).to.equal(1);
                    expect(spyOn.fnHookPost.callCount).to.equal(1);
                });
            });

            it('should call post hooks after saving and override resolve', () => {
                schema.post('save', spyOn.fnHookPost);
                Model = gstore.model('BlogPost', schema);
                entity = new Model({});

                return entity.save().then((result) => {
                    expect(spyOn.fnHookPost.called).equal(true);
                    expect(result).equal(1234);
                });
            });

            it('should not do anything if no hooks on schema', () => {
                schema.callQueue = { model: {}, entity: {} };
                Model = gstore.model('BlogPost', schema);
                entity = new Model({ name: 'John' });

                assert.isUndefined(entity.__pres);
                assert.isUndefined(entity.__posts);
            });

            it('should not register unknown methods', () => {
                schema.callQueue = { model: {}, entity: {} };
                schema.pre('unknown', () => { });
                Model = gstore.model('BlogPost', schema);
                entity = new Model({});

                assert.isUndefined(entity.__pres);
                assert.isUndefined(entity.__posts);
            });
        });
    });

    describe('get / set', () => {
        let user;

        beforeEach(() => {
            user = new ModelInstance({ name: 'John', lastname: 'Snow' });
        });

        it('should get an entityData property', () => {
            const name = user.get('name');

            expect(name).equal('John');
        });

        it('should return virtual', () => {
            const fullname = user.get('fullname');

            expect(fullname).equal('John Snow');
        });

        it('should set an entityData property', () => {
            user.set('name', 'Gregory');

            const name = user.get('name');

            expect(name).equal('Gregory');
        });

        it('should set virtual', () => {
            user.set('fullname', 'Peter Jackson');

            expect(user.entityData.name).equal('Peter');
        });

        it('should get data on entity properties from the entity data', () => {
            ModelInstance = gstore.model('BlogPost', schema);

            const entity = new ModelInstance({
                name: 'Jane',
                lastname: 'Does',
                password: 'JanesPassword',
            });

            expect(entity.name).to.equal('Jane');
            expect(entity.lastname).to.equal('Does');
            expect(entity.password).to.equal('JanesPassword');
        });

        it('should reflect changes to entity properties in the entity data', () => {
            ModelInstance = gstore.model('BlogPost', schema);

            const entity = new ModelInstance({
                name: 'Jane',
                lastname: 'Does',
                password: 'JanesPassword',
            });

            entity.name = 'John';
            entity.lastname = 'Doe';
            entity.password = 'JoesPassword';

            expect(entity.entityData.name).to.equal('John');
            expect(entity.entityData.lastname).to.equal('Doe');
            expect(entity.entityData.password).to.equal('JoesPassword');
        });
    });

    describe('plain()', () => {
        beforeEach(() => {
            sinon.spy(datastoreSerializer, 'fromDatastore');
        });

        afterEach(() => {
            datastoreSerializer.fromDatastore.restore();
        });

        it('should throw an error is options is not of type Object', () => {
            const fn = () => {
                const model = new ModelInstance({ name: 'John' });
                model.plain(true);
            };

            expect(fn).throw(Error);
        });

        it('should call datastoreSerializer "fromDatastore"', () => {
            const model = new ModelInstance({ name: 'John', password: 'test' });
            const { entityData } = model;

            const output = model.plain();

            expect(datastoreSerializer.fromDatastore.getCall(0).args[0]).deep.equal(entityData);
            expect(datastoreSerializer.fromDatastore.getCall(0).args[1]).deep.equal({ readAll: false, showKey: false });
            assert.isUndefined(output.password);
        });

        it('should call datastoreSerializer "fromDatastore" passing readAll parameter', () => {
            const model = new ModelInstance({ name: 'John', password: 'test' });

            const output = model.plain({ readAll: true });

            expect(datastoreSerializer.fromDatastore.getCall(0).args[1]).deep.equal({ readAll: true, showKey: false });
            assert.isDefined(output.password);
        });

        it('should pass showKey parameter', () => {
            const model = new ModelInstance({});

            model.plain({ showKey: true });

            expect(datastoreSerializer.fromDatastore.getCall(0).args[1]).deep.equal({ readAll: false, showKey: true });
        });

        it('should add virtuals', () => {
            const model = new ModelInstance({ name: 'John' });
            sinon.spy(model, 'getEntityDataWithVirtuals');

            model.plain({ virtuals: true });

            expect(model.getEntityDataWithVirtuals.called).equal(true);
        });

        it('should clear embedded object excluded properties', () => {
            schema = new Schema({
                embedded: { excludeFromRead: ['prop1', 'prop2'] },
            });

            ModelInstance = gstore.model('HasEmbedded', schema);

            const entity = new ModelInstance({ embedded: { prop1: '1', prop2: '2', prop3: '3' } });
            const plain = entity.plain({});

            expect(typeof plain.embedded.prop1).equal('undefined');
            expect(typeof plain.embedded.prop2).equal('undefined');
            expect(plain.embedded.prop3).equal('3');
        });

        it('should clear nested embedded object excluded properties', () => {
            schema = new Schema({
                embedded: { excludeFromRead: ['prop1', 'prop2.p1', 'prop3.p1.p11'] },
            });

            ModelInstance = gstore.model('HasEmbedded', schema);

            const entity = new ModelInstance({
                embedded: {
                    prop1: '1',
                    prop2: { p1: 'p1', p2: 'p2' },
                    prop3: { p1: { p11: 'p11', p12: 'p12' }, p2: 'p2' },
                    prop4: '4',
                },
            });

            const plain = entity.plain({});

            expect(typeof plain.embedded.prop1).equal('undefined');
            expect(typeof plain.embedded.prop2).equal('object');
            expect(typeof plain.embedded.prop2.p1).equal('undefined');
            expect(plain.embedded.prop2.p2).equal('p2');
            expect(typeof plain.embedded.prop3).equal('object');
            expect(typeof plain.embedded.prop3.p1).equal('object');
            expect(typeof plain.embedded.prop3.p1.p11).equal('undefined');
            expect(plain.embedded.prop3.p1.p12).equal('p12');
            expect(plain.embedded.prop3.p2).equal('p2');
            expect(plain.embedded.prop4).equal('4');
        });
    });

    describe('datastoreEntity()', () => {
        it('should get the data from the Datastore and merge it into the entity', () => {
            const mockData = { name: 'John' };
            sinon.stub(ds, 'get').resolves([mockData]);

            const model = new ModelInstance({});

            return model.datastoreEntity().then((entity) => {
                expect(ds.get.called).equal(true);
                expect(ds.get.getCall(0).args[0]).equal(model.entityKey);
                expect(entity.className).equal('Entity');
                expect(entity.entityData).equal(mockData);

                ds.get.restore();
            });
        });

        it('should return 404 not found if no entity returned', () => {
            sinon.stub(ds, 'get').resolves([]);

            const model = new ModelInstance({});

            return model.datastoreEntity().catch((err) => {
                expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
                expect(err.message).equal('Entity not found');
                ds.get.restore();
            });
        });

        it('should return 404 not found if no entity returned (2)', () => {
            sinon.stub(ds, 'get').resolves();

            const model = new ModelInstance({});

            return model.datastoreEntity().catch((err) => {
                expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
                ds.get.restore();
            });
        });

        it('should bubble up error fetching the entity', () => {
            const error = { code: 500, message: 'Something went bad' };
            sinon.stub(ds, 'get').rejects(error);

            const model = new ModelInstance({});

            return model.datastoreEntity().catch((err) => {
                expect(err).equal(error);

                ds.get.restore();
            });
        });

        it('should still work with a callback', () => {
            const mockData = { name: 'John' };
            sinon.stub(ds, 'get').resolves([mockData]);

            const model = new ModelInstance({});

            return model.datastoreEntity((err, entity) => {
                expect(ds.get.called).equal(true);
                expect(ds.get.getCall(0).args[0]).equal(model.entityKey);
                expect(entity.className).equal('Entity');
                expect(entity.entityData).equal(mockData);

                ds.get.restore();
            });
        });

        context('when cache is active', () => {
            let key;
            let mockData;

            beforeEach(() => {
                gstore.cache = gstoreWithCache.cache;

                key = ModelInstance.key(123);
                mockData = { name: 'John' };
                mockData[gstore.ds.KEY] = key;
            });

            afterEach(() => {
                // empty the cache
                gstore.cache.reset();
                delete gstore.cache;
            });

            it('should get value from cache', () => {
                const value = mockData;
                const entity = new ModelInstance(mockData);
                entity.entityKey = key;

                sinon.spy(entity.gstore.cache.keys, 'read');
                sinon.stub(ds, 'get').resolves([mockData]);

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        entity.datastoreEntity({ ttl: 123456 })
                            .then((response) => {
                                assert.ok(!ds.get.called);
                                expect(response.entityData).include(value);
                                assert.ok(entity.gstore.cache.keys.read.called);
                                const { args } = entity.gstore.cache.keys.read.getCall(0);
                                expect(args[0]).equal(key);
                                expect(args[1].ttl).equal(123456);

                                entity.gstore.cache.keys.read.restore();
                                ds.get.restore();
                            })
                    ));
            });

            it('should **not** get value from cache', () => {
                const value = mockData;
                const entity = new ModelInstance(mockData);
                entity.entityKey = key;

                sinon.spy(entity.gstore.cache.keys, 'read');
                sinon.stub(ds, 'get').resolves([mockData]);

                return gstore.cache.keys.set(key, value)
                    .then(() => (
                        entity.datastoreEntity({ cache: false })
                            .then(() => {
                                assert.ok(ds.get.called);
                                assert.ok(!entity.gstore.cache.keys.read.called);

                                entity.gstore.cache.keys.read.restore();
                                ds.get.restore();
                            })
                    ));
            });
        });
    });

    describe('model()', () => {
        it('should be able to return model instances', () => {
            const imageSchema = new Schema({});
            const ImageModel = gstore.model('Image', imageSchema);

            const blog = new ModelInstance({});

            expect(blog.model('Image')).equal(ImageModel);
        });

        it('should be able to execute methods from other model instances', () => {
            const imageSchema = new Schema({});
            const ImageModel = gstore.model('Image', imageSchema);
            const mockEntities = [{ key: ds.key(['BlogPost', 1234]) }];

            sinon.stub(ImageModel, 'get').callsFake((cb) => {
                cb(null, mockEntities[0]);
            });

            const blog = new ModelInstance({});

            blog.model('Image').get((err, entity) => {
                expect(entity).equal(mockEntities[0]);
            });
        });
    });

    describe('getEntityDataWithVirtuals()', () => {
        let model;
        let User;

        beforeEach(() => {
            schema = new Schema({ firstname: {}, lastname: {} });

            schema.virtual('fullname').get(function getFullName() {
                return `${this.firstname} ${this.lastname}`;
            });

            schema.virtual('fullname').set(function setFullName(name) {
                const split = name.split(' ');
                [this.firstname, this.lastname] = split;
            });

            User = gstore.model('Client', schema);

            model = new User({ firstname: 'John', lastname: 'Snow' });
        });

        it('should add add virtuals on instance', () => {
            assert.isDefined(model.fullname);
        });

        it('setting on instance should modify entityData', () => {
            expect(model.fullname).equal('John Snow');
        });

        it('should add virtuals properties on entity instance', () => {
            expect(model.fullname).equal('John Snow');
            model.firstname = 'Mick';
            expect(model.fullname).equal('Mick Snow');
            model.fullname = 'Andre Agassi';
            expect(model.firstname).equal('Andre');
            expect(model.lastname).equal('Agassi');
            expect(model.entityData).deep.equal({ firstname: 'Andre', lastname: 'Agassi' });
        });

        it('should Not override', () => {
            model = new User({ firstname: 'John', lastname: 'Snow', fullname: 'Jooohn' });
            const entityData = model.getEntityDataWithVirtuals();

            expect(entityData.fullname).equal('Jooohn');
        });

        it('should read and parse virtual (set)', () => {
            model = new User({ fullname: 'John Snow' });

            const entityData = model.getEntityDataWithVirtuals();

            expect(entityData.firstname).equal('John');
            expect(entityData.lastname).equal('Snow');
        });

        it('should override existing', () => {
            model = new User({ firstname: 'Peter', fullname: 'John Snow' });

            const entityData = model.getEntityDataWithVirtuals();

            expect(entityData.firstname).equal('John');
        });

        it('should not allow reserved name for virtuals', () => {
            const func = () => {
                schema.virtual('plain').get(function getFullName() {
                    return `${this.firstname} ${this.lastname}`;
                });
            };

            expect(func).throws();
        });
    });
});
