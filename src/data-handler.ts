import { AUTHENTICATION, CLIENT_CODE, ERROR_CODE, HASH_REGEX, NO_PASSWORD, RESULT_TYPE, STATUS, WRITE } from './const.ts';
import { ClientError, HashError } from './error.ts';
import { hash } from './hash.ts';
import { util } from './util.ts';

import type { ClientErrorOptions, DataHandler, Row, SASLKeys } from './types.ts';

//https://miro.medium.com/max/1400/1*xnfJ-I1tEE-1PWA0J88whw.jpeg

export const dataHandler: DataHandler = {
    async auth(socket, data, offset, end) {
        if (!util.isStatus(socket, STATUS.AUTHING)) return;
        const auth = data.readInt32BE(offset);
        offset += 4;
        if (auth === AUTHENTICATION.OK) {
            socket.data.status = STATUS.CONNECTED;
            return;
        }
        if (typeof socket.data.password !== 'string') {
            return util.error(socket, new HashError({
                message: `Server requested "${util.getKeyByValue(AUTHENTICATION, auth)}" authentication but client supplied "${util.getKeyByValue(NO_PASSWORD, socket.data.password)}" authentication method.`
            }));
        }
        if (auth === AUTHENTICATION.CLEAR_TEXT) {
            const length = 1 + 4 + socket.data.password.length + 1;
            const buffer = Buffer.allocUnsafe(length);
            let offset = 0;
            buffer[offset] = CLIENT_CODE.PASSWORD;
            buffer.writeInt32BE(length - 1, ++offset);
            buffer.write(socket.data.password, offset += 4);
            buffer[offset += socket.data.password.length] = WRITE.NULL_TERMINATOR;
            socket.write(buffer);
            return;
        }
        if (auth === AUTHENTICATION.MD5) {
            const salt = data.subarray(offset, offset + 4);
            const md5Hash = hash.postgresMD5(socket.data.username, socket.data.password, salt);
            const length = 1 + 4 + md5Hash.length + 1;
            const buffer = Buffer.allocUnsafe(length);
            offset = 0;
            buffer[offset] = CLIENT_CODE.PASSWORD;
            buffer.writeInt32BE(length - 1, ++offset);
            buffer.write(md5Hash, offset += 4);
            buffer[offset += md5Hash.length] = WRITE.NULL_TERMINATOR;
            socket.write(buffer);
            return;
        }
        if (auth === AUTHENTICATION.SASL) {
            if (!util.isSASLStatus(socket, null, null)) return;
            const mechanisms: string[] = [];
            let mechanism: string | undefined = '';
            do {
                end = offset;
                while(data[end++] !== 0) {}
                //NOTE: -1 for null terminator since it's reading cstring
                mechanism = data.toString('utf-8', offset, end - 1);
                offset = end;
                if (mechanism) mechanisms.push(mechanism);
            } while (mechanism);
            mechanism = mechanisms[0];
            if (mechanism !== 'SCRAM-SHA-256') {
                return util.error(socket, new HashError({
                    message: `Mechanisms wasn't only SCRAM-SHA-256 when it should've been.`,
                    data: { mechanisms }
                }));
            }
            socket.data.sasl.message = 'SASLInitialResponse';
            socket.data.sasl.mechanism = mechanism;
            socket.data.sasl.nonce = hash.randomBytes(18).toString('base64');
            socket.data.sasl.response = 'n,,n=*,r=' + socket.data.sasl.nonce;

            const length = 1 + 4 + socket.data.sasl.mechanism.length + 1 + 4 + socket.data.sasl.response.length;
            const buffer = Buffer.allocUnsafe(length);
            offset = 0;
            buffer[offset] = CLIENT_CODE.PASSWORD;
            buffer.writeInt32BE(length - 1, ++offset);
            buffer.write(socket.data.sasl.mechanism, offset += 4);
            buffer[offset += socket.data.sasl.mechanism.length] = WRITE.NULL_TERMINATOR;
            buffer.writeInt32BE(socket.data.sasl.response.length, ++offset);
            buffer.write(socket.data.sasl.response, offset += 4);
            socket.write(buffer);
            return;
        }
        if (auth === AUTHENTICATION.SASL_CONTINUE) {
            if (!util.isSASLStatus(socket, 'SASLInitialResponse', 'SCRAM-SHA-256')) return;
            //NOTE: +1 because end doesn't include the first server code ('R')
            const saslEntry = data.toString('utf-8', offset, end + 1);
            let entries: Map<SASLKeys, string>
            try {
                entries = hash.parseSASLEntry(saslEntry);
            } catch (error) {
                return util.error(socket, error instanceof HashError ? error : new HashError({
                    message: 'Unknown error from parse SASL entry.'
                        + `\n${error instanceof Error ? error.message : error}`
                }));
            }
            const nonce = entries.get('nonce');
            if (!nonce || !HASH_REGEX.PRINTABLE_CHARS.test(nonce)) {
                return util.error(socket, new HashError({
                    message: `Nonce wasn't printable characters when it should've been.`,
                    data: { saslEntry, entries, nonce }
                }));
            }
            if (!nonce.startsWith(socket.data.sasl.nonce) || nonce.length === socket.data.sasl.nonce.length) {
                return util.error(socket, new HashError({
                    message: `SASL server nonce does not start with client nonce or exactly matches the client nonce.`,
                    data: { clientNonce: socket.data.sasl.nonce, serverNonce: nonce }
                }));
            }
            const salt = entries.get('salt');
            if (!salt || !HASH_REGEX.BASE_64.test(salt)) {
                return util.error(socket, new HashError({
                    message: `Salt wasn't base64 when it should've been.`,
                    data: { saslEntry, entries, salt }
                }));
            }
            const iteration = entries.get('iteration');
            if (!iteration || !HASH_REGEX.ITERATION.test(iteration)) {
                return util.error(socket, new HashError({
                    message: `Iteration didn't pass hash iteration regex.`,
                    data: { saslEntry, entries, iteration }
                }));
            }
            const iterationInt = Number.parseInt(iteration, 10);
            const clientFirstMessageBare = 'n=*,r=' + socket.data.sasl.nonce;
            const serverFirstMessage = 'r=' + nonce + ',s=' + salt + ',i=' + iterationInt;
            const clientFinalMessageWithoutProof = 'c=biws,r=' + nonce;
            const authMessage = clientFirstMessageBare + ',' + serverFirstMessage + ',' + clientFinalMessageWithoutProof;

            let saltedPassword: ArrayBuffer;
            let clientKey: ArrayBuffer;
            let storedKey: ArrayBuffer;
            let clientSignature: ArrayBuffer;
            let serverKey: ArrayBuffer;
            let serverSignature: ArrayBuffer;
            let clientProof: string;
            try {
                saltedPassword = await hash.deriveSHA256(socket.data.password, Buffer.from(salt, 'base64'), iterationInt);
                clientKey = await hash.signSHA256(saltedPassword, 'Client Key');
                storedKey = await hash.SHA256(clientKey);
                clientSignature = await hash.signSHA256(storedKey, authMessage);

                serverKey = await hash.signSHA256(saltedPassword, 'Server Key');
                serverSignature = await hash.signSHA256(serverKey, authMessage);
                clientProof = hash.xorArrayBuffer(clientKey, clientSignature);
            } catch (error) {
                return util.error(socket, new HashError({
                    message: `SASL continue failed to generate the client proof or server signature.`
                        + `\n${error instanceof Error ? error.message : error}`
                }));
            }
            socket.data.sasl.message = 'SASLResponse';
            socket.data.sasl.response = clientFinalMessageWithoutProof + ',p=' + clientProof;
            socket.data.sasl.serverSignature = Buffer.from(serverSignature).toString('base64');

            const length = 1 + 4 + socket.data.sasl.response.length;
            const buffer = Buffer.allocUnsafe(length);
            offset = 0;
            buffer[offset] = CLIENT_CODE.PASSWORD;
            buffer.writeInt32BE(length - 1, ++offset);
            buffer.write(socket.data.sasl.response, offset += 4);
            socket.write(buffer);
            return;
        }
        if (auth === AUTHENTICATION.SASL_FINAL) {
            if (!util.isSASLStatus(socket, 'SASLResponse', 'SCRAM-SHA-256')) return;
            //NOTE: +1 because end doesn't include the first server code ('R')
            const saslEntry = data.toString('utf-8', offset, end + 1);
            let entries: Map<SASLKeys, string>
            try {
                entries = hash.parseSASLEntry(saslEntry);
            } catch (error) {
                return util.error(socket, error instanceof HashError ? error : new HashError({
                    message: 'Unknown error from parse SASL entry.'
                        + `\n${error instanceof Error ? error.message : error}`
                }));
            }
            const serverSignature = entries.get('server_signature');
            if (!serverSignature || !HASH_REGEX.BASE_64.test(serverSignature)) {
                return util.error(socket, new HashError({
                    message: `Server signature wasn't base64 when it should've been.`,
                    data: { saslEntry, entries, serverSignature }
                }));
            }
            if (serverSignature !== socket.data.sasl.serverSignature) {
                return util.error(socket, new HashError({
                    message: `SASL final server signature doesn't match SASL continue server signature.`,
                    data: { finalServerSignature: serverSignature, continueServerSignature: socket.data.sasl.serverSignature }
                }));
            }
            socket.data.sasl = {
                message: null,
                mechanism: null,
                nonce: '',
                response: '',
                serverSignature: ''
            }
            return;
        }
        util.error(socket, new HashError({
            message: `The authentication (${auth}) is not supported.`
        }));
    },
    error(socket, data, offset, length) {
        const error: ClientErrorOptions = {
            code: '',
            constraint: '',
            detail: '',
            file: '',
            hint: '',
            line: '',
            message: '',
            position: '',
            routine: '',
            schema: '',
            severity: '',
            table: '',
            vseverity: ''
        }
        //loop until the offset is equal to the length of the data
        while (offset < length) {
            const rawCode = data[offset++];
            if (!rawCode) {
                return util.error(socket, new Error(`The offset (${offset}) is off on data for error.`));
            }
            if (rawCode === ERROR_CODE.NULL_TERMINATOR) continue;
            const end = data.indexOf(0, offset);
            switch (rawCode) {
                case ERROR_CODE.CODE:
                case ERROR_CODE.CONSTRAINT:
                case ERROR_CODE.DETAIL:
                case ERROR_CODE.FILE:
                case ERROR_CODE.HINT:
                case ERROR_CODE.LINE:
                case ERROR_CODE.MESSAGE:
                case ERROR_CODE.POSITION:
                case ERROR_CODE.ROUTINE:
                case ERROR_CODE.SCHEMA:
                case ERROR_CODE.SEVERITY:
                case ERROR_CODE.TABLE:
                case ERROR_CODE.VSEVERITY:
                    //NOTE: reflect set because if rawCode matches one of these cases then key will be in error object
                    Reflect.set(error, util.getKeyByValue(ERROR_CODE, rawCode).toLowerCase(), data.toString('utf-8', offset, end));
                    break;
                default:
                    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-ERRORRESPONSE
                    //-> "Since more field types might be added in future, frontends should silently ignore fields of unrecognized type."
                    console.log(new Error(`The raw error code (${rawCode}) is not supported.`));
            }
            offset = end + 1;
        }
        //https://www.postgresql.org/docs/16/protocol-error-fields.html#PROTOCOL-ERROR-FIELDS
        switch (error.severity) {
            case 'ERROR':
            case 'FATAL':
            case 'PANIC':
                util.error(socket, new ClientError(error));
                break;
            case 'WARNING':
            case 'NOTICE':
            case 'DEBUG':
            case 'INFO':
            case 'LOG':
                console.log(new ClientError(error));
                break;
            default:
                util.error(socket, new Error(`The severity (${error.severity}) was neither an error or notice message.`));
                break;
        }
    },
    fields(socket, data, offset) {
        if (!util.isStatus(socket, STATUS.QUERYING)) return;
        const fieldCount = data.readInt16BE(offset);
        offset += 2;
        //field count can be 0
        if (fieldCount === 0) return;
        for (let i = 0; i < fieldCount; i++) {
            const end = data.indexOf(0, offset);
            socket.data.results.fields.push(data.toString('utf-8', offset, end));
            //end for field name length + 1 byte for \0 since it's a cstring +
            //4 bytes to skip i32 (oid of table) + 2 bytes to skip i16 (attribute column count)
            offset = end + 1 + 4 + 2;
            //which leaves the offset at the oid for the field's data type
            const rawResultType = data.readInt32BE(offset);
            const resultType = RESULT_TYPE[rawResultType];
            if (!resultType) {
                return util.error(socket, new Error(`The raw result type (${rawResultType}) is not supported or offset (${offset}) is off on data for fields.`));
            }
            socket.data.results.types.push(resultType);
            //4 bytes for i32 (oid of field's data type) + 2 bytes to skip i16 (data type size) +
            //4 bytes to skip i32 (type modifier) + 2 bytes to skip i16 (format code being used)
            offset += 4 + 2 + 4 + 2;
            //which leaves the offset at the next field being the field name
        }
    },
    rows(socket, data, offset) {
        if (!util.isStatus(socket, STATUS.QUERYING)) return;
        const row: Row = {};
        let columnValue: unknown;
        const columnCount = data.readInt16BE(offset);
        offset += 2;
        //column count can be 0
        if (columnCount === 0) return;
        for (let i = 0; i < columnCount; i++) {
            const columnName = socket.data.results.fields[i];
            if (!columnName) {
                return util.error(socket, new Error(`The column name of index ${i} couldn't be found in results fields array.`));
            }
            const length = data.readInt32BE(offset);
            offset += 4;
            //this indicates the row is null
            if (length === -1) {
                //if join query with the same column names then keep the defined column value,
                //otherwise just store the column value as null
                if (!row[columnName]) row[columnName] = null;
                continue;
            }
            //the column value is based on the length given in the 4 bytes before
            const rawColumnValue = data.toString('utf-8', offset, offset + length);
            switch (socket.data.results.types[i]) {
                case undefined:
                    //NOTE: should only occur if columnCount is greater than results.types
                    return util.error(socket, new Error(`The result type at index ${i} is undefined.`));
                case 'NAME': case 'TEXT': case 'VARCHAR':
                    columnValue = rawColumnValue;
                    break;
                case 'SMALLINT': case 'INTEGER':
                    columnValue = Number(rawColumnValue);
                    break;
                case 'BIGINT': {
                    //NOTE: greater than or EQUAL TO because if number of integers is equal,
                    //then it's risky to program with that high of a number even if it's technically a safe integer
                    rawColumnValue.length >= Number.MAX_SAFE_INTEGER.toString().length
                    ? columnValue = BigInt(rawColumnValue)
                    : columnValue = Number(rawColumnValue);
                    break;
                }
                case 'BOOL':
                    switch (rawColumnValue) {
                        case 't':
                            columnValue = true;
                            break;
                        case 'f':
                            columnValue = false;
                            break;
                        case null:
                            columnValue = null;
                            break;
                        default:
                            return util.error(socket, new Error(`The bool value (${rawColumnValue}) is not supported.`));
                    }
                    break;
                default:
                    //NOTE: should only occur if RESULT_TYPE constant has a type that isn't handled in this switch case
                    return util.error(socket, new Error(`The result type (${socket.data.results.types[i]}) at index ${i} is not supported.`));
            }
            row[columnName] = columnValue;
            //position the offset to read in the next column value length by skipping the length of the column value
            offset += length;
        }
        socket.data.results.rows.push(row); 
    },
    parseComplete(socket) {
        if (!util.isStatus(socket, STATUS.PARSING)) return;
        socket.data.status = STATUS.PARSE_COMPLETE;
    },
    bindComplete(socket) {
        if (!util.isStatus(socket, STATUS.PARSE_COMPLETE)) return;
        socket.data.status = STATUS.QUERYING;
    },
    readyForQuery(socket) {
        if (!util.isStatus(socket, STATUS.CONNECTED)) return;
        if (!socket.data.callbacks.connect) {
            return util.error(socket, new Error(`Didn't have connect callback to call.`));
        }
        socket.data.status = STATUS.READY_FOR_QUERY;
        socket.data.firstQuery = false;
        socket.data.callbacks.connect(socket, null);
    },
    readyForResults(socket) {
        if (!util.isStatus(socket, STATUS.QUERYING)) return;
        socket.data.status = STATUS.READY_FOR_RESULTS;
    },
    readyForQueryWithResults(socket) {
        if (!util.isStatus(socket, STATUS.READY_FOR_RESULTS)) return;
        if (!socket.data.callbacks.query) {
            return util.error(socket, new Error(`Didn't have query callback to call query with results.`));
        }
        socket.data.status = STATUS.READY_FOR_QUERY;
        const results = socket.data.results;
        socket.data.results = {
            fields: [],
            types: [],
            rows: [],
            status: ''
        }
        socket.data.callbacks.query(socket, null, results);
    }
}