import optional from 'optional';
import extend from 'extend';
import is from 'is';

import { QUERIES_FORMATS } from './constants';
import VirtualType from './virtualType';
import { ValidationError, ERROR_CODES } from './errors';
import {
  FunctionType,
  FuncReturningPromise,
  CustomEntityFunction,
  GenericObject,
  EntityFormatType,
  JSONFormatType,
} from './types';
import { QueryListOptions } from './query';

const Joi = optional('@hapi/joi') || optional('joi');

const IS_QUERY_METHOD: { [key: string]: boolean } = {
  update: true,
  delete: true,
  findOne: true,
};

const DEFAULT_OPTIONS = {
  validateBeforeSave: true,
  explicitOnly: true,
  excludeLargeProperties: false,
  queries: {
    readAll: false,
    format: QUERIES_FORMATS.JSON,
  },
};

const RESERVED_PROPERTY_NAMES: { [key: string]: boolean } = {
  _events: true,
  _eventsCount: true,
  _lazySetupHooks: true,
  _maxListeners: true,
  _posts: true,
  _pres: true,
  className: true,
  constructor: true,
  delete: true,
  domain: true,
  ds: true,
  emit: true,
  entityData: true,
  entityKey: true,
  errors: true,
  excludeFromIndexes: true,
  get: true,
  getEntityDataWithVirtuals: true,
  gstore: true,
  hook: true,
  init: true,
  isModified: true,
  isNew: true,
  listeners: true,
  model: true,
  modelName: true,
  on: true,
  once: true,
  plain: true,
  post: true,
  pre: true,
  removeListener: true,
  removePost: true,
  removePre: true,
  save: true,
  schema: true,
  set: true,
  toObject: true,
  update: true,
  validate: true,
};

/**
 * gstore Schema
 */
class Schema<T extends object = { [key: string]: any }, M extends object = { [key: string]: CustomEntityFunction<T> }> {
  public readonly methods: { [P in keyof M]: CustomEntityFunction<T> };

  public readonly paths: { [P in keyof T]: SchemaPathDefinition };

  public readonly options: SchemaOptions = {};

  public __meta: GenericObject = {};

  public readonly __virtuals: { [key: string]: VirtualType };

  public __callQueue: {
    model: {
      [key: string]: {
        pres: (FuncReturningPromise | FuncReturningPromise[])[];
        post: (FuncReturningPromise | FuncReturningPromise[])[];
      };
    };
    entity: {
      [key: string]: {
        pres: (FuncReturningPromise | FuncReturningPromise[])[];
        post: (FuncReturningPromise | FuncReturningPromise[])[];
      };
    };
  };

  public readonly shortcutQueries: { [key: string]: QueryListOptions<T> };

  public joiSchema?: GenericObject;

  constructor(properties: { [P in keyof T]: SchemaPathDefinition }, options?: SchemaOptions) {
    this.methods = {} as any;
    this.__virtuals = {};
    this.shortcutQueries = {};
    this.paths = {} as { [P in keyof T]: SchemaPathDefinition };
    this.__callQueue = {
      model: {},
      entity: {},
    };

    this.options = Schema.initSchemaOptions(options);

    Object.entries(properties).forEach(([key, definition]) => {
      if (RESERVED_PROPERTY_NAMES[key]) {
        throw new Error(`${key} is reserved and can not be used as a schema pathname`);
      }

      this.paths[key as keyof T] = definition as SchemaPathDefinition;
    });

    if (options) {
      this.joiSchema = Schema.initJoiSchema(properties, this.options.joi);
    }
  }

  /**
   * Add custom methods to entities.
   * @link https://sebloix.gitbook.io/gstore-node/schema/custom-methods
   *
   * @example
   * ```
   * schema.methods.profilePict = function() {
       return this.model('Image').get(this.imgIdx)
   * }
   * ```
  */
  method(name: string | { [key: string]: FunctionType }, fn: FunctionType): void {
    if (typeof name !== 'string') {
      if (typeof name !== 'object') {
        return;
      }
      Object.keys(name).forEach(k => {
        if (typeof name[k] === 'function') {
          this.methods[k as keyof M] = name[k];
        }
      });
    } else if (typeof fn === 'function') {
      this.methods[name as keyof M] = fn;
    }
  }

  queries(type: 'list', settings: QueryListOptions<T>): void {
    this.shortcutQueries[type] = settings;
  }

  /**
   * Getter / Setter for Schema paths.
   *
   * @param {string} propName The entity property
   * @param {SchemaPathDefinition} [definition] The property definition
   * @link https://sebloix.gitbook.io/gstore-node/schema/methods/path
   */
  path(propName: string, definition: SchemaPathDefinition): Schema<T> | SchemaPathDefinition | undefined {
    if (typeof definition === 'undefined') {
      if (this.paths[propName as keyof T]) {
        return this.paths[propName as keyof T];
      }
      return undefined;
    }

    if (RESERVED_PROPERTY_NAMES[propName]) {
      throw new Error(`${propName} is reserved and can not be used as a schema pathname`);
    }

    this.paths[propName as keyof T] = definition;
    return this;
  }

  /**
   * Register a middleware to be executed before "save()", "delete()", "findOne()" or any of your custom method.
   * The callback will receive the original argument(s) passed to the target method. You can modify them
   * in your resolve passing an object with an __override property containing the new parameter(s)
   * for the target method.
   *
   * @param {string} method The target method to add the hook to
   * @param {(...args: any[]) => Promise<any>} fn Function to execute before the target method.
   * It must return a Promise
   * @link https://sebloix.gitbook.io/gstore-node/middleware-hooks/pre-hooks
   */
  pre(method: string, fn: FuncReturningPromise | FuncReturningPromise[]): number {
    const queue = IS_QUERY_METHOD[method] ? this.__callQueue.model : this.__callQueue.entity;

    if (!{}.hasOwnProperty.call(queue, method)) {
      queue[method] = {
        pres: [],
        post: [],
      };
    }

    return queue[method].pres.push(fn);
  }

