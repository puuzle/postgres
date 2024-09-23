import { HASH_REGEX, SASL_KEYS } from './const.ts';
import { HashError } from './error.ts';

import type { Hash, SASLKeys } from './types.ts';

export const hash: Hash = {
    textEncoder: new TextEncoder(),
    MD5(string) {
        //NOTE: have to create new instance every time otherwise there's a segmentation fault
        return new Bun.MD5().update(string).digest('hex');
    },
    //https://www.postgresql.org/docs/16/protocol-flow.html#id-1.10.5.7.3
    postgresMD5(username, password, salt) {
        const inner = Buffer.from(this.MD5(password + username));
        const outer = this.MD5(Buffer.concat([inner, salt]).toString());
        return 'md5' + outer;
    },
    async SHA256(buffer) {
        return await crypto.subtle.digest('SHA-256', buffer);
    },
    async signSHA256(keyBuffer, message) {
        const key = await crypto.subtle.importKey('raw', keyBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, [ 'sign' ]);
        return await crypto.subtle.sign('HMAC', key, this.textEncoder.encode(message));
    },
    async deriveSHA256(password, salt, iterations) {
        const key = await crypto.subtle.importKey('raw', this.textEncoder.encode(password), 'PBKDF2', false, [ 'deriveBits' ]);
        return await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 32 * 8);
    },
    randomBytes(length) {
        return crypto.getRandomValues(Buffer.alloc(length));
    },
    parseSASLEntry(string) {
        const map: Map<SASLKeys, string> = new Map();
        const entries = string.split(',');
        for (let i = 0; i < entries.length; i++) {
            //NOTE: non-null assertion because never reassigning "i"
            const entry = entries[i]!;
            if (!HASH_REGEX.SASL_KEYS.test(entry)) {
                throw new HashError({
                    message: `SASL entry didn't pass SASL keys regex.`,
                    data: { string, entries, entry }
                });
            }
            //NOTE: reflect get, non-null assertion, and casting to SASLKeys because SASL_KEYS regex verifies it already
            const key = Reflect.get(SASL_KEYS, entry[0]!) as SASLKeys;
            map.set(key, entry.slice(2));
        }
        return map;
    },
    xorArrayBuffer(a, b) {
        const bufferA = Buffer.from(a);
        const bufferB = Buffer.from(b);
        if (bufferA.length !== bufferB.length) {
            throw new HashError({
                message: `Buffers don't match eachother.`,
                data: { lengthA: bufferA.length, lengthB: bufferB.length }
            });
        }
        if (bufferA.length === 0) {
            throw new HashError({
                message: `Buffers can't be empty.`,
                data: { bufferA, bufferB }
            });
        }
        for (let i = 0; i < bufferA.length; i++) {
            //NOTE: non-null assertion because already checked that buffers are the same length
            bufferA[i] ^= bufferB[i]!;
        }
        return bufferA.toString('base64');
    }
}