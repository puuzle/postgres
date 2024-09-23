/*
import { Pool } from '#internal/postgres/pool.ts';
import { query } from '#shared/schema.ts';

if (!Bun.env.USER) {
    throw new Error('Environment variable USER needs be defined when reseting schema.');
}

const pool = new Pool({
    database: 'postgres',
    username: 'postgres',
    password: 'postgres_password',
    hostname: 'localhost',
    port: 5432,
    connectionTimeout: 1000 * 60 * 10,
    maxConnections: 100
});

try {
    const tables = Object.keys(query);
    //NOTE: first delete the tables that aren't a primary to another table
    for (let i = tables.length - 1; i >= 0; i--) {
        await pool.query(`DROP TABLE IF EXISTS ${tables[i]};`);
    }
    //NOTE: second create the tables based on the order in postgres/schema.ts
    for (let i = 0; i < tables.length; i++) {
        //NOTE: non-null assertion because never reassigning "i"
        const table = tables[i]!;
        //NOTE: reflect get because Object.keys doesn't use generics
        await pool.query(Reflect.get(query, table));
        await pool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${Bun.env.USER};`);
    }
    await pool.disconnectPool();
    console.log(`done for ${Bun.env.USER}`);
} catch (error) {
    console.error('catch', error);
}
*/

import { Pool } from './src/pool.ts';

const pool = new Pool({
    database: 'postgres',
    username: 'postgres',
    password: 'postgres_password',
    hostname: 'localhost',
    port: 5432,
    connectionTimeout: 1000 * 60 * 10,
    maxConnections: 100
});

try {
    for (let i = 10; i < 19; i++) await pool.table('test').insert({ id: String(i) });
} catch (error) {
    console.log('caught', error);
}