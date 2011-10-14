# fetch

Fetch url contents. Supports gzipped content for quicker download, redirects (with automatic cookie handling, so no eternal redirect loops), streaming and piping etc.

## Install

    npm install fetch

## Usage

See test.js for a complete example

## Piping to file

Stream URL contents directly to file

    var FetchStream = require("./fetch").FetchStream,
        fs = require("fs"),
        out;

    out = fs.createWriteStream('file.html');
    new FetchStream("http://www.example.com/index.php").pipe(out);


## License

BSD