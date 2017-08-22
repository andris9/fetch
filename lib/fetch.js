'use strict';

const http = require('http');
const https = require('https');
const urllib = require('url');
const zlib = require('zlib');
const dns = require('dns');
const Stream = require('stream').Readable;
const CookieJar = require('./cookiejar').CookieJar;
const iconv = require('iconv-lite');
const net = require('net');

class FetchStream extends Stream {
    constructor(url, options) {
        super();

        options = options || {};

        this.url = url;
        if (!this.url) {
            return this.emit('error', new Error('url not defined'));
        }

        this.userAgent = options.userAgent || 'FetchStream';

        this._redirectCount = 0;

        this.options = options || {};
        this.normalizeOptions();

        // prevent errors before 'error' handler is set by defferring actions
        if (typeof setImmediate !== 'undefined') {
            setImmediate(this.runStream.bind(this, url));
        } else {
            process.nextTick(this.runStream.bind(this, url));
        }
        this.responseBuffer = Buffer.alloc(0);
        this.ended = false;
        this.readyToRead = 0;
    }

    _read(size) {
        if (this.ended && this.responseBuffer.length === 0) {
            this.push(null);
            return;
        }
        this.readyToRead += size;
        this.drainBuffer();
    }

    drainBuffer() {
        if (this.readyToRead === 0) {
            return;
        }
        if (this.responseBuffer.length === 0) {
            return;
        }
        let push;
        let rest;
        let restSize;

        if (this.responseBuffer.length > this.readyToRead) {
            push = Buffer.alloc(this.readyToRead);
            this.responseBuffer.copy(push, 0, 0, this.readyToRead);
            restSize = this.responseBuffer.length - this.readyToRead;
            rest = Buffer.alloc(restSize);
            this.responseBuffer.copy(rest, 0, this.readyToRead);
        } else {
            push = this.responseBuffer;
            rest = Buffer.alloc(0);
        }
        this.responseBuffer = rest;
        this.readyToRead = 0;
        if (this.options.encoding) {
            this.push(push, this.options.encoding);
        } else {
            this.push(push);
        }
    }

    destroy(ex) {
        this.emit('destroy', ex);
    }

    normalizeOptions() {
        // cookiejar
        this.cookieJar = this.options.cookieJar || new CookieJar();

        // default redirects - 10
        // if disableRedirect is set, then 0
        if (!this.options.disableRedirect && typeof this.options.maxRedirects !== 'number' && !(this.options.maxRedirects instanceof Number)) {
            this.options.maxRedirects = 10;
        } else if (this.options.disableRedirects) {
            this.options.maxRedirects = 0;
        }

        // normalize header keys
        // HTTP and HTTPS takes in key names in case insensitive but to find
        // an exact value from an object key name needs to be case sensitive
        // so we're just lowercasing all input keys
        this.options.headers = this.options.headers || {};

        let keys = Object.keys(this.options.headers);
        let newheaders = {};
        let i;

        for (i = keys.length - 1; i >= 0; i--) {
            newheaders[keys[i].toLowerCase().trim()] = this.options.headers[keys[i]];
        }

        this.options.headers = newheaders;

        if (!this.options.headers['user-agent']) {
            this.options.headers['user-agent'] = this.userAgent;
        }

        if (!this.options.headers.pragma) {
            this.options.headers.pragma = 'no-cache';
        }

        if (!this.options.headers['cache-control']) {
            this.options.headers['cache-control'] = 'no-cache';
        }

        if (!this.options.disableGzip) {
            this.options.headers['accept-encoding'] = 'gzip, deflate';
        } else {
            delete this.options.headers['accept-encoding'];
        }

        // max length for the response,
        // if not set, default is Infinity
        if (!this.options.maxResponseLength) {
            this.options.maxResponseLength = Infinity;
        }

        // method:
        // defaults to GET, or when payload present to POST
        if (!this.options.method) {
            this.options.method = this.options.payload || this.options.payloadSize ? 'POST' : 'GET';
        }

        // set cookies
        // takes full cookie definition strings as params
        if (this.options.cookies) {
            for (i = 0; i < this.options.cookies.length; i++) {
                this.cookieJar.setCookie(this.options.cookies[i], this.url);
            }
        }

        // rejectUnauthorized
        if (typeof this.options.rejectUnauthorized === 'undefined') {
            this.options.rejectUnauthorized = true;
        }
    }

