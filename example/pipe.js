/* eslint no-console:0 */

'use strict';

// pipe to file

const FetchStream = require('../lib/fetch').FetchStream;
const fs = require('fs');

const inp = new FetchStream('http://google.com');
const out = fs.createWriteStream('google.html');

inp.on('end', () => {
    console.log('downloaded!');
});

inp.pipe(out);
