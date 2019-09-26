import { Datastore, Transaction, Query as DatastoreQuery } from '@google-cloud/datastore';
import is from 'is';
import arrify from 'arrify';

import { GstoreQuery, QueryListOptions } from '../query';
import { EntityData } from '../types';
import Model from '../model';

const buildQueryFromOptions = <T, Outputformat>(
  query: GstoreQuery<EntityData<T>, Outputformat>,
  options: QueryListOptions<T>,
  ds: Datastore,
): GstoreQuery<EntityData<T>, Outputformat> => {
  if (!query || query.constructor.name !== 'Query') {
    throw new Error('Query not passed');
  }

  if (!options || typeof options !== 'object') {
    return query;
  }

  if (options.limit) {
    query.limit(options.limit);
  }

  if (options.offset) {
    query.offset(options.offset);
  }

  if (options.order) {
    const orderArray = arrify(options.order);
    orderArray.forEach(order => {
      query.order(order.property, {
        descending: {}.hasOwnProperty.call(order, 'descending') ? order.descending : false,
      });
    });
  }

  if (options.select) {
    query.select(options.select);
  }

  if (options.ancestors) {
    if (!ds || ds.constructor.name !== 'Datastore') {
      throw new Error('Datastore instance not passed');
    }

    const ancestorKey = options.namespace
      ? ds.key({ namespace: options.namespace, path: options.ancestors.slice() })
      : ds.key(options.ancestors.slice());

    query.hasAncestor(ancestorKey);
  }

  if (options.filters) {
    if (!is.array(options.filters)) {
      throw new Error('Wrong format for filters option');
    }

    if (!is.array(options.filters[0])) {
      options.filters = [options.filters];
    }

    if (options.filters[0].length > 1) {
      options.filters.forEach(filter => {
        // We check if the value is a function
        // if it is, we execute it.
        let value = filter[filter.length - 1];
        value = is.fn(value) ? value() : value;
        const f = filter.slice(0, -1).concat([value]);

        (query.filter as any)(...f);
      });
    }
  }

  if (options.start) {
    query.start(options.start);
  }

  return query;
};

const createDatastoreQueryForModel = <T extends object, M extends object>(
  model: Model<T, M>,
  namespace?: string,
  transaction?: Transaction,
): DatastoreQuery => {
  if (transaction && transaction.constructor.name !== 'Transaction') {
    throw Error('Transaction needs to be a gcloud Transaction');
  }

  const createQueryArgs: any[] = [model.entityKind];

  if (namespace) {
    createQueryArgs.unshift(namespace);
  }

  if (transaction) {
    return (transaction.createQuery as any)(...createQueryArgs);
  }

  return model.gstore.ds.createQuery(...createQueryArgs);
};

export default {
  buildQueryFromOptions,
  createDatastoreQueryForModel,
};
