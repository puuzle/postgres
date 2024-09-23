import type { Socket as BunSocket, SocketHandler } from 'bun';

import type { TextEncoder } from 'node:util';

import type { ClientError } from './error.ts';
import type { DISCONNECT_STATUS, NO_PASSWORD, OID, SASL_KEYS, STATUS, UNEXPECTED_HANDLER } from './const.ts';

declare module 'bun' {
    interface Env {
        USER?: string;
    }
}

export interface ClientErrorOptions {
    code: string;
    constraint?: string;
    detail?: string;
    file?: string;
    hint?: string;
    line?: string;
    message: string;
    position?: string;
    routine?: string;
    schema?: string;
    severity: string;
    table?: string;
    vseverity?: string;
}

interface TCPOptions {
    hostname: string;
    port: number;
}

interface UnixOptions {
    unix: string;
}

export type NoPasswordValue = typeof NO_PASSWORD[keyof typeof NO_PASSWORD];

export interface BaseClientOptions {
    database: string;
    username: string;
    password: string | NoPasswordValue;
}

interface BasePoolOptions extends BaseClientOptions {
    connectionTimeout: number;
    maxConnections: number;
}

export type SocketOptions = TCPOptions | UnixOptions;

export type ClientOptions = (TCPOptions & BaseClientOptions) | (UnixOptions & BaseClientOptions);

export type PoolOptions = (TCPOptions & BasePoolOptions) | (UnixOptions & BasePoolOptions);

type OIDs = (typeof OID[keyof typeof OID])[];

export interface ParseOptions {
    name: string;
    query: string;
    types: OIDs | null;
}

type ExecuteValues = (string | Buffer | null)[];

export interface BindOptions {
    name: string;
    values: ExecuteValues | null;
}

export type DisconnectStatus = typeof DISCONNECT_STATUS[keyof typeof DISCONNECT_STATUS];

type SupportedValues = null | string | number | bigint | boolean;

//NOTE: using supported values because each value type is already resolved before pushing to the array,
//and also "type Values<Schema extends EnsureSchema, Table extends Tables<Schema>> = (Table[keyof Table])[]" doesn't work
export type Values = SupportedValues[];

export interface PrepareOptions {
    name: string;
    //NOTE: impossible to get dynamic allowed OIDs based on what columns were queried,
    //because of same reason as above and some OIDs may not directly link to javascript's type
    //NOTE: leaving undefined adds additional cost by postgres doing extra work on the backend to resolve the types
    types?: OIDs;
    //NOTE: impossible to get dynamic allowed types based on what columns were queried,
    //because prepare method is used before table method and the order can't be switched
    //NOTE: leaving undefined adds additional cost by going through each method within the table method
    values?: Values;
}

export type Row = Record<string, unknown>;

type Rows = Row[];

export interface QueryResults {
    socketId: number;
    query: string;
    rows: Rows;
}

type EnsureSchemaTable = Record<string, SupportedValues>;

export type EnsureSchema = Record<string, EnsureSchemaTable>;

export type EnsureTableNames<Schema extends EnsureSchema> = (keyof Schema)[];

export interface Prepare<Schema extends EnsureSchema> {
    query(query: string, values?: Values): Promise<QueryResults>;
    table<TableName extends keyof Schema>(table: TableName): QueryTable<Schema, Schema[TableName]>;
    table<TableNames extends EnsureTableNames<Schema>>(...tables: TableNames): QueryTables<Schema, TableNames>;
    table<TableNames extends EnsureTableNames<Schema>>(...tables: TableNames): QueryTable<Schema, Schema[TableNames[0]]> | QueryTables<Schema, TableNames>;
}

export type ConnectCallback = (socket: Socket, error: Error | null) => void;
export type QueryCallback = (socket: Socket, error: Error | null, results: Results | null) => void;
export type DisconnectCallback = (error: Error | null) => void;

interface Callbacks {
    connect: ConnectCallback | null;
    query: QueryCallback | null;
    disconnect: DisconnectCallback | null;
    error: ClientError | Error | null;
}

type Parses = Set<string>;

interface Results {
    fields: string[];
    types: string[];
    rows: Rows;
    status: string;
}

export type SASLKeys = typeof SASL_KEYS[keyof typeof SASL_KEYS];

type SASLMessage = 'SASLInitialResponse' | 'SASLResponse' | null; //?
type SASLMechanism = 'SCRAM-SHA-256' | null; //?

interface SASL {
    message: SASLMessage;
    mechanism: SASLMechanism;
    nonce: string;
    response: string;
    serverSignature: string;
}

type StatusValue = typeof STATUS[keyof typeof STATUS];

interface BaseClientOptionsWithId extends BaseClientOptions {
    id: number;
}

export interface Data extends BaseClientOptionsWithId {
    callbacks: Callbacks;
    firstQuery: boolean;
    parses: Parses;
    results: Results;
    sasl: SASL;
    status: StatusValue;
}

export type Socket = BunSocket<Data>;

export type Handler = SocketHandler<Data>;

