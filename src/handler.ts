import { dataHandler } from './data-handler.ts';
import { PROTOCOL_VERSION, SERVER_CODE, SOCKET_STATUS, STATUS, UNEXPECTED_HANDLER } from './const.ts';
import { util } from './util.ts';

import type { Handler } from './types.ts';

export const handler: Handler = {
    open(socket) {
        console.log('open');
        if (!util.isStatus(socket, STATUS.CONNECTING)) return;
        socket.data.status = STATUS.AUTHING;
        const config = `user\0${socket.data.username}\0database\0${socket.data.database}\0\0`;
        const length = 4 + 4 + config.length;
        //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-STARTUPMESSAGE
        const buffer = Buffer.allocUnsafe(length);
        let offset = 0;
        buffer.writeInt32BE(length);
        buffer.writeInt32BE(PROTOCOL_VERSION, offset += 4);
        buffer.write(config, offset += 4);
        socket.write(buffer);
    },
    connectError(socket, error) {
        console.log('connectError');
        if (!util.isSocketClosed(socket)) return;
        //NOTE: never called handler.open
        if (socket.data.status === STATUS.CONNECTING) {
            const connect = socket.data.callbacks.connect;
            if (!connect) {
                error.message += `\nDidn't have connect callback to call connect with error.`;
                throw error;
            }
            socket.data = util.getDefaultData(socket.data);
            return connect(socket, error);
        }
        util.errorCallback(socket, new Error(`Didn't expect handler.connectError to be called.`));
    },
    handshake(socket) {
        console.log('handshake');
        util.unexpectedHandler(socket, UNEXPECTED_HANDLER.HANDSHAKE, false);
    },
    data(socket, data) {
        console.log('data');
        let offset = 0;
        do {
            const rawCode = data[offset++];
            //console.log(rawCode);
            //length of the data including these 4 bytes
            const length = data.readInt32BE(offset);
            offset += 4;
            switch (rawCode) {
                case SERVER_CODE.PARAMETER_STATUS:
                case SERVER_CODE.BACKEND_KEY_DATA:
                    break;
                case SERVER_CODE.AUTHENTICATION:
                    dataHandler.auth(socket, data, offset, length);
                    break;
                case SERVER_CODE.ERROR_RESPONSE:
                case SERVER_CODE.NOTICE_RESPONSE:
                    dataHandler.error(socket, data, offset, length);
                    break;
                case SERVER_CODE.READY_FOR_QUERY: {
                    //TODO: keep track of "backend transaction status indicator"
                    if (socket.data.firstQuery) dataHandler.readyForQuery(socket);
                    else dataHandler.readyForQueryWithResults(socket);
                    break;
                }
                case SERVER_CODE.PARSE_COMPLETE:
                    dataHandler.parseComplete(socket);
                    break;
                case SERVER_CODE.BIND_COMPLETE:
                    dataHandler.bindComplete(socket);
                    break;
                case SERVER_CODE.NO_DATA:
                    //TODO: maybe do something here to prevent going through unnecessary code
                    break;
                case SERVER_CODE.ROW_DESCRIPTION:
                    dataHandler.fields(socket, data, offset);
                    break;
                case SERVER_CODE.DATA_ROW:
                    dataHandler.rows(socket, data, offset);
                    break;
                case SERVER_CODE.COMMAND_COMPLETE: {
                    socket.data.results.status = data.toString('utf-8', offset, data.indexOf(0, offset));
                    dataHandler.readyForResults(socket);
                    break;
                }
                default:
                    return util.error(socket, new Error(`The raw code (${rawCode}) from server is not supported.`));
            }
            //increase the offset by the amount of bytes that were read, but
            //remove 4 since there was 4 added when reading length of payload
            offset += length - 4;
        //loop until the offset is equal to the length of the data
        } while (offset < data.length);
    },
    drain(socket) {
        console.log('drain');
        util.unexpectedHandler(socket, UNEXPECTED_HANDLER.DRAIN, false);
    },
    close(socket) {
        console.log('close');
        if (!util.isSocketClosed(socket)) return;
        if (socket.data.status === STATUS.DISCONNECTED || socket.data.status === STATUS.INTERNAL_ERROR) return;
        if (socket.data.status === STATUS.ERROR) {
            if (!socket.data.callbacks.error) {
                return util.errorCallback(socket, new Error(`Error in callbacks object wasn't defined when it should've been.`));
            }
            return util.errorCallback(socket, socket.data.callbacks.error);
        }
        if (!util.isStatus(socket, STATUS.DISCONNECTING)) return;
        const disconnect = socket.data.callbacks.disconnect;
        if (!disconnect) {
            return util.errorCallback(socket, new Error(`Didn't have disconnect callback to call.`));
        }
        socket.data = util.getDefaultData(socket.data);
        disconnect(null);
    },
    end(socket) {
        console.log('end');
        util.unexpectedHandler(socket, UNEXPECTED_HANDLER.END, true);
    },
    error(socket, error) {
        console.log('error');
        if (socket.data.callbacks.error) {
            socket.data.callbacks.error.message += '\n' + error.message;
        }
        socket.data.status = STATUS.INTERNAL_ERROR;
        error = socket.data.callbacks.error ?? error;
        if (socket.readyState === SOCKET_STATUS.OPEN) socket.shutdown();
        util.errorCallback(socket, error);
    },
    timeout(socket) {
        console.log('timeout');
        util.unexpectedHandler(socket, UNEXPECTED_HANDLER.TIMEOUT, false);
    }
}