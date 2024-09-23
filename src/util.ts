import { SOCKET_STATUS, STATUS, UNEXPECTED_HANDLER, WRITE } from './const.ts';

import type { Util } from './types.ts';

export const util: Util = {
    //NOTE: only method that should set status to ERROR,
    //define error in callbacks object (beside handler.error),
    //and call socket.end (beside client.disconnect)
    error(socket, error) {
        //NOTE: return status mismatch errors if there's a previous error,
        //because if there's a previous error fixing it would fix the status mismatch error
        if (socket.data.status === STATUS.ERROR) return;
        socket.data.status = STATUS.ERROR;
        socket.data.callbacks.error = error;
        socket.end(WRITE.TERMINATE);
    },
    //NOTE: only should be called in handler.connectError, handler.close, handler.error, and this.unexpectedHandler
    errorCallback(socket, error) {
        if (socket.readyState !== SOCKET_STATUS.CLOSED) {
            error.message += `\nSocket ready state (${socket.readyState}) wasn't CLOSED (${SOCKET_STATUS.CLOSED}) in util.errorCallback when it should've been.`;
        }
        const disconnect = socket.data.callbacks.disconnect;
        const query = socket.data.callbacks.query;
        const connect = socket.data.callbacks.connect;
        socket.data = this.getDefaultData(socket.data);
        if (disconnect) return disconnect(error);
        if (query) return query(socket, error, null);
        if (connect) return connect(socket, error);
        error.message += `\nDidn't have callback to call error.`;
        throw error;
    },
    isStatus(socket, status) {
        if (socket.data.status === status) return true;
        this.error(socket, new Error(`Status (${this.getKeyByValue(STATUS, socket.data.status)}) wasn't ${this.getKeyByValue(STATUS, status)} when it should've been.`));
        return false;
    },
    isSASLStatus(socket, saslMessage, saslMechanism) {
        let error: Error | undefined;
        if (socket.data.sasl.message !== saslMessage) {
            error = new Error(`SASL message (${socket.data.sasl.message}) wasn't ${saslMessage} when it should've been.`);
        }
        if (socket.data.sasl.mechanism !== saslMechanism) {
            const message = `SASL mechanism (${socket.data.sasl.mechanism}) wasn't ${saslMechanism} when it should've been.`;
            if (error) error.message += '\n' + message;
            else error = new Error(message);
        }
        if (error) {
            this.error(socket, error);
            return false;
        }
        return true;
    },
    isSocketClosed(socket) {
        if (socket.readyState === SOCKET_STATUS.CLOSED) return true;
        this.error(socket, new Error(`Socket status (${socket.readyState}) wasn't CLOSED (-1) when it should've of been.`));
        return false;
    },
    unexpectedHandler(socket, handler, ensureClosed) {
        const message = `Didn't expect handler.${this.getKeyByValue(UNEXPECTED_HANDLER, handler)} to be called.`;
        if (socket.readyState === SOCKET_STATUS.CLOSED) {
            return this.errorCallback(socket, new Error(message));
        }
        if (ensureClosed && !this.isSocketClosed(socket)) return;
        this.error(socket, new Error(message));
    },
    getKeyByValue(obj, value) {
        for (const key in obj) {
            if (obj[key] === value) return key;
        }
        throw new Error(`Value (${value}) wasn't found in object (${JSON.stringify(obj)}).`);
    },
    getDefaultData(base) {
        return {
            database: base.database,
            username: base.username,
            password: base.password,
            id: base.id,
            callbacks: {
                connect: null,
                query: null,
                disconnect: null,
                error: null
            },
            firstQuery: true,
            parses: new Set(),
            results: {
                fields: [],
                types: [],
                rows: [],
                status: ''
            },
            sasl: {
                message: null,
                mechanism: null,
                nonce: '',
                response: '',
                serverSignature: ''
            },
            status: STATUS.DISCONNECTED
        }
    },
    appendFilter(filters, query, values) {
        //NOTE: no filter (select every row)
        if (filters.length === 0) return query + ';';
        query += ' WHERE';
        //NOTE: postgres evaluates each "AND" operator first then each "OR" operator,
        //so no need for any parentheses to be used
        for (let i = 0; i < filters.length; i++) {
            //NOTE: non-null assertion because never reassigning "i"
            const filter = filters[i]!;
            if (filter.keywords) this.appendKeywords(filter.keywords, query);
            for (const column in filter) {
                //NOTE: non-null assertion because for ... in ... isn't asserting defined
                values.push(filter[column]!);
                query += ` ${column} = $${values.length} AND`;
            }
            //NOTE: ensuring at least one filter was appended,
            //because each property is possible optional in each filter object
            if (query.endsWith(' AND')) query = query.slice(0, -4) + ' OR';
        }
        //NOTE: ensuring at least one filter was appended, because same reason as above
        if (query.endsWith(' OR')) query = query.slice(0, -3);
        return query + ';';
    },
    appendKeywords(keywords, query) {
        keywords.isNotNull?.forEach(column => {
            query += ` ${column} IS NOT NULL AND`;
        });
        keywords.isNull?.forEach(column => {
            query += ` ${column} IS NULL AND`;
        });
        return query;
    }
}