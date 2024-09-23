import { BIND_VALUE_TYPE, CLIENT_CODE, STATUS, WRITE } from './const.ts';
import { handler } from './handler.ts';
import { NO_PASSWORD, OID } from './const.ts';
import { util } from './util.ts';

import type { TCPSocketConnectOptions, UnixSocketOptions } from 'bun';

import type {
    BindOptions,
    ClientOptions,
    ConnectCallback,
    Data,
    DisconnectCallback,
    NoPasswordValue,
    ParseOptions,
    QueryCallback,
    Socket,
    SocketOptions
} from './types.ts';

export class Client {
    static readonly NO_PASSWORD = NO_PASSWORD;
    readonly OID = OID;
    database: string;
    username: string;
    password: string | NoPasswordValue;
    socketOptions: SocketOptions;
    constructor(options: ClientOptions) {
        //NOTE: reflect get because Object.keys doesn't use generics
        if (Object.keys(options).some(k => Reflect.get(options, k) === '')) {
            throw new Error(`Option values can't be an empty string.`);
        }
        this.database = options.database;
        this.username = options.username;
        this.password = options.password;
        if ('unix' in options) {
            if (this.password === Client.NO_PASSWORD.PEER) {
                if (!Bun.env.USER) {
                    throw new Error('Environment variable USER needs be defined when using peer method on unix connection.');
                }
                if (Bun.env.USER !== this.username) {
                    throw new Error(`Environment variable USER (${Bun.env.USER}) needs to match client username ${this.username} when using peer method on unix connection.`);
                }
            }
            this.socketOptions = {
                unix: options.unix
            }
            return;
        }
        this.socketOptions = {
            hostname: options.hostname,
            port: options.port
        }
    }
    protected connect(callback: ConnectCallback, id?: number): TCPSocketConnectOptions<Data>;
    protected connect(callback: ConnectCallback, id?: number): UnixSocketOptions<Data>;
    protected connect(callback: ConnectCallback, id?: number): TCPSocketConnectOptions<Data> | UnixSocketOptions<Data> {
        //NOTE: data id 0 means the data is for a client and not a pool,
        //if it's for pool it'll be reassigned when this.connect is called
        const data = util.getDefaultData({ ...this, id: id ?? 0 });
        data.status = STATUS.CONNECTING;
        data.callbacks.connect = callback;
        if ('unix' in this.socketOptions) {
            return {
                unix: this.socketOptions.unix,
                data,
                socket: handler
            }
        }
        return {
            hostname: this.socketOptions.hostname,
            port: this.socketOptions.port,
            data,
            socket: handler
        }
    }
    protected prepareSocket(socket: Socket, bind: BindOptions, callback: QueryCallback, parse?: ParseOptions): void {
        if (!util.isStatus(socket, STATUS.READY_FOR_QUERY)) return;
        socket.data.callbacks.query = callback;
        if (parse) {
            if (parse.name.length > 63) {
                console.log(`Parse name (${parse.name}) length (${parse.name.length}) is greater than 63 characters.`
                    + 'Postgres only supports up to 63 characters for parse names, this can cause conflicts and silent errors binding queries.');
            }
            socket.data.status = STATUS.PARSING;
            const typeCount = parse.types?.length ?? 0;
            const length = 1 + 4 + parse.name.length + 1 + parse.query.length + 1 + 2 + (typeCount * 4);
            const buffer = Buffer.allocUnsafe(length);
            let offset = 0;
            buffer[offset] = CLIENT_CODE.PARSE;
            buffer.writeInt32BE(length - 1, ++offset);
            buffer.write(parse.name, offset += 4);
            buffer[offset += parse.name.length] = WRITE.NULL_TERMINATOR;
            buffer.write(parse.query, ++offset);
            buffer[offset += parse.query.length] = WRITE.NULL_TERMINATOR;
            buffer.writeInt16BE(typeCount, ++offset);
            offset += 2;
            for (let i = 0; i < typeCount; i++) {
                //NOTE: non-null assertion on parse.types because typeCount references parse.types.length,
                //and non-null assertion on index because never reassigning "i"
                buffer.writeInt32BE(parse.types![i]!, offset);
                offset += 4;
            }
            socket.write(buffer);
        } else {
            socket.data.status = STATUS.PARSE_COMPLETE;
        }
        const valueCount = bind.values?.length ?? 0;
        let length = 1 + 4 + 1 + bind.name.length + 1 + 2 + (valueCount * 2) + 2 + (valueCount * 4);
        for (let i = 0; i < valueCount; i++) {
            //NOTE: non-null assertion on bind.values because valueCount references bind.values.length,
            //and non-null assertion on index because never reassigning "i"
            const value = bind.values![i]!;
            if (value !== null) length += Buffer.byteLength(value);
        }
        length += 2;
        let buffer = Buffer.allocUnsafe(length);
        let offset = 0;
        buffer[offset] = CLIENT_CODE.BIND;
        buffer.writeInt32BE(length - 1, ++offset);
        buffer[offset += 4] = WRITE.NULL_TERMINATOR;
        buffer.write(bind.name, ++offset);
        buffer[offset += bind.name.length] = WRITE.NULL_TERMINATOR;
        buffer.writeInt16BE(valueCount, ++offset);
        offset += 2;
        for (let i = 0; i < valueCount; i++) {
            //NOTE: non-null assertion on bind.values because valueCount references bind.values.length,
            //and non-null assertion on index because never reassigning "i"
            const value = bind.values![i]!;
            if (value === null || typeof value === 'string') {
                buffer.writeInt16BE(BIND_VALUE_TYPE.TEXT, offset);
            } else {
                buffer.writeInt16BE(BIND_VALUE_TYPE.BINARY, offset);
            }
            offset += 2;
        }
        buffer.writeInt16BE(valueCount, offset);
        offset += 2;
        for (let i = 0; i < valueCount; i++) {
            //NOTE: non-null assertion on bind.values because valueCount references bind.values.length,
            //and non-null assertion on index because never reassigning "i"
            const value = bind.values![i]!;
            if (value === null) {
                buffer.writeInt32BE(-1, offset);
                offset += 4;
            } else if (typeof value === 'string') {
                const byteLength = Buffer.byteLength(value);
                buffer.writeInt32BE(byteLength, offset);
                buffer.write(value, offset += 4);
                offset += byteLength;
            } else {
                buffer.writeInt32BE(value.byteLength, offset);
                value.copy(buffer, offset += 4);
                offset += value.byteLength;
            }
        }
        buffer.writeInt16BE(BIND_VALUE_TYPE.TEXT, offset);
        socket.write(buffer);
        socket.write(WRITE.EMPTY_DESCRIBE_PORTAL);
        socket.write(WRITE.EMPTY_EXECUTE);
        socket.write(WRITE.SYNC);
    }
    protected querySocket(socket: Socket, query: string, callback: QueryCallback): void {
        if (!util.isStatus(socket, STATUS.READY_FOR_QUERY)) return;
        socket.data.status = STATUS.QUERYING;
        socket.data.callbacks.query = callback;
        const length = 1 + 4 + query.length + 1;
        const buffer = Buffer.allocUnsafe(length);
        let offset = 0;
        buffer[offset] = CLIENT_CODE.QUERY;
        buffer.writeInt32BE(length - 1, ++offset);
        buffer.write(query, offset += 4);
        buffer[offset += query.length] = WRITE.NULL_TERMINATOR;
        socket.write(buffer);
    }
    protected disconnectSocket(socket: Socket, callback: DisconnectCallback): void {
        if (!util.isStatus(socket, STATUS.READY_FOR_QUERY)) return;
        socket.data.status = STATUS.DISCONNECTING;
        socket.data.callbacks.disconnect = callback;
        socket.end(WRITE.TERMINATE);
    }
}