  /**
   * Register a "post" middelware to execute after a target method.
   *
   * @param {string} method The target method to add the hook to
   * @param {(response: any) => Promise<any>} callback Function to execute after the target method.
   * It must return a Promise
   * @link https://sebloix.gitbook.io/gstore-node/middleware-hooks/post-hooks
   */
  post(method: string, fn: FuncReturningPromise | FuncReturningPromise[]): number {
    const queue = IS_QUERY_METHOD[method] ? this.__callQueue.model : this.__callQueue.entity;

    if (!{}.hasOwnProperty.call(queue, method)) {
      queue[method] = {
        pres: [],
        post: [],
      };
    }

    return queue[method].post.push(fn);
  }

  /**
   * Getter / Setter of a virtual property.
   * Virtual properties are created dynamically and not saved in the Datastore.
   *
   * @param {string} propName The virtual property name
   * @link https://sebloix.gitbook.io/gstore-node/schema/methods/virtual
   */
  virtual(propName: string): VirtualType {
    if (RESERVED_PROPERTY_NAMES[propName]) {
      throw new Error(`${propName} is reserved and can not be used as virtual property.`);
    }
    if (!{}.hasOwnProperty.call(this.__virtuals, propName)) {
      this.__virtuals[propName] = new VirtualType(propName);
    }
    return this.__virtuals[propName];
  }

  /**
   * Executes joi.validate on given data. If the schema does not have a joi config object data is returned.
   *
   * @param {*} data The data to sanitize
   * @returns {*} The data sanitized
   */
  validateJoi(entityData: any): any {
    if (!this.isJoi) {
      return {
        error: new ValidationError(ERROR_CODES.ERR_GENERIC, 'Schema does not have a joi configuration object'),
        value: entityData,
      };
    }
    return this.joiSchema!.validate(entityData, (this.options.joi as JoiConfig).options || {});
  }

  /**
   * Flag that returns "true" if the schema has a joi config object.
   */
  get isJoi(): boolean {
    return !is.undefined(this.joiSchema);
  }

  static initSchemaOptions(provided?: SchemaOptions): SchemaOptions {
    const options = extend(true, {}, DEFAULT_OPTIONS, provided);

    if (options.joi) {
      const joiOptionsDefault = {
        options: {
          allowUnknown: options.explicitOnly !== true,
        },
      };
      if (is.object(options.joi)) {
        options.joi = extend(true, {}, joiOptionsDefault, options.joi);
      } else {
        options.joi = { ...joiOptionsDefault };
      }
      if (!Object.prototype.hasOwnProperty.call((options.joi as JoiConfig).options, 'stripUnknown')) {
        (options.joi as JoiConfig).options!.stripUnknown = (options.joi as JoiConfig).options!.allowUnknown !== true;
      }
    }

    return options;
  }

  static initJoiSchema(
    schema: { [key: string]: SchemaPathDefinition },
    joiConfig?: boolean | JoiConfig,
  ): GenericObject | undefined {
    if (!is.object(joiConfig)) {
      return undefined;
    }

    const hasExtra = is.object((joiConfig as JoiConfig).extra);
    const joiKeys: { [key: string]: SchemaPathDefinition['joi'] } = {};

    Object.entries(schema).forEach(([key, definition]) => {
      if ({}.hasOwnProperty.call(definition, 'joi')) {
        joiKeys[key] = definition.joi;
      }
    });

    let joiSchema = Joi.object().keys(joiKeys);
    let args;

    if (hasExtra) {
      Object.keys((joiConfig as JoiConfig).extra!).forEach(k => {
        if (is.function(joiSchema[k])) {
          args = (joiConfig as JoiConfig).extra![k];
          joiSchema = joiSchema[k](...args);
        }
      });
    }

    return joiSchema;
  }

  /**
   * Custom Schema Types
   */
  static Types = {
    /**
     * Datastore Double object. For long doubles, a string can be provided.
     * @link https://googleapis.dev/nodejs/datastore/latest/Double.html
     */
    Double: 'double',
    /**
     * Datastore Geo Point object.
     * @link https://googleapis.dev/nodejs/datastore/latest/GeoPoint.html
     */
    GeoPoint: 'geoPoint',
    /**
     * Used to reference another entity. See the `populate()` doc.
     * @link https://sebloix.gitbook.io/gstore-node/populate
     */
    Key: 'entityKey',
  };
}

export interface SchemaPathDefinition {
  type?: PropType;
  validate?: Validator;
  optional?: boolean;
  default?: any;
  excludeFromIndexes?: boolean | string | string[];
  read?: boolean;
  excludeFromRead?: string[];
  write?: boolean;
  required?: boolean;
  values?: any[];
  joi?: any;
  ref?: string;
}

export type JoiConfig = { extra?: GenericObject; options?: GenericObject };

export interface SchemaOptions {
  validateBeforeSave?: boolean;
  explicitOnly?: boolean;
  excludeLargeProperties?: boolean;
  queries?: {
    readAll?: boolean;
    format?: JSONFormatType | EntityFormatType;
    showKey?: string;
  };
  joi?: boolean | JoiConfig;
}

export type Validator = string | { rule: string | ((...args: any[]) => boolean); args: any[] };

export type PropType =
  | NumberConstructor
  | StringConstructor
  | ObjectConstructor
  | ArrayConstructor
  | BooleanConstructor
  | DateConstructor
  | typeof Buffer
  | 'double'
  | 'geoPoint'
  | 'entityKey';

export default Schema;
