var http = require("http"),
    https = require("https"),
    urllib = require("url"),
    utillib = require("util"),
    zlib = require('zlib'),
    Stream = require("stream").Stream,
    CookieJar = require("./cookiejar").CookieJar;

/*

maxRedirects : 10
disableRedirects : false
headers: {}
maxResponseLength : Infinity
method: GET
payload: str
disableGzip: false

cookies: ['name=val']

setEncoding: true | utf-8 | latin-1 jne

*/

//TODO:
// - meta infosse faili nimi, juhul kui tegu downloadiga
// - wrapper fetch(url, callback)
// - wrapperile options.setEncoding = true | "UTF-8"

exports.FetchStream = FetchStream;

function FetchStream(url, options){
    Stream.call(this);

    this.url = url;
    if(!this.url){
        return this.emit("error", new Error("url not defined"));
    }

    this.userAgent = "FetchStream";

    this.cookieJar = new CookieJar();

    this._redirect_count = 0;

    this.options = options || {};
    this.normalizeOptions();

    this.runStream(url);
}
utillib.inherits(FetchStream, Stream);


FetchStream.prototype.normalizeOptions = function(){

    // default redirects - 10
    // if disableRedirect is set, then 0
    if(!this.options.disableRedirect && typeof this.options.maxredirects != "number" &&
      !(this.options.maxredirects instanceof Number)){
        this.options.maxRedirects = 10;
    }else if(this.options.disableRedirects){
        this.options.maxRedirects = 0;
    }

    // normalize header keys
    // HTTP and HTTPS takes in key names in case insensitive but to find
    // an exact value from an object key name needs to be case sensitive
    // so we're just lowercasing all input keys
    this.options.headers = this.options.headers || {};

    var keys = Object.keys(this.options.headers),
        newheaders = {},
        i;

    for(i=keys.length-1; i>=0; i--){
        newheaders[keys[i].toLowerCase().trim()] = this.options.headers[keys[i]];
    }

    this.options.headers = newheaders;

    if(!this.options.headers["user-agent"]){
        this.options.headers["user-agent"] = this.userAgent;
    }

    if(!this.options.headers["pragma"]){
        this.options.headers["pragma"] = "no-cache";
    }

    if(!this.options.headers["cache-control"]){
        this.options.headers["cache-control"] = "no-cache";
    }

    if(!this.options.disableGzip){
        this.options.headers['accept-encoding'] = 'gzip, deflate';
    }else{
        delete this.options.headers['accept-encoding'];
    }

    // max length for the response,
    // if not set, default is Infinity
    if(!this.options.maxResponseLength){
        this.options.maxResponseLength = Infinity;
    }

    // method:
    // defaults to GET, or when payload present to POST
    if(!this.options.method){
        this.options.method = this.options.payload?"POST":"GET";
    }

    // set cookies
    // takes full cookie definition strings as params
    if(this.options.cookies){
        for(var i=0; i<this.options.cookies.length; i++){
            this.cookieJar.setCookie(this.options.cookies[i], this.url);
        }
    }

}

FetchStream.prototype.parseUrl = function(url){
    var urlparts = urllib.parse(url, false, true),
        transport,
        urloptions = {
            host: urlparts.hostname,
            port: urlparts.port,
            path: urlparts.pathname + (urlparts.search || "") || "/",
            method: this.options.method
        };

    if(!urloptions.port){
        switch(urlparts.protocol){
            case "https:":
                urloptions.port = 443;
                transport = https;
                break;
            case "http:":
            default:
                urloptions.port = 80;
                transport = http;
                break;
        }
    }

    urloptions.headers = this.options.headers;

    return {
        urloptions: urloptions,
        transport: transport
    }
}

FetchStream.prototype.setEncoding = function(encoding){
    this.options.encoding = encoding;
}

