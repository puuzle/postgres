import { Client } from './client.ts';
import { PoolError } from './error.ts';
import { DISCONNECT_STATUS, POOL_REGEX, STATUS } from './const.ts';
import { util } from './util.ts';

import type {
    BaseClientOptions,
    DisconnectStatus,
    EnsureSchema,
    EnsureTableNames,
    EnsureTables,
    PoolOptions,
    Prepare,
    PrepareOptions,
    QueryResults,
    QueryTable,
    QueryTables,
    Socket,
    Values
} from './types.ts';

export class Pool<Schema extends EnsureSchema> extends Client {
    readonly connectionTimeout: number;
    readonly maxConnections: number;
    readonly sockets: Map<number, Socket> = new Map();
    readonly timeouts: Map<number, Timer> = new Map();
    private connections = 0;
    constructor(options: PoolOptions) {
        const base: BaseClientOptions = {
            database: options.database,
            username: options.username,
            password: options.password
        }
        if ('unix' in options) {
            super({
                ...base,
                unix: options.unix
            });
        } else {
            super({
                ...base,
                hostname: options.hostname,
                port: options.port
            });
        }
        if (!POOL_REGEX.MAX_CONNECTIONS_RANGE.test(String(options.maxConnections))) {
            throw new Error(`Max connections value needs to be between 1 and 1000.`);
        }
        this.connectionTimeout = options.connectionTimeout;
        this.maxConnections = options.maxConnections;
    }
    disconnect(socketId: number): Promise<DisconnectStatus>;
    disconnect(socketId: number, force: true): Promise<void>;
    disconnect(socketId: number, force?: boolean): Promise<DisconnectStatus | void> {
        return new Promise((resolve, reject) => {
            const socket = this.sockets.get(socketId);
            if (!socket) {
                if (force) {
                    return reject(new PoolError({
                        message: `Socket id (${socketId}) doesn't exists in the pool.`
                    }));
                }
                return resolve(DISCONNECT_STATUS.NO_SOCKET_EXISTS);
            }
            if (socket.data.status !== STATUS.READY_FOR_QUERY) {
                if (force) {
                    return reject(new PoolError({
                        message: `Socket id's (${socketId}) status (${socket.data.status}) isn't READY_FOR_QUERY so it can't be disconnected at the moment.`
                    }));
                }
                return resolve(DISCONNECT_STATUS.NOT_READY);
            }
            const id = socket.data.id;
            this.disconnectSocket(socket, (error) => {
                this.delete(id);
                if (!error) return resolve(force ? undefined : DISCONNECT_STATUS.OK);
                reject(error);
            });
        });
    }
    async disconnectPool(): Promise<void> {
        let socket: Socket | undefined;
        const sockets = this.sockets.values();
        let next = sockets.next();
        while (!next.done) {
            socket = next.value;
            next = sockets.next();
            if (socket) {
                try {
                    await this.disconnect(socket.data.id);
                    continue;
                } catch (error) {
                    throw error;
                }
            }
            throw new PoolError({
                message: `Socket wasn't defined in iterable iterator when it should've been.`
            });
        }
    }
    prepare(prepare: PrepareOptions | string): Prepare<Schema> {
        const ensurePrepare: PrepareOptions = typeof prepare === 'string' ? { name: prepare } : prepare;
        return {
            query: async (query, values) => {
                return await this.queryString(query, values ?? ensurePrepare.values, ensurePrepare);
            },
            table: (...tables: string[]) => {
                //NOTE: non-null assertion because type tables requires at least one table,
                //because of spread operator on tables parameter
                const table = tables[0]!;
                if (tables.length === 1) return this.queryTable(table, ensurePrepare);
                //NOTE: casting to any to override Schema[any(TableName)] to EnsureTables<Schema> and EnsureTableNames<Schema>
                return this.queryTables(table, ensurePrepare) as any;
            }
        }
    }
    table<TableName extends keyof Schema>(table: TableName): QueryTable<Schema, Schema[TableName]>;
    table<TableNames extends EnsureTableNames<Schema>>(...tables: TableNames): QueryTables<Schema, TableNames>;
    table<TableNames extends EnsureTableNames<Schema>>(...tables: string[]): QueryTable<Schema, Schema[TableNames[0]]> | QueryTables<Schema, TableNames> {
        //NOTE: non-null assertion because type tables requires at least one table,
        //because of spread operator on tables parameter
        const table = tables[0]!;
        if (tables.length === 1) return this.queryTable(table);
        return this.queryTables(table);
    }
    async query(query: string, values?: Values): Promise<QueryResults> {
        return await this.queryString(query, values);
    }
    private delete(socketId: number): void {
        this.sockets.delete(socketId);
        const timeout = this.timeouts.get(socketId);
        if (timeout) {
            this.timeouts.delete(socketId);
            //NOTE: has no effect if this was called in this.setConnectionTimeout method,
            //which would be called from this.disconnect method
            clearTimeout(timeout);
        }
    }
    private setConnectionTimeout(socketId: number): void {
        //NOTE: appropriate to use set timeout in this context,
        //because it's better to disconnect the socket while bun is sleeping as the disconnect method is asynchronous,
        //rather than disconnecting the sockets that have been open for the connection timeout on a cleanup interval when a query is made,
        //resulting in that query being much longer than it needs to be, causing inconsistent speeds for every route that makes queries,
        //and connections won't be made often because with pooling they're left open until set timeout callback is called
        const timeout = setTimeout(async () => {
            let status: DisconnectStatus | undefined;
            try {
                status = await this.disconnect(socketId);
                if (status === DISCONNECT_STATUS.NOT_READY) return this.setConnectionTimeout(socketId);
            } catch (error) {
                //NOTE: appropriate to console.error in the catch block,
                //in case something goes wrong with this.disconnectSocket as it's not a force disconnect,
                //also there's no way for the caller to handle a rejection in a timeout callback
                console.error(error);
            } finally {
                //NOTE: in case something goes wrong with this.disconnectSocket or status is NO_SOCKET_EXISTS, 
                //delete from timeouts map, so it's not leaked in the timeouts map forever,
                //and don't need to clear timeout because it's obviously been called
                if (status === undefined || status === DISCONNECT_STATUS.NO_SOCKET_EXISTS) this.timeouts.delete(socketId);
            }
        }, this.connectionTimeout);
        this.timeouts.set(socketId, timeout);
    }
    private getNextSocket(): Socket | null {
        let socket: Socket | undefined;
        const sockets = this.sockets.values();
        let next = sockets.next();
        for (let i = 0; i < this.maxConnections; i++) {
            if (next.done) return null;
            socket = next.value;
            next = sockets.next();
            if (socket) {
                if (socket.data.status !== STATUS.READY_FOR_QUERY) continue;
                return socket;
            }
            throw new PoolError({
                message: `Socket wasn't defined in iterable iterator when it should've been.`
            });
        }
        throw new PoolError({
            message: `Sockets are full and each socket isn't ready for query, if this isn't an implementation error then max connections should be increased.`
        });
    }
    private connectClient(): Promise<Socket> {
        return new Promise((resolve, reject) => {
            //NOTE: latent (wireless) or instant (wired) ECONNREFUSED for invalid hostname,
            //instant ECONNREFUSED for invalid port, or infinitely block program (if hostname exists and invalid port),
            //latent (wireless) or instant (wired) ECONNREFUSED for invalid hostname and port,
            //instant ENOENT for invalid unix,
            //and both connect callback (with error) and catch callback is called,
            //but reject in connect callback is called before reject in catch callback
            Bun.connect(this.connect((socket, error) => {
                if (!error) return resolve(socket);
                this.delete(socket.data.id);
                reject(error);
            }, ++this.connections)).then(socket => {
                this.sockets.set(socket.data.id, socket);
                this.setConnectionTimeout(socket.data.id);
            }).catch(reject);
        });
    }
    private queryClient(socket: Socket, query: string): Promise<QueryResults> {
        return new Promise((resolve, reject) => {
            this.querySocket(socket, query, (socket, error, results) => {
                if (!error) {
                    if (results) return resolve({ socketId: socket.data.id, query, rows: results.rows });
                    this.delete(socket.data.id);
                    return reject(new PoolError({
                        message: `Results wasn't defined when it should've been for query client.`
                    }));
                }
                this.delete(socket.data.id);
                reject(error);
            });
        });
    }
    private async prepareClient(socket: Socket | null, prepare: PrepareOptions, query: string, values?: Values): Promise<QueryResults> {
        if (socket === null) socket = await this.connectClient();
        return new Promise((resolve, reject) => {
            //NOTE: non-null assertion because even with if (socket === null) check,
            //because socket is being accessed inside a callback
            if (query) socket!.data.parses.add(prepare.name);
            //NOTE: non-null assertion because same reason as above
            this.prepareSocket(socket!, {
                name: prepare.name,
                values: (prepare.values ?? values)?.map(v => String(v)) ?? null
            }, (socket, error, results) => {
                if (!error) {
                    if (results) return resolve({ socketId: socket.data.id, query, rows: results.rows });
                    this.delete(socket.data.id);
                    return reject(new PoolError({
                        message: `Results wasn't defined when it should've been for execute client.`
                    }));
                }
                this.delete(socket.data.id);
                reject(error);
            }, query ? {
                name: prepare.name,
                query,
                types: prepare.types ?? null
            } : undefined);
        });
    }
    private async queryString(query: string, values: Values | undefined, prepare?: PrepareOptions): Promise<QueryResults> {
        const socket = this.getNextSocket() ?? await this.connectClient();
        if (prepare) {
            if (prepare.values) values = undefined;
            return await this.prepareClient(socket, prepare, socket.data.parses.has(prepare.name) ? '' : query, values);
        }
        if (values) {
            query = query.replace(POOL_REGEX.QUERY_VALUES, function() {
                //NOTE: non-null assertion because values = undefined casts values to possibly undefined,
                //even with if (values) check because values is being accessed inside a callback
                const value = values![arguments[1] - 1];
                if (typeof value === 'string') return `'${value.replace('\'', '\'\'')}'`;
                if (value === null || typeof value === 'boolean' || typeof value === 'number') return String(value);
                throw new PoolError({
                    message: `The query contained an unsupported value type.`,
                    value,
                    values
                });
            });
        }
        return await this.queryClient(socket, query);
    }
    private queryTable<Table extends EnsureTables<Schema>>(table: string, prepare?: PrepareOptions): QueryTable<Schema, Table> {
        let socket: Socket | null = null;
        let parsed = false;
        if (prepare) {
            socket = this.getNextSocket();
            parsed = socket ? socket.data.parses.has(prepare.name) : false;
        }
        let query = '';
        const values: Values = [];
        return {
            select: (...columns) => {
                if (!parsed) query += `SELECT ${columns.length === 0 ? '*' : columns.join(', ')} FROM ${table}`;
                return {
                    where: async (...filters) => {
                        if (parsed && socket && prepare?.values && !query) return await this.prepareClient(socket, prepare, query);
                        query = util.appendFilter(filters, query, values);
                        if (prepare) return await this.prepareClient(socket, prepare, parsed ? '' : query, values);
                        //NOTE: casting to any to override Rows to ReturnType<Where>.rows
                        return await this.query(query, values) as any;
                    }
                }
            },
            insert: async (insert) => {
                if (parsed && socket && prepare?.values && !query) {
                    await this.prepareClient(socket, prepare, query);
                } else {
                    query += `INSERT INTO ${table} (`;
                    for (const column in insert) {
                        //NOTE: non-null assertion because for ... in ... isn't asserting defined
                        values.push(insert[column]!);
                        query += `${column}, `;
                    }
                    query = query.slice(0, -2) + ') VALUES (';
                    for (let i = 1; i <= values.length; i++) {
                        query += `$${i}, `;
                    }
                    query = query.slice(0, -2) + ');';
                    if (prepare) await this.prepareClient(socket, prepare, parsed ? '' : query, values);
                    else await this.query(query, values);
                }
            },
            update: (update) => {
                if (!parsed) {
                    query += `UPDATE ${table} SET`;
                    for (const column in update) {
                        //NOTE: non-null assertion because for ... in ... isn't asserting defined
                        values.push(update[column]!);
                        query += ` ${column} = $${values.length},`;
                    }
                    query = query.slice(0, -1);
                }
                return {
                    where: async (...filters) => {
                        if (parsed && socket && prepare?.values && !query) {
                            await this.prepareClient(socket, prepare, query);
                        } else {
                            query = util.appendFilter(filters, query, values);
                            if (prepare) await this.prepareClient(socket, prepare, parsed ? '' : query, values);
                            else await this.query(query, values);
                        }
                    }
                }
            },
            delete: () => {
                if (!parsed) query += `DELETE FROM ${table}`;
                return {
                    where: async (...filters) => {
                        if (parsed && socket && prepare?.values && !query) {
                            await this.prepareClient(socket, prepare, query);
                        } else {
                            query = util.appendFilter(filters, query, values);
                            if (prepare) await this.prepareClient(socket, prepare, parsed ? '' : query, values);
                            else await this.query(query, values);
                        }
                    }
                }
            }
        }
    }
    private queryTables<TableNames extends EnsureTableNames<Schema>>(table: string, prepare?: PrepareOptions): QueryTables<Schema, TableNames> {
        let socket: Socket | null = null;
        let parsed = false;
        if (prepare) {
            socket = this.getNextSocket();
            parsed = socket ? socket.data.parses.has(prepare.name) : false;
        }
        let query = '';
        const values: Values = [];
        return {
            select: (...columns) => {
                if (!parsed) query += `SELECT ${columns.length === 0 ? '*' : columns.join(', ')} FROM ${table}`;
                return {
                    join(relation) {
                        if (!parsed) {
                            let and = '';
                            if (relation.and) {
                                values.push(relation.and.value);
                                and = `${relation.table}.${relation.and.column} = $${values.length}`;
                                if (relation.and.or) {
                                    values.push(relation.and.or);
                                    and = ` AND (${and} OR ${relation.table}.${relation.and.column} = $${values.length})`;
                                } else and = ` AND ${and}`;
                            }
                            query += ` ${relation.type} JOIN ${relation.table} ON ${table}.${relation.primary_column ?? relation.column} = ${relation.table}.${relation.column}${and}`;
                        }
                        return {
                            join: this.join,
                            where: this.where
                        }
                    },
                    //TODO: doesn't have special filter options right now,
                    //and keep this using object within object until I have time to come up with a design to use one object,
                    //since select columns have been improved to using <Table>.<Column>
                    where: async (...filters) => {
                        if (parsed && socket && prepare?.values && !query) return await this.prepareClient(socket, prepare, query);
                        if (filters.length !== 0) {
                            query += ' WHERE';
                            for (let i = 0; i < filters.length; i++) {
                                //NOTE: non-null assertion because never reassigning "i"
                                const filter = filters[i]!;
                                for (const tableName in filter) {
                                    //NOTE: reflect get because for ... in ... isn't using generics
                                    const table = Reflect.get(filter, tableName);
                                    for (const column in table) {
                                        //NOTE: non-null assertion because for ... in ... isn't asserting defined
                                        values.push(table[column]!);
                                        query += ` ${tableName}.${column} = $${values.length} AND`;
                                    }
                                }
                                //NOTE: ensuring at least one filter was appended,
                                //because each property is possible optional in each filter object
                                if (query.endsWith(' AND')) query = query.slice(0, -4) + ' OR';
                            }
                            //NOTE: ensuring at least one filter was appended, because same reason as above
                            if (query.endsWith(' OR')) query = query.slice(0, -3);
                        }
                        query += ';';
                        if (prepare) return await this.prepareClient(socket, prepare, parsed ? '' : query, values);
                        //NOTE: casting to any to override Rows to ReturnType<Where>.rows
                        return await this.query(query, values) as any;
                    }
                }
            }
        }
    }
}