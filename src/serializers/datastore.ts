import is from 'is';
import arrify from 'arrify';

import Entity from '../entity';
import Model from '../model';
import { GenericObject, EntityKey, EntityData, IdType } from '../types';

type SaveMethods = 'upsert' | 'insert' | 'update';

type ToDatastoreOptions = { method?: SaveMethods };

type DatastoreFormat = {
  key: EntityKey;
  data: EntityData;
  excludeLargeProperties?: boolean;
  excludeFromIndexes?: string[];
  method?: SaveMethods;
};

const getExcludeFromIndexes = (data: GenericObject, entity: Entity): string[] =>
  Object.entries(data)
    .filter(([, value]) => value !== null)
    .map(([key]) => entity.excludeFromIndexes[key] as string[])
    .filter(v => v !== undefined)
    .reduce((acc: string[], arr) => [...acc, ...arr], []);

const idFromKey = (key: EntityKey): IdType => key.path[key.path.length - 1];

const toDatastore = (entity: Entity, options: ToDatastoreOptions | undefined = {}): DatastoreFormat => {
  const data = Object.entries(entity.entityData).reduce(
    (acc, [key, value]) => {
      if (typeof value !== 'undefined') {
        acc[key] = value;
      }
      return acc;
    },
    {} as { [key: string]: any },
  );

  const excludeFromIndexes = getExcludeFromIndexes(data, entity);

  const datastoreFormat: DatastoreFormat = {
    key: entity.entityKey,
    data,
    excludeLargeProperties: entity.schema.options.excludeLargeProperties,
  };

  if (excludeFromIndexes.length > 0) {
    datastoreFormat.excludeFromIndexes = excludeFromIndexes;
  }

  if (options.method) {
    datastoreFormat.method = options.method;
  }

  return datastoreFormat;
};

const fromDatastore = <F extends 'JSON' | 'ENTITY', R = F extends 'ENTITY' ? Entity : GenericObject>(
  entityData: EntityData,
  model: Model<any>,
  options: { format?: F; readAll?: boolean; showKey?: boolean } = {},
): R => {
  const convertToJson = (): GenericObject => {
    options.readAll = typeof options.readAll === 'undefined' ? false : options.readAll;

    const { schema, gstore } = model;
    const { KEY } = gstore.ds;
    const entityKey = entityData[KEY as any];
    const data: { [key: string]: any } = {
      id: idFromKey(entityKey),
    };
    data[KEY as any] = entityKey;

    Object.keys(entityData).forEach(k => {
      if (options.readAll || !{}.hasOwnProperty.call(schema.paths, k) || schema.paths[k].read !== false) {
        let value = entityData[k];

        if ({}.hasOwnProperty.call(schema.paths, k)) {
          // During queries @google-cloud converts datetime to number
          if (schema.paths[k].type === 'datetime' && is.number(value)) {
            value = new Date(value / 1000);
          }

          // Sanitise embedded objects
          if (
            typeof schema.paths[k].excludeFromRead !== 'undefined' &&
            is.array(schema.paths[k].excludeFromRead) &&
            !options.readAll
          ) {
            schema.paths[k].excludeFromRead!.forEach(prop => {
              const segments = prop.split('.');
              let v = value;

              while (segments.length > 1 && v !== undefined) {
                v = v[segments.shift()!];
              }

              const segment = segments.pop() as string;

              if (v !== undefined && segment in v) {
                delete v[segment];
              }
            });
          }
        }

        data[k] = value;
      }
    });

    if (options.showKey) {
      data.__key = entityKey;
    } else {
      delete data.__key;
    }

    return data;
  };

  const convertToEntity = (): Entity => {
    const key: EntityKey = entityData[model.gstore.ds.KEY as any];
    return model.__model(entityData, undefined, undefined, undefined, key);
  };

  switch (options.format) {
    case 'ENTITY':
      return convertToEntity() as any;
    default:
      return convertToJson() as any;
  }
};

/**
 * Convert one or several entities instance (gstore) to Datastore format
 *
 * @param {any} entities Entity(ies) to format
 * @returns {array} the formated entity(ies)
 */
const entitiesToDatastore = <T extends Entity | Entity[], R = T extends Entity ? DatastoreFormat : DatastoreFormat[]>(
  entities: T,
  options: ToDatastoreOptions | undefined = {},
): R => {
  const isMultiple = is.array(entities);
  const entitiesToArray = arrify(entities);

  if (entitiesToArray[0].className !== 'Entity') {
    // Not an entity instance, nothing to do here...
    return (entities as unknown) as R;
  }

  const result = entitiesToArray.map(e => toDatastore(e, options));

  return isMultiple ? (result as any) : (result[0] as any);
};

export default {
  toDatastore,
  fromDatastore,
  entitiesToDatastore,
};
