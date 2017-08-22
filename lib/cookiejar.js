'use strict';

const Biskviit = require('biskviit');

// Thin layer around biskviit to keep API compatibility
class CookieJar {
    constructor(options) {
        this.options = options || {};
        this.biskviit = new Biskviit({
            sessionTimeout: this.options.sessionTimeout || 1800 // expire cookies after 30 minutes by default
        });
    }

    getCookies(url) {
        return this.biskviit.get(url);
    }

    setCookie(cookieStr, url) {
        this.biskviit.set(cookieStr, url);
    }
}

module.exports.CookieJar = CookieJar;