export interface DataHandler {
    auth(socket: Socket, data: Buffer, offset: number, length: number): Promise<void>;
    error(socket: Socket, data: Buffer, offset: number, length: number): void;
    fields(socket: Socket, data: Buffer, offset: number): void;
    rows(socket: Socket, data: Buffer, offset: number): void;
    parseComplete(socket: Socket): void;
    bindComplete(socket: Socket): void;
    readyForQuery(socket: Socket): void;
    readyForResults(socket: Socket): void;
    readyForQueryWithResults(socket: Socket): void;
}

export interface Hash {
    readonly textEncoder: TextEncoder;
    MD5(string: string): string;
    postgresMD5(username: string, password: string, salt: Buffer): string;
    SHA256(buffer: ArrayBuffer): Promise<ArrayBuffer>;
    signSHA256(keyBuffer: ArrayBuffer, message: string): Promise<ArrayBuffer>;
    deriveSHA256(password: string, salt: Buffer, iterations: number): Promise<ArrayBuffer>;
    randomBytes(length: number): Buffer;
    parseSASLEntry(string: string): Map<SASLKeys, string>;
    xorArrayBuffer(a: ArrayBuffer, b: ArrayBuffer): string;
}

type UnexpectedHandler = typeof UNEXPECTED_HANDLER[keyof typeof UNEXPECTED_HANDLER];

export type EnsureTables<Schema extends EnsureSchema> = Schema[keyof Schema];

type PartialColumns<Schema extends EnsureSchema, Table extends EnsureTables<Schema>> = {
    [Column in keyof Table]?: Table[Column];
}

interface Keywords<Schema extends EnsureSchema, Table extends EnsureTables<Schema>> {
    //NOTE: have to remove possible symbol or number type on keyof Schema[Table] otherwise there's an error
    isNotNull?: Extract<keyof Table, string>[];
    //NOTE: same reason as above
    isNull?: Extract<keyof Table, string>[];
}

interface SpecialFilter<Schema extends EnsureSchema, Table extends EnsureTables<Schema>> {
    keywords?: Keywords<Schema, Table>;
}

type Filters<Schema extends EnsureSchema, Table extends EnsureTables<Schema>> = (PartialColumns<Schema, Table> & SpecialFilter<Schema, Table>)[];

export interface Util {
    error(socket: Socket, error: ClientError | Error): void;
    errorCallback(socket: Socket, error: Error): void;
    isStatus(socket: Socket, status: StatusValue): boolean;
    isSASLStatus(socket: Socket, saslMessage: SASLMessage, saslMechanism: SASLMechanism): boolean;
    isSocketClosed(socket: Socket): boolean;
    unexpectedHandler(socket: Socket, handler: UnexpectedHandler, ensureClosed: boolean): void;
    getKeyByValue(obj: Record<string, number>, value: number): string;
    getDefaultData(base: BaseClientOptionsWithId): Data;
    appendFilter<Table extends EnsureTables<EnsureSchema>>(
        filters: Filters<EnsureSchema, Table>,
        query: string,
        values: Values
    ): string;
    appendKeywords<Table extends EnsureTables<EnsureSchema>>(
        keywords: Keywords<EnsureSchema, Table>,
        query: string
    ): string;
}

type EnsureColumns<Schema extends EnsureSchema, Table extends EnsureTables<Schema>> = (keyof Table)[];

export interface QueryTable<
    Schema extends EnsureSchema,
    Table extends EnsureTables<Schema>
> {
    select<Columns extends EnsureColumns<Schema, Table>>(...columns: Columns): {
        where(...filters: Filters<Schema, Table>): Promise<{
            socketId: number;
            query: string;
            rows: ({
                [Column in Columns['length'] extends 0
                    ? keyof Table
                    //NOTE: exclude undefined type incase property is optional in schema,
                    //because properties will never be undefined, either null or defined
                    : Extract<keyof Table, Columns[number]>]: Exclude<Table[Column], undefined>;
            //TODO: OVERRIDING ATM -> since it's not guarnteed that an object will be returned in the array of results rows
            }/* | undefined*/)[];
        }>;
    }
    insert(insert: Table): Promise<void>;
    update(update: PartialColumns<Schema, Table>): {
        where(...filters: Filters<Schema, Table>): Promise<void>;
    }
    delete(): {
        where(...filters: Filters<Schema, Table>): Promise<void>;
    }
}

//TODO: not using right now since select columns have been improved to using <Table>.<Column>
//type EnsureJoinedColumns<T extends EnsureTables> = T extends T ? keyof T : never;

type EnsureJoinedColumns<
    Schema extends EnsureSchema,
    TableNames extends keyof Schema
> = TableNames extends TableNames
    ? `${string & TableNames}.${string & keyof Schema[TableNames]}`
    : never;

type EnsureJoinTypes = 'INNER' | 'FULL' | 'LEFT' | 'RIGHT';

type UnionKeysWithinKeys<
    Schema extends EnsureSchema,
    Tables extends EnsureTables<Schema>
> = Tables extends Tables ? keyof Tables : never;

type JoinedColumnNullable<
    Schema extends EnsureSchema,
    TableNames extends EnsureTableNames<Schema>,
    Column extends string,
    JoinType extends EnsureJoinTypes
