# Postgres
Developed by **Sam Farris**

This project aims to create a comprehensive PostgreSQL driver library that handles various aspects of database interaction, including connection management, querying, connection pooling, and a mini ORM (Object-Relational Mapping) system. The library is designed to simplify and streamline database operations for PostgreSQL in applications.
## Library Features
### Connection Management
- Establish connections to PostgreSQL databases.
- Manage connection lifecycle (connect, disconnect).
- Handle connection errors.
### Querying
- Execute SQL queries.
- Support for parameterized queries.
- Handle query results and error handling.
### Connection Pooling
- Implement a connection pool for efficient resource management.
- Configure pool size and connection timeouts.
- Automatic connection release and reuse.
### Mini ORM
- Provide a lightweight ORM functionality.
- Define types that map to database tables.
- Support basic CRUD operations (Create, Read, Update, Delete).
### Performance Optimization
- Implement query caching mechanisms.
- Optimize connection handling for better performance.
### Error Handling and Logging
- Comprehensive error handling for database operations.
- Logging system for tracking queries and performance metrics.
## Library Support
### Password Encryption
- Trust
- Unix Peer
- MD5
- SCRAM-SHA-256
### Data Types
- BOOL
- NAME
- BIGINT
- SMALLINT
- INTEGER
- TEXT
- VARCHAR
## Demo Interface [IN DEVELOPMENT]
To showcase the capabilities of the PostgreSQL driver library, the project includes:
### index.html
- Simple HTML structure that provides a user interface to interact with the library.
- Buttons to trigger various database operations.
- Display of data for the currently selected table.
### Routing Handler
- Basic Bun server to handle HTTP requests.
- Demonstrates how to integrate the library into a web application.
- Provides endpoints for different database operations.
## Library Usage
*This is not available in npm*
### Raw Query 
```ts
import { Pool } from './dir/to/pool.ts';

const client = new Pool({
    database: 'postgres',
    username: 'postgres',
    password: 'postgres',
    //supports path to Unix socket instead of TCP connection
    hostname: 'localhost',
    port: 5432,
    connectionTimeout: 1000 * 60 * 10, //in ms
    maxConnections: 100 //default when installing postgres
});

try {
    await pool.query('CREATE TABLE ('
        + 'id INTEGER PRIMARY KEY,'
        + 'username VARCHAR(32) NOT NULL,'
        + 'roles INTEGER'
    + ');');
    console.log('created table');

    await pool.query(`INSERT INTO member(id, username) VALUES(123, 'sam3');`);
    console.log('inserted column 1');

    await pool.query(`INSERT INTO member(id, username) VALUES(124, 'kim7');`);
    console.log('inserted column 2');

    let results = await pool.query('SELECT * FROM member;');
    console.log('results 1', results.rows);

    results = await pool.query('SELECT id, username FROM member WHERE id = $1;', [ 123 ]);
    console.log('results 2', results.rows);

    //have postgres cache query for future usage
    await pool.prepare('my_saved_insert_member_query').query('INSERT INTO member(id, username, roles) VALUES($1, $2, $3);', [ 125, 'joe9', 1 << 0 | 1 << 3 ]);
    console.log('inserted column 3');

    //passing types and values is a little faster,
    //but is more useful for the ORM
    await pool.prepare({
        name: 'my_saved_update_member_query',
        types: [ pool.OID.VARCHAR, pool.OID.INTEGER ],
        values: [ 'kim5', 124 ]
    //don't have to pass values a second time
    }).query('UPDATE member SET username = $1 WHERE id = $2;');
    console.log('updated column 1');

    //reusing prepared insert query
    await pool.prepare('my_saved_update_member_query').query('UPDATE member SET username = $1 WHERE id = $2;', [ 'sam2', 123 ]);
    console.log('updated column 2');

    await pool.query('DELETE FROM member WHERE id = $1;', [ 123 ]);
    console.log('deleted column 1');

    result = await pool.query('SELECT * FROM member;');
    console.log('results 3', results);

    await pool.query('DROP TABLE member;');
    console.log('dropped table');
} catch (error) {
    console.error('caught', error);
}
```
### ORM Query
```ts
import { Pool } from './dir/to/pool.ts';

type Schema = {
    member: {
        id: number;
        username: string;
        //optional operator (?) to have correct insert typing
        roles?: number | null;
    }
}

const client = new Pool<Schema>({
    database: 'postgres',
    username: 'postgres',
    password: Pool.NO_PASSWORD.PEER,
    unix: '/run/postgresql/.s.PGSQL.5432',
    connectionTimeout: 1000 * 60 * 10, //in ms
    maxConnections: 100 //default when installing postgres
});

try {
    await pool.query('CREATE TABLE ('
        + 'id INTEGER PRIMARY KEY,'
        + 'username VARCHAR(32) NOT NULL,'
        + 'roles INTEGER'
    + ');');
    console.log('created table');

    await pool.table('member').insert({
        id: 123,
        username: 'sam3'
    });
    console.log('inserted column 1');

    await pool.table('member').insert({
        id: 124,
        username: 'kim7'
    });
    console.log('inserted column 2');

    let results = await pool.table('member').select().where();
    console.log('results 1', results.rows);

    results = await pool.table('member').select('id', 'username').where({
        id: 123
    });
    console.log('results 2', results.rows);

    await pool.prepare('my_saved_insert_member_query').table('member').insert({
        id: 125,
        username: 'joe9',
        roles: 1 << 0 | 1 << 3
    });
    console.log('inserted column 3');

    //passing types and values is more faster here
    await pool.prepare({
        name: 'my_saved_update_member_query',
        types: [ pool.OID.VARCHAR, pool.OID.INTEGER ],
        values: [ 'kim5', 124 ]
    }).table('member').update({
        username: 'kim5',
    }).where({
        id: 124
    });
    console.log('updated column 1');

    //reusing prepared insert query
    await pool.prepare('my_saved_update_member_query').table('member').update({
        username: 'sam2'
    }).where({
        id: 123
    });
    console.log('updated column 2');

    await pool.table('member').delete().where({
        id: 123
    });
    console.log('deleted column 1');

    result = await pool.table('member').select().where();
    console.log('results 3', results);

    await pool.query('DROP TABLE member;');
    console.log('dropped table');
} catch {
    console.error('caught', error);
}
```