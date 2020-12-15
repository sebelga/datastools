<img title="logo" src="logo/logo.png" width="75%">

# DEPRECATED - gstore-node

> Entities modeling for Google's Datastore

[![No Maintenance Intended](http://unmaintained.tech/badge.svg)](http://unmaintained.tech/) [![NPM Version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![coveralls-image]][coveralls-url]
[![Commitizen friendly][commitizen-image]][commitizen-url]  

## Deprecated / looking for maintainers

Unfortunately I can't dedicate any more time to this project. No new feature nor bugs will be addressed, for this reason I marked it as deprecated. If you want to be a maintainer and continue the work this will be greatly appreciated! Send me a DM.

[**Documentation**](#documentation) |
[**Example**](#example) |
[**Demo Application**](#demo-app) |
[**Support**](../../issues) |
[**Changelog**](../../releases)

gstore-node is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built **on top** of the **[@google-cloud/datastore](https://googleapis.dev/nodejs/datastore/latest/index.html)** client.  
It is not a replacement of @google-cloud/datastore but a layer on top of it to help modeling your entities through Schemas and to help validating the data saved in the Datastore.

## Highlight

- explicit **Schema declaration** for entities
- properties **type validation**
- properties **value validation**
- **shortcuts** queries
- pre & post **middleware** (hooks)
- **custom methods** on entity instances
- **[Joi](https://github.com/hapijs/joi)** schema definition and validation
- Advanced **[cache layer](https://sebloix.gitbook.io/gstore-node/cache-dataloader/cache)**
- **[Typescript support](https://sebloix.gitbook.io/gstore-node/typescript)**
- :tada: **NEW** [**populate()**](https://sebloix.gitbook.io/gstore-node/populate) support to fetch reference entities and do cross Entity Type "joins" when querying one or multiple entities (since v5.0.0)

> Please don’t forget to star this repo if you found it useful :)

# Installation

```shell
npm install gstore-node --save
# or
yarn add gstore-node
```

**Important**: gstore-node requires Node version **8+**  

# Getting started

Import gstore-node and @google-cloud/datastore and configure your project.  
For the information on how to configure @google-cloud/datastore [read the docs here](https://googleapis.dev/nodejs/datastore/latest/Datastore.html).

```js
const { Gstore } = require('gstore-node');
const { Datastore } = require('@google-cloud/datastore');

const gstore = new Gstore();
const datastore = new Datastore({
    projectId: 'my-google-project-id',
});

// Then connect gstore to the datastore instance
gstore.connect(datastore);
```

After connecting gstore to the datastore, gstore has 2 aliases set up

- `gstore.ds`  
The @google/datastore instance. This means that you can access **all the API** of the Google library when needed.

- `gstore.transaction`. Alias of the same google-cloud/datastore method

<a name="documentation"/>

# Documentation
The [complete documentation](https://sebloix.gitbook.io/gstore-node/)  of gstore-node is in gitbook.  
If you find any mistake in the docs or would like to improve it, [feel free to open a PR](https://github.com/sebelga/gstore-node-docs/pulls).

<a name="example"/>

# Example

Initialize gstore-node in your server file
```js
// server.js

const { Gstore, instances } = require('gstore-node');
const { Datastore } = require('@google-cloud/datastore');

const gstore = new Gstore();
const datastore = new Datastore({
    projectId: 'my-google-project-id',
});

gstore.connect(datastore);

// Save the gstore instance
instances.set('unique-id', gstore);
```

Create your Model

```js
// user.model.js

const { instances } = require('gstore-node');
const bscrypt = require('bcrypt-nodejs');

// Retrieve the gstore instance
const gstore = instances.get('unique-id');
const { Schema } = gstore;

/**
 * A custom validation function for an embedded entity
 */
const validateAccessList = (value, validator) => {
    if (!Array.isArray(value)) {
        return false;
    }

    return value.some((item) => {
        const isValidIp = !validator.isEmpty(item.ip) && validator.isIP(item.ip, 4);
        const isValidHostname = !validator.isEmpty(item.hostname);

        return isValidHostname && isValidIp;
    });
}

/**
 * Create the schema for the User Model
*/
const userSchema = new Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, optional: true  },
    email: { type: String, validate: 'isEmail', required: true },
    password: { type: String, read: false, required: true },
    createdOn: { type: String, default: gstore.defaultValues.NOW, write: false, read: false },
    address: { type: Schema.Types.Key, ref: 'Address' }, // Entity reference
    dateOfBirth: { type: Date },
    bio: { type: String, excludeFromIndexes: true },
    website: { validate: 'isURL', optional: true },
    ip: {
        validate: {
            rule: 'isIP',
            args: [4],
        }
    },
    accessList: {
        validate: {
            rule: validateAccessList,
        }
    },
});

// Or with **Joi** schema definition
// You need to have joi as a dependency of your project ("npm install joi --save")
const userSchema = new Schema({
    firstname: { joi: Joi.string().required() },
    email: { joi: Joi.string().email() },
    password: { joi: Joi.string() },
    ...
}, {
    joi: {
        extra: {
            // validates that when "email" is present, "password" must be too
            when: ['email', 'password'],
        },
    }
});

/**
 * List entities query shortcut
 */
const listSettings = {
    limit: 15,
    order: { property: 'lastname' }
};
userSchema.queries('list', listSettings);

/**
 * Pre "save" middleware
 * Each time the entity is saved or updated, if there is a password passed, it will be hashed
*/
function hashPassword() {
    // scope *this* is the entity instance
    const _this = this;
    const password = this.password;

    if (!password) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        bcrypt.genSalt(5, function onSalt(err, salt) {
            if (err) {
                return reject(err);
            };

            bcrypt.hash(password, salt, null, function onHash(err, hash) {
                if (err) {
                    // reject will *not* save the entity
                    return reject(err);
                };

                _this.password = hash;

                // resolve to go to next middleware or save method
                return resolve();
            });
        });
    });
}

// add the "pre" middleware to the save method
userSchema.pre('save', hashPassword);

/**
 * Export the User Model
 * It will generate "User" entity kind in the Datastore
*/
module.exports = gstore.model('User', userSchema);

```
Use it in your Controller

```js
// user.constroller.js

const User = require('./user.model');

const getUsers = (req ,res) => {
    const pageCursor = req.query.cursor;

    // List users with the Query settings defined on Schema
    User.list({ start: pageCursor })
        .then((entities) => {
            res.json(entities);
        })
        .catch(err => res.status(400).json(err));
};

const getUser = (req, res) => {
    const userId = +req.params.id;
    User.get(userId)
        .populate('address') // Retrieve the reference entity
        .then((entity) => {
            res.json(entity.plain());
        })
        .catch(err => res.status(400).json(err));
};

const createUser = (req, res) => {
    const entityData = User.sanitize(req.body);
    const user = new User(entityData);

    user.save()
        .then((entity) => {
            res.json(entity.plain());
        })
        .catch((err) => {
            // If there are any validation error on the schema
            // they will be in this error object
            res.status(400).json(err);
        })
};

const updateUser = (req, res) => {
    const userId = +req.params.id;
    const entityData = User.sanitize(req.body); // { email: 'john@snow.com' }

    /**
     * This will fetch the entity, merge the data and save it back to the Datastore
    */
    User.update(userId, entityData)
        .then((entity) => {
            res.json(entity.plain());
        })
        .catch((err) => {
            // If there are any validation error on the schema
            // they will be in this error object
            res.status(400).json(err);
        });
};

const deleteUser = (req, res) => {
    const userId = +req.params.id;
    User.delete(userId)
        .then((response) => {
            res.json(response);
        })
        .catch(err => res.status(400).json(err));
};

module.exports = {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser
};

```
<a name="demo-app"/>

# Demo application

If you want to see an example on how to use gstore-node in your Node.js app, check the [demo blog application repository](https://github.com/sebelga/blog-app-googlecloud).

## Meta

Sébastien Loix – [@sebloix](https://twitter.com/sebloix)

Distributed under the MIT license. See `LICENSE` for more information.

[https://github.com/sebelga](https://github.com/sebelga/)  

## Contributing

1. Fork it (<https://github.com/sebelga/gstore-node/fork>)
2. Create your feature branch (`git checkout -b feature/fooBar`)
3. Generate a conventional commit message (`npm run commit`)
4. Push to the branch (`git push origin feature/fooBar`)
5. Rebase your feature branch and squash (`git rebase -i master`)
6. Create a new Pull Request

## Credits
I have been heavily inspired by [Mongoose](https://github.com/Automattic/mongoose) to write gstore. Credits to them for the Schema, Model and Entity
definitions, as well as 'hooks', custom methods and other similarities found here.
Not much could neither have been done without the great work of the guys at [googleapis](https://github.com/googleapis/nodejs-datastore).

[npm-image]: https://img.shields.io/npm/v/gstore-node.svg?style=flat-square
[npm-url]: https://npmjs.org/package/gstore-node
[npm-downloads]: https://img.shields.io/npm/dm/gstore-node.svg?style=flat-square
[travis-image]: https://img.shields.io/travis/sebelga/gstore-node/master.svg?style=flat-square
[travis-url]: https://travis-ci.com/sebelga/gstore-node
[coveralls-image]: https://img.shields.io/coveralls/github/sebelga/gstore-node.svg
[coveralls-url]: https://coveralls.io/github/sebelga/gstore-node?branch=master
[commitizen-image]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]: http://commitizen.github.io/cz-cli/