//INNER join will always have it's original defined property type
> = JoinType extends 'INNER'
    ? never
    //FULL join will have the possibility that any of the properties are null
    : JoinType extends 'FULL'
        ? null
        //LEFT JOIN will have the possibility that the right properties are null
        : JoinType extends 'LEFT'
            ? Column extends Extract<Column, UnionKeysWithinKeys<Schema, Schema[TableNames[0]]>> ? never : null
            //RIGHT JOIN on 2 tables will have the possibility that the left properties are null,
            //and on more than 2 tables will have the possibility that any of the properties are null
            : TableNames['length'] extends 2
                ? Column extends Extract<Column, UnionKeysWithinKeys<Schema, Schema[TableNames[1]]>> ? never : null
                //NO JOIN was used
                : never;

//TODO: temporary to get column name,
//so I can use object within object until I have time to come up with a design to use one object,
//since select columns have been improved to using <Table>.<Column>
type GetColumnName<
    Schema extends EnsureSchema,
    TableNames extends keyof Schema,
    Columns extends EnsureJoinedColumns<Schema, TableNames>
> = Columns extends `${infer _}.${infer Column}` ? Column : never;

//TODO: temporary to get column type,
//so I can use object within object until I have time to come up with a design to use one object,
//since select columns have been improved to using <Table>.<Column>
type GetColumnType<
    Schema extends EnsureSchema,
    TableNames extends keyof Schema,
    Columns extends EnsureJoinedColumns<Schema, TableNames>,
    Column extends string
> = Columns extends `${infer TableName}.${Column}`
    ? TableName extends keyof Schema
        ? TableName extends TableNames
            ? Column extends keyof Schema[TableName]
                ?  Schema[TableName][Column]
                : never
            : never
        : never
    : never;

type Where<
    Schema extends EnsureSchema,
    TableNames extends EnsureTableNames<Schema>,
    Columns extends EnsureJoinedColumns<Schema, TableNames[number]>[],
    JoinType extends EnsureJoinTypes
> = (...filters: {
    [Table in TableNames[number]]?: PartialColumns<Schema, Schema[Table]>;
}[]) => Promise<{
    socketId: number;
    query: string;
    rows: (Columns['length'] extends 0 ? {
        [Column in keyof Schema[TableNames[number]]]:
            //NOTE: exclude undefined type because same reason as above
            | Exclude<Schema[TableNames[number]][Column], undefined>
            | JoinedColumnNullable<Schema, TableNames, Extract<Column, string>, JoinType>;
    } : {
        //TODO: keep this using object within object until I have time to come up with a design to use one object,
        //since select columns have been improved to using <Table>.<Column>,
        [Column in GetColumnName<Schema, TableNames[number], Columns[number]>]:
            //NOTE: exclude undefined type because same reason as above
            | Exclude<GetColumnType<Schema, TableNames[number], Columns[number], Column>, undefined>
            | JoinedColumnNullable<Schema, TableNames, Column, JoinType>;
    //TODO: OVERRIDING ATM -> since it's not guarnteed that an object will be returned in the array of results rows
    }/* | undefined*/)[];
}>;

type Join<
    Schema extends EnsureSchema,
    TableNames extends EnsureTableNames<Schema>,
    Columns extends EnsureJoinedColumns<Schema, TableNames[number]>[],
    JoinTypes extends EnsureJoinTypes
> = <
    JoinType extends JoinTypes,
    Table extends TableNames[number],
    Column extends keyof Schema[Table],
    PrimaryColumn extends keyof Schema[TableNames[0]],
    AndColumn extends keyof Schema[Table]
>(relation: {
    //NOTE: it will only take the last join type,
    //ie join({ type: 'LEFT' }).join({ type: 'RIGHT' }) would return right types,
    //and not both left and right because that's impossible in this instance to my knowledge
    type: JoinType;
    //NOTE: can't exclude tables dynamically from join method to join method,
    //otherwise it'll mess up the Where method TableNames type,
    //so just remove the primary table
    //NOTE: have to remove possible symbol or number type on keyof Schema otherwise there's an error
    table: Extract<Exclude<Table, TableNames[0]>, string>;
    //NOTE: same reason as above but for type keyof Schema[Table]
    column: Extract<Column, string>;
    //NOTE: same reason as above but for type keyof Schema[Table]
    primary_column?: Extract<PrimaryColumn, string>;
    and?: {
        //NOTE: same reason as above but for type keyof Schema[Table]
        column: Extract<AndColumn, string>;
        value: Schema[Table][AndColumn];
        or?: Schema[Table][AndColumn];
    }
}) => {
    join: Join<Schema, TableNames, Columns, JoinTypes>;
    where: Where<Schema, TableNames, Columns, JoinType>;
}

export interface QueryTables<
    Schema extends EnsureSchema,
    TableNames extends EnsureTableNames<Schema>
> {
    select<Columns extends EnsureJoinedColumns<Schema, TableNames[number]>[]>(...columns: Columns): {
        join: Join<Schema, TableNames, Columns, EnsureJoinTypes>;
        where: Where<Schema, TableNames, Columns, EnsureJoinTypes>;
    }
}