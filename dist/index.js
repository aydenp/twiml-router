"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const twilio_1 = __importDefault(require("twilio"));
const VoiceResponse_1 = __importDefault(require("twilio/lib/twiml/VoiceResponse"));
exports.VoiceResponse = VoiceResponse_1.default;
const MessagingResponse_1 = __importDefault(require("twilio/lib/twiml/MessagingResponse"));
exports.MessagingResponse = MessagingResponse_1.default;
const FaxResponse_1 = __importDefault(require("twilio/lib/twiml/FaxResponse"));
exports.FaxResponse = FaxResponse_1.default;
const body_parser_1 = __importDefault(require("body-parser"));
const flakeid_1 = __importDefault(require("flakeid"));
class TwiMLServer {
    constructor(options = { prefixRoutesWithType: true }) {
        this.app = express_1.default();
        // Parse body
        this.app.use(body_parser_1.default.urlencoded({ extended: false }));
        // Validate signature
        if (process.env.NODE_ENV === "production" && process.env.TWILIO_AUTH_TOKEN) {
            this.app.use(twilio_1.default.webhook());
        }
        else {
            console.warn("WARNING! Webhooks from the Twilio API are not being validated. This is okay for development, but if you want to keep things in your TwiML, such as destination phone numbers secret, run your app in production mode with TWILIO_AUTH_TOKEN set.");
        }
        // Create routers
        this.voice = new TwiMLRouter(this.app, "voice", options);
        this.messaging = new TwiMLRouter(this.app, "messaging", options);
        this.fax = new TwiMLRouter(this.app, "fax", options);
    }
    listen(port, callback) {
        this.app.listen(port, callback);
    }
}
exports.TwiMLServer = TwiMLServer;
class TwiMLRouter {
    constructor(app, type, options) {
        this.app = app;
        this.type = type;
        this.options = options;
        this.flake = new flakeid_1.default();
        // MARK: Nested Action Generation
        this.generatedActionRoutes = {};
        // Create response factory
        this.responseFactory = () => {
            switch (type) {
                case "voice": return new VoiceResponse_1.default();
                case "messaging": return new MessagingResponse_1.default();
                case "fax": return new FaxResponse_1.default();
            }
        };
        // Register nested action handlers
        this.register(`/_generated/:id`, (req, res) => this.generatedActionRouteHandler(req, res));
    }
    // MARK: - Route Registration
    register(path, handler) {
        this.app.post(this.actionPath(path), async (req, res, next) => {
            try {
                // Ensure we have the required fields
                const bodyKeys = Object.keys(req.body);
                if (!["ApiVersion", "From", "To", "AccountSid"].every((k) => bodyKeys.includes(k)))
                    return res.status(400).send("Your request did not provide all of the required body fields.");
                // Create TwiML response (while we create a voice response, the only difference is the types)
                const twiml = this.responseFactory();
                // Pass off to handler!
                await handler(req, twiml);
                // Finished processing, send response.
                res.contentType("xml").send(twiml.toString());
            }
            catch (e) {
                return next(e);
            }
        });
    }
    action(handler, singleUse = true) {
        // Create a unique ID to identify this action by
        const id = this.flake.gen();
        // Save the route's information
        this.generatedActionRoutes[id] = { handler, singleUse };
        // Return a path to use as the action URL
        return this.actionPath("_generated/" + id);
    }
    async generatedActionRouteHandler(req, res) {
        // Find the route this refers to
        const route = this.generatedActionRoutes[req.params.id];
        if (!route)
            throw new Error("This generated route is no longer available. Cgeck to make sure that it isn't set to single use if that isn't appropriate.");
        // Remove the info if this route was single use
        if (route.singleUse)
            delete this.generatedActionRoutes[req.params.id];
        // Call the handler!
        return await route.handler(req, res);
    }
    // MARK: - Convenience
    actionPath(path) {
        return this.options.prefixRoutesWithType ? "/" + [this.type].concat(path.split("/").filter(c => c.length > 0)).join("/") : path;
    }
}
