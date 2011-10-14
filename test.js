var FetchStream = require("./fetch").FetchStream;

var fetch = new FetchStream("http://neti.ee",{
    headers:{}
});

fetch.on("data", function(chunk){
    console.log(chunk);
});

fetch.on("meta", function(meta){
    console.log(meta);
});

fetch.on("end", function(){
    console.log("END");
});

fetch.on("error", function(e){
    console.log("ERROR: " + (e && e.message || e));
});

