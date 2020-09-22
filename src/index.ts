import express, { Request, RequestHandler } from "express";
import twilio from "twilio";
import { RequestValidatorOptions } from "twilio/lib/webhooks/webhooks";
import bodyParser from "body-parser";
import FlakeId from "flakeid";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse";
import FaxResponse from "twilio/lib/twiml/FaxResponse";

export class TwiMLServer {
    private app = express();

    public voice: TwiMLRouter<VoiceResponse>;
    public messaging: TwiMLRouter<MessagingResponse>;
    public fax: TwiMLRouter<FaxResponse>;

    constructor(options: TwiMLServerOptions = { prefixRoutesWithType: true }) {
        // Parse body
        this.app.use(bodyParser.urlencoded({ extended: false }));

        // Validate signature
        if (process.env.NODE_ENV === "production" && (process.env.TWILIO_AUTH_TOKEN)) {
            if (options.requestValidatorOptions) this.app.use(twilio.webhook(options.requestValidatorOptions));
            else this.app.use(twilio.webhook());
        } else {
            console.warn("WARNING! Webhooks from the Twilio API are not being validated. This is okay for development, but if you want to keep things in your TwiML, such as destination phone numbers secret, run your app in production mode with TWILIO_AUTH_TOKEN set.");
        }

        // Create routers
        this.voice = new TwiMLRouter(this.app, "voice", options);
        this.messaging = new TwiMLRouter(this.app, "messaging", options);
        this.fax = new TwiMLRouter(this.app, "fax", options);
    }

    public listen(port: number, callback?: () => void) {
        this.app.listen(port, callback);
    }
}

type RequestType = "voice" | "messaging" | "fax";

class TwiMLRouter<T extends AnyResponse> {
    private flake = new FlakeId();
    private responseFactory: () => AnyResponse;

    constructor(private app: express.Express, private type: RequestType, private options: TwiMLServerOptions) {
        // Create response factory
        this.responseFactory = () => {
            switch (type) {
            case "voice": return new VoiceResponse();
            case "messaging": return new MessagingResponse();
            case "fax": return new FaxResponse();
            }
        }
        // Register nested action handlers
        this.register(`/_generated/action/:id`, async (req, res) => {
            const route = this.consumeGeneratedRoute(req.params.id, "generatedActionRoutes") as GeneratedRoute<CallHandler<T>>;
            // Call the handler!
            return await route.handler(req, res);
        });
        this._register(`/_generated/callback/:id`, async (req, res) => {
            const route = this.consumeGeneratedRoute(req.params.id, "generatedCallbackRoutes") as GeneratedRoute<CallbackHandler>;
            // Call the handler!
            await route.handler(req);
            res.sendStatus(200);
        });
    }

    // MARK: - Route Registration

    public register(path: string, handler: CallHandler<T>) {
        this._register(path, async (req, res) => {
            // Ensure we have the required fields
            const bodyKeys = Object.keys(req.body);
            if (!["ApiVersion", "From", "To", "AccountSid"].every((k) => bodyKeys.includes(k))) return res.status(400).send("Your request did not provide all of the required body fields.");

            // Create TwiML response (while we create a voice response, the only difference is the types)
            const twiml = <T>this.responseFactory();

            // Pass off to handler!
            await handler(req, twiml);

            // Finished processing, send response.
            return res.contentType("xml").send(twiml.toString());
        });
    }

    private _register(path: string, handler: RequestHandler) {
        this.app.post(this.actionPath(path), async (req, res, next) => {
            try {
                handler(req, res, next);
            } catch (e) {
                return next(e);
            }
        });
    }

    // MARK: Nested Route Generation

    private generatedActionRoutes: { [key: string]: GeneratedRoute<CallHandler<T>> } = {};
    private generatedCallbackRoutes: { [key: string]: GeneratedRoute<CallbackHandler> } = {};

    private consumeGeneratedRoute(id: string, objectName: string): GeneratedRoute<any> {
        // Find the route this refers to
        const route = this[objectName][id];
        if (!route) throw new Error("This generated route is no longer available. Check to make sure that it isn't set to single use if that isn't appropriate.");
        // Remove the info if this route was single use
        if (route.singleUse) delete this[objectName][id];
        return route;
    }

    private generateRoute<Handler>(handler: Handler, singleUse: boolean, objectName: string) {
        // Create a unique ID to identify this action by
        const id: string = this.flake.gen();
        // Save the route's information
        this[objectName][id] = { handler, singleUse };
        return id;
    }

    public action(handler: CallHandler<T>, singleUse: boolean = true) {
        const id = this.generateRoute(handler, singleUse, "generatedActionRoutes");
        // Return a path to use as the action URL
        return this.actionPath("_generated/action/" + id);
    }

    public callback(handler: CallbackHandler, singleUse: boolean = true) {
        const id = this.generateRoute(handler, singleUse, "generatedCallbackRoutes");
        // Return a path to use as the callback URL
        return this.actionPath("_generated/callback/" + id);
    }

    // MARK: - Convenience

    public actionPath(path: string) {
        return this.options.prefixRoutesWithType ? "/" + [<string>this.type].concat(path.split("/").filter(c => c.length > 0)).join("/") : path
    }
}

export interface TwiMLServerOptions {
    prefixRoutesWithType: boolean;
    requestValidatorOptions?: RequestValidatorOptions
}

export { Request, VoiceResponse, MessagingResponse, FaxResponse };

type GeneratedRoute<Handler> = { handler: Handler, singleUse: boolean };
type AnyResponse = VoiceResponse | MessagingResponse | FaxResponse;
type CallHandler<T> = (req: Request, res: T) => Promise<void> | void;
type CallbackHandler = (req: Request) => Promise<void> | void;