import type { ClientErrorOptions } from './types.ts';

export class ClientError extends Error {
    override cause: Omit<ClientErrorOptions, 'message'>;
    constructor(options: ClientErrorOptions) {
        super(options.message || 'Empty string for client error message.');
        this.name = 'ClientError';
        this.cause = {
            code: options.code,
            severity: options.severity
        }
        if (options.constraint) this.cause.constraint = options.constraint;
        if (options.detail) this.cause.detail = options.detail;
        if (options.file) this.cause.file = options.file;
        if (options.hint) this.cause.hint = options.hint;
        if (options.line) this.cause.line = options.line;
        if (options.position) this.cause.position = options.position;
        if (options.routine) this.cause.routine = options.routine;
        if (options.schema) this.cause.schema = options.schema;
        if (options.table) this.cause.table = options.table;
        if (options.vseverity) this.cause.vseverity = options.vseverity;
    }
}

export class HashError extends Error {
    override cause: { data?: unknown };
    constructor(options: {
        message: string;
        data?: unknown;
    }) {
        super(options.message || 'Empty string for hash error message.');
        this.name = 'HashError';
        this.cause = {};
        if (options.data) this.cause.data = options.data;
    }
}

export class PoolError extends Error {
    override cause: { value?: unknown; values?: unknown; };
    constructor(options: {
        message: string;
        value?: unknown;
        values?: unknown;
    }) {
        super(options.message || 'Empty string for pool error message.');
        this.name = 'PoolError';
        this.cause = {};
        if (options.value) this.cause.value = options.value;
        if (options.values) this.cause.values = options.values;
    }
}