# JS Bridge
Javascript bridge for bridge io containing Node Client, Server and Browser Client and Server

Note: Since javascript dosen't support blocking, await must be used when calling functions that return a value
or when getting attributes

To pass keyword arguments add '$' to the end of the attribute or function name then pass in a dict/object as the last argument

You can also prefix functions with '$' to run that function in a thread.

# Demo
```javascript
const { python } = require("js_bridge");
const py = python();

let str = await py.str;
let word = await str("Hello World");
py.print(str); // Dosen't return a value so no need to await
```

# Bottle Js
Bottle/ Flask app created using js_bridge and py_bridge

```javascript
const { python } = require("js_bridge");
const py = python();

async function bottleTest() {
    let bottle = await py.import("bottle");

    let app = await bottle.Bottle();

    await app.route("/<name>", "GET", async (name) => {
        let url = await bottle.request.path
        return `Hello from ${name} at: ${url}`
    })

    await app.$run$({ host: "localhost", port: 8081 })
}

async function flaskTest() {
    let Flask = await py.import("flask:Flask"); // same as { Flask } = await py.import('flask'); This dosen't work tho..

    let app = await Flask("JsApp");

    app.add_url_rule$("/", { methods: ["GET"],
        endpoint: "index",
        view_func: async function() {
            return `Hello world.`
        }
    })

    app.add_url_rule$("/<name>", { methods: ["GET"],
        endpoint: "name",
        view_func: async function(name) {
            return `Hello ${name}.`
        }
    })

    app.$run$({ host: "localhost", port: 8081 });
}
// bottleTest()
// flaskText()
```