    parseUrl(url) {
        let urlparts = urllib.parse(url, false, true);
        let transport;
        let urloptions = {
            host: urlparts.hostname || urlparts.host,
            port: urlparts.port,
            path: urlparts.pathname + (urlparts.search || '') || '/',
            method: this.options.method,
            rejectUnauthorized: this.options.rejectUnauthorized
        };

        switch (urlparts.protocol) {
            case 'https:':
                transport = https;
                break;
            case 'http:':
            default:
                transport = http;
                break;
        }

        if (transport === https) {
            if ('agentHttps' in this.options) {
                urloptions.agent = this.options.agentHttps;
            } else if ('agent' in this.options) {
                urloptions.agent = this.options.agent;
            }
        } else if ('agentHttp' in this.options) {
            urloptions.agent = this.options.agentHttp;
        } else if ('agent' in this.options) {
            urloptions.agent = this.options.agent;
        }

        if (!urloptions.port) {
            switch (urlparts.protocol) {
                case 'https:':
                    urloptions.port = 443;
                    break;
                case 'http:':
                default:
                    urloptions.port = 80;
                    break;
            }
        }

        if (this.options.localAddress) {
            urloptions.localAddress = this.options.localAddress;
        }

        urloptions.headers = this.options.headers || {};

        if (this.options.user) {
            let buf = Buffer.from([].concat(this.options.user).concat(this.options.pass || []).join(':'));
            urloptions.headers.Authorization = 'Basic ' + buf.toString('base64');
        } else if (urlparts.auth) {
            let buf = Buffer.from(urlparts.auth);
            urloptions.headers.Authorization = 'Basic ' + buf.toString('base64');
        }

        return {
            urloptions,
            transport
        };
    }

    setEncoding(encoding) {
        this.options.encoding = encoding;
    }

    runStream(url) {
        let urlData = this.parseUrl(url);
        let cookies = this.cookieJar.getCookies(url);

        if (cookies) {
            urlData.urloptions.headers.cookie = cookies;
        } else {
            delete urlData.urloptions.headers.cookie;
        }

        if (this.options.payload) {
            urlData.urloptions.headers['content-length'] = Buffer.byteLength(this.options.payload || '', 'utf-8');
        }

        if (this.options.payloadSize) {
            urlData.urloptions.headers['content-length'] = this.options.payloadSize;
        }

        if (this.options.asyncDnsLoookup) {
            let dnsCallback = function(err, addresses) {
                if (err) {
                    this.emit('error', err);
                    return;
                }

                urlData.urloptions.headers.host = urlData.urloptions.hostname || urlData.urloptions.host;
                urlData.urloptions.hostname = addresses[0];
                urlData.urloptions.host = urlData.urloptions.headers.host + (urlData.urloptions.port ? ':' + urlData.urloptions.port : '');

                this._runStream(urlData, url);
            }.bind(this);

            if (net.isIP(urlData.urloptions.host)) {
                dnsCallback(null, [urlData.urloptions.host]);
            } else {
                dns.resolve4(urlData.urloptions.host, dnsCallback);
            }
        } else {
            this._runStream(urlData, url);
        }
    }

    _runStream(urlData, url) {
        let req = urlData.transport.request(urlData.urloptions, res => {
            // catch new cookies before potential redirect
            if (Array.isArray(res.headers['set-cookie'])) {
                for (let i = 0; i < res.headers['set-cookie'].length; i++) {
                    this.cookieJar.setCookie(res.headers['set-cookie'][i], url);
                }
            }

            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                if (!this.options.disableRedirects && this.options.maxRedirects > this._redirectCount && res.headers.location) {
                    this._redirectCount++;
                    req.destroy();
                    this.runStream(urllib.resolve(url, res.headers.location));
                    return;
                }
            }

            this.meta = {
                status: res.statusCode,
                responseHeaders: res.headers,
                finalUrl: url,
                redirectCount: this._redirectCount,
                cookieJar: this.cookieJar
            };

            let curlen = 0;
            let maxlen;

            let receive = chunk => {
                if (curlen + chunk.length > this.options.maxResponseLength) {
                    maxlen = this.options.maxResponseLength - curlen;
                } else {
                    maxlen = chunk.length;
                }

                if (maxlen <= 0) {
                    return;
                }

                curlen += Math.min(maxlen, chunk.length);
                if (maxlen >= chunk.length) {
                    if (this.responseBuffer.length === 0) {
                        this.responseBuffer = chunk;
                    } else {
                        this.responseBuffer = Buffer.concat([this.responseBuffer, chunk]);
                    }
                } else {
                    this.responseBuffer = Buffer.concat([this.responseBuffer, chunk], this.responseBuffer.length + maxlen);
                }
                this.drainBuffer();
            };

            let error = err => {
                this.ended = true;
                this.emit('error', err);
                this.drainBuffer();
            };

            let end = () => {
                this.ended = true;
                if (this.responseBuffer.length === 0) {
                    this.push(null);
                }
            };

            let unpack = (type, res) => {
                let z = zlib['create' + type]();
                z.on('data', receive);
                z.on('error', error);
                z.on('end', end);
                res.pipe(z);
            };

            this.emit('meta', this.meta);

            if (res.headers['content-encoding']) {
                switch (res.headers['content-encoding'].toLowerCase().trim()) {
                    case 'gzip':
                        return unpack('Gunzip', res);
                    case 'deflate':
                        return unpack('InflateRaw', res);
                }
            }

            res.on('data', receive);
            res.on('end', end);
        });

