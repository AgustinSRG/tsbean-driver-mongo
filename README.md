# TSBean-ORM MongoDB Driver

[![npm version](https://badge.fury.io/js/tsbean-driver-mongo.svg)](https://badge.fury.io/js/tsbean-driver-mongo)

This a MongoDB driver for [tsbean-orm](https://github.com/AgustinSRG/tsbean-orm).

Based on [mongodb](https://www.npmjs.com/package/mongodb) package.

## Installation

```
npm install --save tsbean-driver-mongo
```

## Usage

```ts
import { DataSourceDriver, DataSource } from "tsbean-orm";
import { MongoDriver } from "tsbean-driver-mongo"

const mySource = MongoDriver.createDataSource("mongodb://localhost/my_database");

DataSource.set(DataSource.DEFAULT, mySource);
```
