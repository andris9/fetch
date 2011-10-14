# fetch

Fetch url contents. Supports gzipped content for quicker download, redirects (with automatic cookie handling, so no eternal redirect loops), streaming and piping etc.

## Install

    npm install fetch

## Usage

See test.js for a complete example

## Headers

Request headers can be set with `options.headers`

    options = {
        headers:{
            "X-My-Header": "This is a custom header field"
        }
    }

## User-Agent
User-Agent value can be set with `options.headers['User-Agent']` value. Defaults to `"FetchStream"`

    options = {
        headers: {
            "User-Agent": "MyUseragent/1.0"
        }
    }

## Cookies
Cookies can be set with `options.cookies` which takes an array with cookie definitions

    options = {
        cookie: ["name=value", "key=value; path=/; secure"]
    }

**NB** Do not set cookie field directly in request header as it will be overwritten.

## Redirects

Redirects are on by default, use `options.disableRedirects` to disable. Maximum redirect count can be set with `options.maxRedirects` (defaults to 10)

    options = {
        disableRedirects: true
    }

    options = {
        maxRedirects: 100
    }

## Disable Gzip support

Gzip and Deflate support is automatically on. This is problematic in Node v0.5.9 and below since Zlib on these versions is buggy and tends to yield in error.

    options = {
        disableGzip: true
    }

## Piping to file

`FetchStream` is a readable Stream object and thus can be piped. For example stream URL contents directly to a file:

    var FetchStream = require("./fetch").FetchStream,
        fs = require("fs"),
        out;

    out = fs.createWriteStream('file.html');
    new FetchStream("http://www.example.com/index.php").pipe(out);

## License

BSD