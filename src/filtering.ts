// Filtering

"use strict";

import { Filter } from "mongodb";
import { GenericFilter } from "tsbean-orm";

function negateMongoQuery(query: Filter<any>): Filter<any> {
    const keys = Object.keys(query);

    for (const key of keys) {
        if (!key.startsWith("$")) {
            query[key] = { $not: query[key] };
        } else if (key === "$and") {
            query.$or = query.$and.map(negateMongoQuery);
            delete query.$and;
        } else if (key === "$or") {
            query.$and = query.$or.map(negateMongoQuery);
            delete query.$or;
        } else if (key === "$not") {
            return query[key];
        }
    }

    return query;
}

/**
 * Parses filter and creates MongoDB filtering expression
 * @param filter Generic filter
 * @returns MongoDB filter
 */
export function filterToMongo(filter: GenericFilter): Filter<any> {
    let query = Object.create(null);

    if (!filter) {
        return Object.create(null);
    }

    switch (filter.operation) {
    case "and":
        query.$and = [];
        for (const subCondition of filter.children) {
            query.$and.push(filterToMongo(subCondition));
        }
        break;
    case "or":
        query.$or = [];
        for (const subCondition of filter.children) {
            query.$or.push(filterToMongo(subCondition));
        }
        break;
    case "not":
        {
            query = negateMongoQuery(filterToMongo(filter.child));
        }
        break;
    case "regex":

        query[filter.key] = {
            $regex: filter.regexp,
        };
        break;
    case "in":
        query[filter.key] = {
            $in: filter.values,
        };
        break;
    case "exists":
        if (filter.exists) {
            query.$and = [{}, {}];
            query.$and[0][filter.key] = {
                $exists: true,
            };
            query.$and[1][filter.key] = {
                $ne: null,
            };
        } else {
            query.$or = [{}, {}];
            query.$or[0][filter.key] = {
                $exists: false,
            };
            query.$or[1][filter.key] = {
                $eq: null,
            };
        }
        break;
    case "eq":
        query[filter.key] = {
            $eq: filter.value,
        };
        break;
    case "ne":
        query[filter.key] = {
            $ne: filter.value,
        };
        break;
    case "gt":
        query[filter.key] = {
            $gt: filter.value,
        };
        break;
    case "lt":
        query[filter.key] = {
            $lt: filter.value,
        };
        break;
    case "gte":
        query[filter.key] = {
            $gte: filter.value,
        };
        break;
    case "lte":
        query[filter.key] = {
            $lte: filter.value,
        };
        break;
    }

    return query;
}

