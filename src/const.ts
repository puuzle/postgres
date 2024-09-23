export const AUTHENTICATION = {
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONOK
    OK: 0,
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONCLEARTEXTPASSWORD
    CLEAR_TEXT: 3,
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONMD5PASSWORD
    MD5: 5,
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONSASL
    SASL: 10,
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONSASLCONTINUE
    SASL_CONTINUE: 11,
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONSASLFINAL
    SASL_FINAL: 12
} as const,

BIND_VALUE_TYPE = {
    TEXT: 0,
    BINARY: 1
} as const,

CLIENT_CODE = {
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PASSWORDMESSAGE
    PASSWORD: 0x70, //p
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PARSE
    PARSE: 0x50, //P
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-BIND
    BIND: 0x42, //B
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-DESCRIBE
    DESCRIBE: 0x44, //D
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-EXECUTE
    EXECUTE: 0x45, //E
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-SYNC
    SYNC: 0x53, //S
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-QUERY
    QUERY: 0x51, //Q
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-TERMINATE
    TERMINATE: 0x58 //X
} as const,

//https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-DESCRIBE
DESCRIBE_TYPE = {
    PREPARE: 0x53, //S
    PORTAL: 0x50 //P
} as const,

DISCONNECT_STATUS = {
    NO_SOCKET_EXISTS: 0,
    NOT_READY: 1,
    OK: 2
} as const,

//https://www.postgresql.org/docs/16/protocol-error-fields.html#PROTOCOL-ERROR-FIELDS
ERROR_CODE = {
    NULL_TERMINATOR: 0x30, //'0'
    CODE: 0x43, //C
    CONSTRAINT: 0x6e, //n
    DETAIL: 0x44, //D
    FILE: 0x46, //F
    HINT: 0x48, //H
    LINE: 0x4c, //L
    MESSAGE: 0x4d, //M
    POSITION: 0x50, //P
    ROUTINE: 0x52, //R
    SCHEMA: 0x73, //s
    SEVERITY: 0x53, //S
    TABLE: 0x74, //t
    VSEVERITY: 0x56 //V
} as const,

HASH_REGEX = {
    BASE_64: /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/,
    ITERATION: /^[1-9][0-9]*$/,
    //https://www.ascii-code.com/characters/printable-characters
    //NOTE: between 0x21 to 0x2b or 0x2d to 0x7e
    PRINTABLE_CHARS: /^[!-+--~]+$/,
    SASL_KEYS: /^[rsiv]=/
} as const,

NO_PASSWORD = {
    PEER: 0,
    TRUST: 1
} as const,

//NOTE: to retrieve more query "SELECT atttypid FROM pg_attribute WHERE attrelid = '<table_name>'::regclass;
OID = {
    BOOL: 16,
    NAME: 19,
    BIGINT: 20,
    SMALLINT: 21,
    INTEGER: 23,
    TEXT: 25,
    VARCHAR: 1043
} as const,

POOL_REGEX = {
    MAX_CONNECTIONS_RANGE: /^(?:[1-9]|[1-9][0-9]{1,2}|1000)$/,
    QUERY_VALUES: /\$([0-9]+)/g
} as const,

//https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-STARTUPMESSAGE
PROTOCOL_VERSION = 196608,

//https://github.com/brianc/node-pg-types/blob/master/lib/builtins.js are built oids,
//so for the non built in, run a query that involves the needed type and debug the object identifier,
//which is in the dataHandler.fields method
RESULT_TYPE: Record<number, string> = {
    16: 'BOOL',
    19: 'NAME',
    20: 'BIGINT',
    21: 'SMALLINT',
    23: 'INTEGER', //4 bytes
    25: 'TEXT',
    1043: 'VARCHAR'
},

SASL_KEYS = {
    r: 'nonce',
    s: 'salt',
    i: 'iteration',
    v: 'server_signature'
} as const,

SERVER_CODE = {
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PARAMETERSTATUS
    PARAMETER_STATUS: 0x53, //S
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-BACKENDKEYDATA
    BACKEND_KEY_DATA: 0x4b, //K
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-AUTHENTICATIONOK (inbetween 0 and 12)
    AUTHENTICATION: 0x52, //R
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-ERRORRESPONSE
    ERROR_RESPONSE: 0x45, //E
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-NOTICERESPONSE
    NOTICE_RESPONSE: 0x4e, //N
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-READYFORQUERY
    READY_FOR_QUERY: 0x5a, //Z
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PARSECOMPLETE
    PARSE_COMPLETE: 0x31, //'1'
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-BINDCOMPLETE
    BIND_COMPLETE: 0x32, //'2'
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-PARAMETERDESCRIPTION
    PARAMETER_DESCRIPTION: 0x74, //t
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-NODATA
    NO_DATA: 0x6e, //n
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-ROWDESCRIPTION
    ROW_DESCRIPTION: 0x54, //T
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-DATAROW
    DATA_ROW: 0x44, //D
    //https://www.postgresql.org/docs/16/protocol-message-formats.html#PROTOCOL-MESSAGE-FORMATS-COMMANDCOMPLETE
    COMMAND_COMPLETE: 0x43 //C
} as const,

//NOTE: workaround because bun.d.ts has incorrect typing for readyState,
//and don't know the number for "closing" (they might not have one at the moment)
SOCKET_STATUS = {
    OPEN: 1 as unknown as "open",
    CLOSED: -1 as unknown as "closed"
},

STATUS = {
    DISCONNECTED: 0,
    DISCONNECTING: 1,
    CONNECTED: 2,
    CONNECTING: 3,
    AUTHING: 4,
    PARSING: 5,
    QUERYING: 6,
    PARSE_COMPLETE: 7,
    READY_FOR_QUERY: 8,
    READY_FOR_RESULTS: 9,
    ERROR: 10,
    INTERNAL_ERROR: 11
} as const,

UNEXPECTED_HANDLER = {
    HANDSHAKE: 0,
    DRAIN: 1,
    END: 2,
    TIMEOUT: 3
} as const,

WRITE = {
    EMPTY_DESCRIBE_PORTAL: Buffer.from([ CLIENT_CODE.DESCRIBE, 0, 0, 0, 6, DESCRIBE_TYPE.PORTAL, 0 ]),
    EMPTY_EXECUTE: Buffer.from([ CLIENT_CODE.EXECUTE, 0, 0, 0, 9, 0, 0, 0, 0, 0 ]),
    NULL_TERMINATOR: 0x00, //'\0'
    SYNC: Buffer.from([ CLIENT_CODE.SYNC, 0, 0, 0, 4 ]),
    TERMINATE: Buffer.from([ CLIENT_CODE.TERMINATE, 0, 0, 0, 4 ])
} as const;