        req.on('error', e => {
            this.emit('error', e);
        });

        if (this.options.timeout) {
            req.setTimeout(this.options.timeout, req.abort.bind(req));
        }
        this.on('destroy', req.abort.bind(req));

        if (this.options.payload) {
            req.end(this.options.payload);
        } else if (this.options.payloadStream) {
            this.options.payloadStream.pipe(req);
            this.options.payloadStream.resume();
        } else {
            req.end();
        }
    }
}

function fetchUrl(url, options, callback) {
    if (!callback && typeof options === 'function') {
        callback = options;
        options = undefined;
    }
    options = options || {};

    let fetchstream = new FetchStream(url, options);
    let responseData;
    let chunks = [];
    let chunklen = 0;
    let buffer;
    let contentType;
    let callbackFired = false;

    fetchstream.on('meta', meta => {
        responseData = meta;
        contentType = _parseContentType(meta.responseHeaders['content-type']);
    });

    fetchstream.on('data', chunk => {
        if (chunk) {
            chunks.push(chunk);
            chunklen += chunk.length;
        }
    });

    fetchstream.on('error', error => {
        if (error && error.code === 'HPE_INVALID_CONSTANT') {
            // skip invalid formatting errors
            return;
        }
        if (callbackFired) {
            return;
        }
        callbackFired = true;
        callback(error);
    });

    fetchstream.on('end', () => {
        if (callbackFired) {
            return;
        }
        callbackFired = true;

        buffer = Buffer.concat(chunks, chunklen);

        if (!options.disableDecoding && !options.outputEncoding) {
            return callback(null, responseData, buffer);
        }

        if (contentType.mimeType === 'text/html') {
            contentType.charset = _findHTMLCharset(buffer) || contentType.charset;
        }

        contentType.charset = (options.overrideCharset || contentType.charset || 'utf-8').trim().toLowerCase();

        if (!options.disableDecoding && !contentType.charset.match(/^utf-?8$/i)) {
            try {
                buffer = iconv.decode(buffer, contentType.charset);
                if (options.outputEncoding && ['base64', 'hex'].includes(options.outputEncoding.toLowerCase())) {
                    buffer = Buffer.from(buffer);
                }
            } catch (E) {
                // failed decoding
            }
        }

        if (options.outputEncoding) {
            return callback(null, responseData, typeof buffer === 'string' ? buffer : buffer.toString(options.outputEncoding));
        } else {
            return callback(null, responseData, buffer);
        }
    });
}

function _parseContentType(str) {
    if (!str) {
        return {};
    }
    let parts = str.split(';'),
        mimeType = parts.shift(),
        charset,
        chparts;

    for (let i = 0, len = parts.length; i < len; i++) {
        chparts = parts[i].split('=');
        if (chparts.length > 1) {
            if (chparts[0].trim().toLowerCase() === 'charset') {
                charset = chparts[1];
            }
        }
    }

    return {
        mimeType: (mimeType || '').trim().toLowerCase(),
        charset: (charset || 'UTF-8').trim().toLowerCase() // defaults to UTF-8
    };
}

function _findHTMLCharset(htmlbuffer) {
    let body = htmlbuffer.toString('ascii'),
        input,
        meta,
        charset;

    if ((meta = body.match(/<meta\s+http-equiv=["']content-type["'][^>]*?>/i))) {
        input = meta[0];
    }

    if (input) {
        charset = input.match(/charset\s?=\s?([a-zA-Z\-0-9]*);?/);
        if (charset) {
            charset = (charset[1] || '').trim().toLowerCase();
        }
    }

    if (!charset && (meta = body.match(/<meta\s+charset=["'](.*?)["']/i))) {
        charset = (meta[1] || '').trim().toLowerCase();
    }

    return charset;
}

module.exports.FetchStream = FetchStream;
module.exports.CookieJar = CookieJar;
module.exports.fetchUrl = fetchUrl;
