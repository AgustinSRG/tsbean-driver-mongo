// Driver implementation

"use strict";

import { Filter, FindCursor, MongoClient } from "mongodb";
import { Readable } from "stream";
import { DataSourceDriver, DataSource, GenericKeyValue, GenericRow, SortDirection, GenericFilter } from "tsbean-orm";
import { filterToMongo } from "./filtering";


/**
 * Driver class
 */
export class MongoDriver implements DataSourceDriver {

    /**
     * Creates a data source for this driver
     * @param url Connection URL
     * @returns The data source
     */
    public static createDataSource(url: string): DataSource {
        const driver = new MongoDriver(url);
        return new DataSource("tsbean.driver.mongo", driver);
    }

    public url: string;
    public mongoClient: MongoClient;

    constructor(url: string) {
        this.url = url;
        this.mongoClient = new MongoClient(this.url, {
            forceServerObjectId: true,
        });
    }

    async connect(): Promise<MongoClient> {
        return this.mongoClient.connect();
    }

    /**
     * Finds a row by primary key
     * @param table Table or collection name
     * @param keyName Name of the key
     * @param keyValue Value of the key
     */
    async findByKey(table: string, keyName: string, keyValue: any): Promise<GenericRow> {
        const client = await this.connect()
        const db = client.db().collection(table);
        const filter: Filter<any> = Object.create(null);
        filter[keyName] = keyValue;
        const doc = await db.findOne(filter);

        return doc;
    }

    private generateFindSentence(table: string, filter: GenericFilter, sortBy: string, sortDir: SortDirection, projection: Set<string>): { filter: Filter<any>, projection: any, sort: any } {
        let mongoProjection = null;
        let mongoSort = null;

        if (projection) {
            const toProject = projection.keys();
            mongoProjection = Object.create(null);
            for (const f of toProject) {
                mongoProjection[f] = 1;
            }
        }

        if (sortBy) {
            mongoSort = Object.create(null);
            mongoSort[sortBy] = (sortDir === "desc" ? -1 : 1)
        }

        return { filter: filterToMongo(filter), projection: mongoProjection, sort: mongoSort };
    }

    /**
     * Finds rows
     * @param table Table or collection name
     * @param filter Filter to apply
     * @param sortBy Sort results by this field. Leave as null for default sorting
     * @param sortDir "asc" or "desc". Leave as null for default sorting
     * @param skip Number of rows to skip. Leave as -1 for no skip
     * @param limit Limit of results. Leave as -1 for no limit
     * @param projection List of fields to featch from the table. Leave as null to fetch them all.
     */
    async find(table: string, filter: GenericFilter, sortBy: string, sortDir: SortDirection, skip: number, limit: number, projection: Set<string>): Promise<GenericRow[]> {
        const sentenceAndValues = this.generateFindSentence(table, filter, sortBy, sortDir, projection);
        const mongoFilter = sentenceAndValues.filter;
        const mongoSort = sentenceAndValues.sort;
        const mongoProjection = sentenceAndValues.projection;

        const client = await this.connect()

        const db = client.db().collection(table);
        let cursor: FindCursor<any> = db.find(mongoFilter);

        if (mongoSort) {
            cursor = cursor.sort(mongoSort);
        }

        if (mongoProjection) {
            cursor = cursor.project(mongoProjection);
        }

        if (skip !== null && skip > 0) {
            cursor = cursor.skip(skip);
        }

        if (limit !== null && limit > 0) {
            cursor = cursor.limit(limit);
        }

        try {
            const docs = await cursor.toArray();

            return docs;
        } catch (ex) {

            return Promise.reject(ex);
        }
    }

    /**
     * Counts the number of rows matching a condition
     * @param table Table or collection name
     * @param filter Filter to apply
     */
    async count(table: string, filter: GenericFilter): Promise<number> {
        const cond1 = filterToMongo(filter);

        const client = await this.connect()
        const db = client.db().collection(table);

        const cursor: FindCursor<any> = db.find(cond1);

        const count = await cursor.count();



        return count;
    }

