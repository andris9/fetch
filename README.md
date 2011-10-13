# fetch

Fetch url contents

## Install

    npm install fetch

## Usage

    var fetch = require("fetch");

    fetch("http://www.google.com", function(error, response){
        console.log(response.status);
        console.log(response.headers);
        console.log(response.body);
    });

See test.js for a complete example

## License

BSD