FetchStream.prototype.absoluteUrl = function(url, base){

    var target_url = urllib.parse(url, false, true),
        base_url = urllib.parse(base || "", false, true),
        base_path, target_path, final_path;

    // if protocol is set, then it's good to go
    if(target_url.protocol){
        return url;
    }

    // the url might be int the form of "//www.example.com" with leading slashes -
    // the protocol from the base url must be used, defaults to http
    if(target_url.hostname){
        return (base_url.protocol || "http:") + (url.substr(0,2)!="//"?"//":"") + url;
    }

    // this is absolute path for relative domain
    if(target_url.pathname.substr(0,1)=="/"){
        return (base_url.protocol || "http:") + "//" + (base_url.hostname || "") + url;
    }

    // relative path
    // remove also .. and . directory references
    base_path = (base_url.pathname || "/").split("/");
    base_path.pop(); // ditch the last element, empty for dir or a file name

    target_path = (target_url.pathname || "/").split("/");

    target_path = base_path.concat(target_path);
    final_path = [];

    target_path.forEach(function(dir){
        if(dir=="."){
            return;
        }

        if(dir==".."){
            final_path.pop();
            return;
        }

        if(dir){
            final_path.push(dir);
        }
    });

    return (base_url.protocol || "http:") + "//" + (base_url.hostname || "") + "/" +
        final_path.join("/") + (target_url.search || "");
}

FetchStream.prototype.runStream = function(url){
    var url_data = this.parseUrl(url),
        cookies = this.cookieJar.getCookies(url);

    if(cookies){
        url_data.urloptions.headers.cookie = cookies;
    }else{
        delete url_data.urloptions.headers.cookie;
    }

    var req = url_data.transport.request(url_data.urloptions, (function(res) {

        // catch new cookies before potential redirect
        if(Array.isArray(res.headers['set-cookie'])){
            for(var i=0; i<res.headers['set-cookie'].length; i++){
                this.cookieJar.setCookie(res.headers['set-cookie'][i], url)
            }
        }

        if([301, 302].indexOf(res.statusCode)>=0){
            if(!this.options.disableRedirects && this.options.maxRedirects>this._redirect_count && res.headers.location){
                this._redirect_count++;
                this.runStream(this.absoluteUrl(res.headers.location, url));
                return;
            }
        }

        this.meta = {
            status: res.statusCode,
            responseHeaders: res.headers,
            finalUrl: url,
            redirectCount: this._redirect_count,
            cookieJar: this.cookieJar
        }

        var curlen = 0,
            maxlen,

            receive = (function(chunk){

                if(curlen + chunk.length > this.options.maxResponseLength){
                    maxlen = this.options.maxResponseLength - curlen;
                }else{
                    maxlen = chunk.length;
                }
                if(maxlen<=0)return;

                curlen += Math.min(maxlen, chunk.length);

                if(maxlen>=chunk.length){
                    if(this.options.encoding){
                        this.emit("data", chunk.toString(this.options.encoding));
                    }else{
                        this.emit("data", chunk);
                    }
                }else{
                    if(this.options.encoding){
                        this.emit("data", chunk.slice(0, maxlen).toString(this.options.encoding));
                    }else{
                        this.emit("data", chunk.slice(0, maxlen));
                    }
                }
            }).bind(this),

            error = (function(e){
                this.emit("error", e);
            }).bind(this),

            end = (function(){
                this.emit("end");
            }).bind(this),

            unpack = (function(type, res){
                var z = zlib["create"+type]();
                z.on("data", receive);
                z.on("error", error);
                z.on("end", end);
                res.pipe(z);
            }).bind(this);

        this.emit("meta", this.meta);

        if(res.headers['content-encoding']){
            switch(res.headers['content-encoding'].toLowerCase().trim()){
                case "gzip":
                    return unpack("Gunzip", res);
                case "deflate":
                    return unpack("InflateRaw", res);
            }
        }

        res.on('data', receive);
        res.on('end', end);

    }).bind(this));

    req.on('error', (function(e){
        this.emit("error", e);
    }).bind(this));

    if(this.options.payload){
        req.end(this.options.payload);
    }else{
        req.end();
    }
}