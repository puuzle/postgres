import { Pool } from './src/pool.ts';

declare module 'bun' {
    interface Env {
        HOST: string;
        PORT: string;
        POSTGRES_DATABASE: string;
        POSTGRES_USERNAME: string;
        POSTGRES_PASSWORD: string;
        POSTGRES_HOST: string;
        POSTGRES_PORT: string;
        POSTGRES_CONNECTION_TIMEOUT: string;
        POSTGRES_MAX_CONNECTIONS: string;
    }
}

const pool = new Pool<Schema>({
    database: Bun.env.POSTGRES_DATABASE,
    username: Bun.env.POSTGRES_USERNAME,
    password: Bun.env.POSTGRES_PASSWORD,
    hostname: Bun.env.POSTGRES_HOST,
    port: Number(Bun.env.POSTGRES_PORT),
    connectionTimeout: Number(Bun.env.POSTGRES_CONNECTION_TIMEOUT),
    maxConnections: Number(Bun.env.POSTGRES_MAX_CONNECTIONS)
});
/*
try {
    const res = await pool.prepare({
        name: 'prepare',
        types: [ pool.OID.TEXT ],
        values: [ '1' ]
    }).table('test').insert({
        id: '1'
    });
    console.log('awaited prepare');
    console.log(res);
    //await pool.disconnectPool();
} catch (error) {
    console.log('caught error', error);
}
console.log('outer');
*/

Bun.serve({
    hostname: Bun.env.HOST,
    port: Number(Bun.env.PORT),
    async fetch(req) {
        if (req.method === 'GET') {
            if (req.url === this.url.href) {
                return new Response(Bun.file('./client/index.html'));
            }
            if (req.url === this.url.href + 'index.css') {
                return new Response(Bun.file('./client/index.css'));
            }
            if (req.url === this.url.href + 'index.js') {
                return new Response(Bun.file('./client/index.js'));
            }
            if (req.url === this.url.href + 'table-names') {
                const data = await pool.prepare('select-table-names').query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public';`);
                return new Response(JSON.stringify(data.rows.map(v => Reflect.get(v, 'table_name'))));
            }
            if (req.url.startsWith(this.url.href + 'tables/')) {
                const tableName = req.url.slice(this.url.href.length).split('/')[1];
                if (!tableName) return new Response('Bad Request Endpoint', { status: 400 });
                const data = await pool.prepare('select-table-' + tableName).table(tableName).select().where();
                return new Response(JSON.stringify(data.rows));
            }
        }
        return new Response('Not Found', { status: 404 });
    }
});

console.log(`Listening to ${Bun.env.HOST} on port ${Bun.env.PORT}`);