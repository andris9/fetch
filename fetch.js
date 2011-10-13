var http = require("http"),
    https = require("https"),
    urllib = require("url"),
    zlib = require('zlib');

/*

headers: {}
payload: txt

maxresponse (100kB)
headers: {}
maxredirects: 10

*/

module.exports = fetch;

function fetch(url, options, callback){

    if(!callback && typeof options == "function"){
        callback = options;
        options = undefined;
    }

    options = options || {};
    if(typeof options.maxredirects != "number" && !(options.maxredirects instanceof Number)){
        options.maxredirects = 10;
    }

    // todo: redirects
    function go(url, i){
        i = i || 0;

        get(url, options, function(error, response){
            if(error){
                return callback(error);
            }
            if([301, 302].indexOf(response.status)>=0 && response.headers.location){
                i++;
                if(i>options.maxredirects){
                    return callback(null, response);
                }
                go(response.headers.location, i);
            }else{
                return callback(null, response);
            }
        });
    }

    go(url);

}

function get(url, options, callback){

    if(!callback && typeof options == "function"){
        callback = options;
        options = undefined;
    }

    options = options || {};

    options.maxresponse = options.maxresponse || (100*1024); // 100kB

    var urlparts = urllib.parse(url, false, true),
        transport,
        urloptions = {
            host: urlparts.hostname,
            port: urlparts.port,
            path: urlparts.pathname + (urlparts.search || "") || "/",
            method: options.payload?'POST':'GET'
        };

    if(!urloptions.port){
        switch(urlparts.protocol){
            case "https:":
                urloptions.port = 443;
                transport = https;
                break;
            case "https:":
            default:
                urloptions.port = 80;
                transport = http;
                break;
        }
    }

    if(options.headers){
        urloptions.headers = options.headers;
    }else{
        urloptions.headers = {};
    }

    if(!options.nocompress){
        urloptions.headers['Accept-Encoding'] = 'gzip';
    }

    var req = transport.request(urloptions, function(res) {

        var responseBody = new Buffer(0),
            currentPart,
            maxlen,
            unpack,

            receive = function(chunk){

                if(responseBody.length + chunk.length>options.maxresponse){
                    maxlen = options.maxresponse - responseBody.length;
                }else{
                    maxlen = chunk.length;
                }
                if(maxlen<=0)return;

                currentPart = new Buffer(responseBody.length + maxlen);
                responseBody.copy(currentPart);
                chunk.copy(currentPart, responseBody.length, 0, maxlen);
                responseBody = currentPart;
            },

            end = function(){
                callback(null, {
                    status: res.statusCode,
                    headers: res.headers,
                    body: responseBody
                });
            }

        if(res.headers['content-encoding']){
            switch(res.headers['content-encoding'].toLowerCase().trim()){
                case "gzip":
                    unpack = zlib.createGunzip();
                    unpack.on("data", receive);
                    unpack.on("error", callback);
                    unpack.on("end", end);
                    res.pipe(unpack);
                    return;
                case "deflate":
                    unpack = zlib.createInflateRaw();
                    unpack.on("data", receive);
                    unpack.on("error", callback);
                    unpack.on("end", end);
                    res.pipe(unpack);
                    return;
            }
        }

        res.on('data', receive);
        res.on('end', end);
    });

    req.on('error', callback);

    if(options.payload){
        req.end(options.payload);
    }else{
        req.end();
    }

}
