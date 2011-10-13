var fetch = require("./fetch");

fetch("https://www.google.com", function(error, contents){
    console.log(error || contents);
    console.log(contents.body.toString("utf-8"))
    console.log(contents.body.toString("utf-8").length)
});