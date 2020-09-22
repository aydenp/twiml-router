"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const twilio_1 = __importDefault(require("twilio"));
const body_parser_1 = __importDefault(require("body-parser"));
const flakeid_1 = __importDefault(require("flakeid"));
const VoiceResponse_1 = __importDefault(require("twilio/lib/twiml/VoiceResponse"));
exports.VoiceResponse = VoiceResponse_1.default;
const MessagingResponse_1 = __importDefault(require("twilio/lib/twiml/MessagingResponse"));
exports.MessagingResponse = MessagingResponse_1.default;
const FaxResponse_1 = __importDefault(require("twilio/lib/twiml/FaxResponse"));
exports.FaxResponse = FaxResponse_1.default;
class TwiMLServer {
    constructor(options = { prefixRoutesWithType: true }) {
        this.app = express_1.default();
        // Parse body
        this.app.use(body_parser_1.default.urlencoded({ extended: false }));
        // Validate signature
        if (process.env.NODE_ENV === "production" && (process.env.TWILIO_AUTH_TOKEN)) {
            if (options.requestValidatorOptions)
                this.app.use(twilio_1.default.webhook(options.requestValidatorOptions));
            else
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
        // MARK: Nested Route Generation
        this.generatedActionRoutes = {};
        this.generatedCallbackRoutes = {};
        // Create response factory
        this.responseFactory = () => {
            switch (type) {
                case "voice": return new VoiceResponse_1.default();
                case "messaging": return new MessagingResponse_1.default();
                case "fax": return new FaxResponse_1.default();
            }
        };
        // Register nested action handlers
        this.register(`/_generated/action/:id`, async (req, res) => {
            const route = this.consumeGeneratedRoute(req.params.id, "generatedActionRoutes");
            // Call the handler!
            return await route.handler(req, res);
        });
        this._register(`/_generated/callback/:id`, async (req, res) => {
            const route = this.consumeGeneratedRoute(req.params.id, "generatedCallbackRoutes");
            // Call the handler!
            await route.handler(req);
            res.sendStatus(200);
        });
    }
    // MARK: - Route Registration
    register(path, handler) {
        this._register(path, async (req, res) => {
            // Ensure we have the required fields
            const bodyKeys = Object.keys(req.body);
            if (!["ApiVersion", "From", "To", "AccountSid"].every((k) => bodyKeys.includes(k)))
                return res.status(400).send("Your request did not provide all of the required body fields.");
            // Create TwiML response (while we create a voice response, the only difference is the types)
            const twiml = this.responseFactory();
            // Pass off to handler!
            await handler(req, twiml);
            // Finished processing, send response.
            return res.contentType("xml").send(twiml.toString());
        });
    }
    _register(path, handler) {
        this.app.post(this.actionPath(path), async (req, res, next) => {
            try {
                handler(req, res, next);
            }
            catch (e) {
                return next(e);
            }
        });
    }
    consumeGeneratedRoute(id, objectName) {
        // Find the route this refers to
        const route = this[objectName][id];
        if (!route)
            throw new Error("This generated route is no longer available. Check to make sure that it isn't set to single use if that isn't appropriate.");
        // Remove the info if this route was single use
        if (route.singleUse)
            delete this[objectName][id];
        return route;
    }
    generateRoute(handler, singleUse, objectName) {
        // Create a unique ID to identify this action by
        const id = this.flake.gen();
        // Save the route's information
        this[objectName][id] = { handler, singleUse };
        return id;
    }
    action(handler, singleUse = true) {
        const id = this.generateRoute(handler, singleUse, "generatedActionRoutes");
        // Return a path to use as the action URL
        return this.actionPath("_generated/action/" + id);
    }
    callback(handler, singleUse = true) {
        const id = this.generateRoute(handler, singleUse, "generatedCallbackRoutes");
        // Return a path to use as the callback URL
        return this.actionPath("_generated/callback/" + id);
    }
    // MARK: - Convenience
    actionPath(path) {
        return this.options.prefixRoutesWithType ? "/" + [this.type].concat(path.split("/").filter(c => c.length > 0)).join("/") : path;
    }
}
