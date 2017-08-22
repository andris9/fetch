/* eslint no-console:0 */

'use strict';

const FetchStream = require('../lib/fetch').FetchStream;

let fetch = new FetchStream('http://google.com', {
    headers: {}
});

fetch.on('data', chunk => {
    console.log(chunk);
});

fetch.on('meta', meta => {
    console.log(meta);
});

fetch.on('end', () => {
    console.log('END');
});

fetch.on('error', e => {
    console.log('ERROR: ' + ((e && e.message) || e));
});