    /**
     * Finds rows (stream mode). You can parse each row with an ASYNC function
     * @param table Table or collection name
     * @param filter Filter to apply
     * @param sortBy Sort results by this field. Leave as null for default sorting
     * @param sortDir "asc" or "desc". Leave as null for default sorting
     * @param skip Number of rows to skip. Leave as -1 for no skip
     * @param limit Limit of results. Leave as -1 for no limit
     * @param projection List of fields to featch from the table. Leave as null to fetch them all.
     * @param each Function to parse each row
     */
    async findStream(table: string, filter: GenericFilter, sortBy: string, sortDir: SortDirection, skip: number, limit: number, projection: Set<string>, each: (row: GenericRow) => Promise<void>): Promise<void> {
        const sentenceAndValues = this.generateFindSentence(table, filter, sortBy, sortDir, projection);
        const mongoFilter = sentenceAndValues.filter;
        const mongoSort = sentenceAndValues.sort;
        const mongoProjection = sentenceAndValues.projection;

        const client = await this.connect()
        const db = client.db().collection(table);

        let cursor: FindCursor<any> = db.find(mongoFilter);

        if (mongoSort) {
            cursor = cursor.sort(mongoSort);
        }

        if (mongoProjection) {
            cursor = cursor.project(mongoProjection);
        }

        if (skip !== null && skip > 0) {
            cursor = cursor.skip(skip);
        }

        if (limit !== null && limit > 0) {
            cursor = cursor.limit(limit);
        }

        let busyPromise: Promise<void> = null;

        return new Promise<void>(function (resolve, reject) {
            const stream: Readable = cursor.stream();

            stream.on("data", async function (row) {
                stream.pause();

                try {
                    busyPromise = each(row);
                    await busyPromise;
                } catch (ex) {
                    stream.destroy();

                    return reject(ex);
                }

                busyPromise = null;

                stream.resume();
            }.bind(this));

            stream.on("end", async function () {
                if (busyPromise) {
                    try {
                        await busyPromise;
                    } catch (ex) {

                        return reject(ex);
                    }
                }

                resolve();
            }.bind(this));
        }.bind(this));
    }


    /**
     * Finds rows (stream mode). You can parse each row with a SYNC function
     * @param table Table or collection name
     * @param filter Filter to apply
     * @param sortBy Sort results by this field. Leave as null for default sorting
     * @param sortDir "asc" or "desc". Leave as null for default sorting
     * @param skip Number of rows to skip. Leave as -1 for no skip
     * @param limit Limit of results. Leave as -1 for no limit
     * @param projection List of fields to featch from the table. Leave as null to fetch them all.
     * @param each Function to parse each row
     */
    async findStreamSync(table: string, filter: GenericFilter, sortBy: string, sortDir: SortDirection, skip: number, limit: number, projection: Set<string>, each: (row: any) => void): Promise<void> {
        const sentenceAndValues = this.generateFindSentence(table, filter, sortBy, sortDir, projection);
        const mongoFilter = sentenceAndValues.filter;
        const mongoSort = sentenceAndValues.sort;
        const mongoProjection = sentenceAndValues.projection;

        const client = await this.connect()
        const db = client.db().collection(table);

        let cursor: FindCursor<any> = db.find(mongoFilter);

        if (mongoSort) {
            cursor = cursor.sort(mongoSort);
        }

        if (mongoProjection) {
            cursor = cursor.project(mongoProjection);
        }

        if (skip !== null && skip > 0) {
            cursor = cursor.skip(skip);
        }

        if (limit !== null && limit > 0) {
            cursor = cursor.limit(limit);
        }

        return new Promise<void>(function (resolve, reject) {
            const stream: Readable = cursor.stream();

            stream.on("data", async function (row) {
                try {
                    each(row);
                } catch (ex) {
                    stream.destroy();

                    return reject(ex);
                }
            }.bind(this));

            stream.on("end", async function () {

                resolve();
            }.bind(this));
        }.bind(this));
    }

