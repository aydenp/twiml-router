# TwiML Router

Reusable Express server implementation for Twilio TwiML requests, providing request validation and automatic response generation.

Getting started with TwiML on your server can take a lot of configuration and boilerplate code. This library aims to offer a solution to these common problems by wrapping Express in an API specifically designed to be used with TwiML, creating the response object for you and allowing for action nesting. It also offers functionality such as request signature validation to ensure that requests are legitimate and from Twilio and request body validation to ensure it has the expected fields for that type of request.

## 🛠 Usage

Just like Express, you'll start by importing the module and creating your server:

```ts
import { TwiMLServer, VoiceResponse } from "twiml-router";
const server = new TwiMLServer();
```

Then you can add routes to handle TwiML requests. You'll be provided with a callback that contains the Express request and a response object which you can mutate with your actions, such as saying text. If you need to perform asynchronous work, such as an HTTP request, you can return a Promise! Here's how to register:

```ts
// Provide a response for a phone call.
server.voice.register("/", (req, res) => {
    // Say hello!
    res.say("Hello, world. Yay! My TwiML server works.");
});

// Respond to an SMS message (asynchronously!).
import rp from 'request-promise'; // this example uses request-promise to load information from the web
server.messaging.register("/", async (req, res) => {
    // Load some lorem ipsum text from the web
    const text = await rp("https://loripsum.net/api/short/plaintext");
    res.message(text.substr(0, 159) + "…"); // trim it to 159 characters to avoid sending more than one SMS.
});

// Action nesting: nest an action instead of creating a separate route, such as receiving the response to a <Gather> (which gathers information from the caller).
// The best part about this is that all of the parent route's contextual information is still available. Useful for when you have to transfer a user and lose out on that info.
server.voice.register("/input", (req, res) => {
    // Query the user for a one-digit number
    const gather = res.gather({
        input: "dtmf",
        numDigits: 1,
        // Nest the gather action handler:
        action: server.voice.action((req, res) => {
            res.say(`You entered ${req.body.Digits}!`);
        })
    });
    // Tell the user what to do
    gather.say("Enter a number!");
});
```

After you've created your routes, you can start the server:

```ts
server.listen(3853, () => console.log('TwiML Server running at http://127.0.0.1:3853/'));
```

## ⚠️ Good to know

- Requests sent from Twilio should be POST.
- The TwiML router functions on its own Express server, and cannot be combined with other non-TwiML routes. This is a design choice. If your application requires an HTTP server, it should be run separately.
- In order to validate requests, the `NODE_ENV` must be `PRODUCTION` and your environment variables must include a `TWILIO_AUTH_TOKEN`. To ensure you provide this information, the server will warn you if it is missing.
- Paths are prefixed with the type of service they are unless you set `prefixRoutesWithType` to false when initializing your server. This will be either `voice`, `messaging`, or `fax`. When specifying your webhooks in the Twilio developer panel, include these prefixes.

## 🐞 Reporting Issues

If you find a bug or code issue, report it on the [issues page](/issues).

## 🍻 Contributing

Feel free to contribute to the source code of TwiML Router to make it something even better! Just try to adhere to the general coding style throughout, to make it as readable as possible.

## 👩‍⚖️ License

This project is licensed under the [MIT license](/LICENSE). Please make sure you comply with its terms while using it in any way.