    /**
     * Inserts a row
     * @param table Table or collection name
     * @param row Row to insert
     * @param key The name of the primary key (if any)
     * @param callback Callback to set the value of the primary key after inserting (Optional, only if auto-generated key)
     */
    async insert(table: string, row: GenericRow, key: string, callback?: (value: GenericKeyValue) => void): Promise<void> {
        const client = await this.connect()
        const db = client.db().collection(table);
        await db.insertOne(row);
        client.close;
    }

    /**
     * Inserts many rows
     * @param table Table or collection name
     * @param rows List of rows to insert
     */
    async batchInsert(table: string, rows: GenericRow[]): Promise<void> {
        const client = await this.connect()
        const db = client.db().collection(table);
        await db.insertMany(rows);

    }

    /**
     * Updates a row
     * @param table Table or collection name
     * @param keyName Name of the key
     * @param keyValue Value of the key
     * @param updated Updated row
     */
    async update(table: string, keyName: string, keyValue: GenericKeyValue, updated: GenericRow): Promise<void> {
        const keys = Object.keys(updated);

        if (keys.length === 0) {
            return; // Nothing to update
        }

        const filter: Filter<any> = Object.create(null);
        filter[keyName] = keyValue;

        const client = await this.connect()
        const db = client.db().collection(table);
        await db.updateOne(filter, { $set: updated });

    }

    /**
     * Updates many rows
     * @param table Table or collection name
     * @param filter Filter to apply
     * @param updated Updated row
     * @returns The number of affected rows
     */
    async updateMany(table: string, filter: GenericFilter, updated: GenericRow): Promise<number> {
        const keys = Object.keys(updated);

        if (keys.length === 0) {
            return; // Nothing to update
        }

        const mongoFilter: Filter<any> = filterToMongo(filter);
        const client = await this.connect()
        const db = client.db().collection(table);
        const res = await db.updateMany(mongoFilter, { $set: updated });

        return res.modifiedCount;
    }

    /**
     * Deletes a row
     * @param table Table or collection name
     * @param keyName Name of the key
     * @param keyValue Value of the key
     * @returns true if the row was deleted, false if the row didn't exists
     */
    async delete(table: string, keyName: string, keyValue: GenericKeyValue): Promise<boolean> {
        const filter: Filter<any> = Object.create(null);
        filter[keyName] = keyValue;

        const client = await this.connect()
        const db = client.db().collection(table);
        const res = await db.deleteOne(filter);


        return res.deletedCount > 0;
    }

    /**
     * Deletes many rows
     * @param table Table or collection name
     * @param filter Filter to apply
     * @returns The number of affected rows
     */
    async deleteMany(table: string, filter: GenericFilter): Promise<number> {
        const client = await this.connect()
        const db = client.db().collection(table);
        const res = await db.deleteMany(filterToMongo(filter));


        return res.deletedCount;
    }

    /**
     * Summatory of many rows
     * @param table Table or collection name
     * @param filter Filter to apply
     * @param id Name of the primary key
     * @param field Name of the field to aggregate
     */
    async sum(table: string, filter: GenericFilter, id: string, field: string): Promise<number> {
        const client = await this.connect()
        const db = client.db().collection(table);
        const mongoFilter = filterToMongo(filter);

        const result = await db.aggregate([{ $match: mongoFilter }, {
            "$group": {
                _id: null,
                sum: { $sum: "$" + field },
            },
        }]).toArray();



        if (result.length > 0) {
            return result[0].sum || 0;
        } else {
            return 0;
        }
    }

    /**
     * Atomic increment
     * @param table Table or collection name
     * @param keyName The name of the key
     * @param keyValue The value ofthe key
     * @param prop The field to increment
     * @param inc The amount to increment
     */
    async increment(table: string, keyName: string, keyValue: GenericKeyValue, prop: string, inc: number): Promise<void> {
        const client = await this.connect()
        const db = client.db().collection(table);

        const filter: Filter<any> = Object.create(null);
        filter[keyName] = keyValue;

        const incData: any = Object.create(null);
        incData[prop] = inc;

        await db.updateOne(filter, { $inc: incData });

    }
}
