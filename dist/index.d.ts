import express, { Request } from "express";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse";
import FaxResponse from "twilio/lib/twiml/FaxResponse";
export declare class TwiMLServer {
    private app;
    voice: TwiMLRouter<VoiceResponse>;
    messaging: TwiMLRouter<MessagingResponse>;
    fax: TwiMLRouter<FaxResponse>;
    constructor(options?: TwiMLServerOptions);
    listen(port: number, callback?: () => void): void;
}
declare type RequestType = "voice" | "messaging" | "fax";
declare class TwiMLRouter<T extends AnyResponse> {
    private app;
    private type;
    private options;
    private flake;
    private responseFactory;
    constructor(app: express.Express, type: RequestType, options: TwiMLServerOptions);
    register(path: string, handler: CallHandler<T>): void;
    private generatedActionRoutes;
    action(handler: CallHandler<T>, singleUse?: boolean): string;
    private generatedActionRouteHandler;
    actionPath(path: string): string;
}
export interface TwiMLServerOptions {
    prefixRoutesWithType: boolean;
}
export { Request, VoiceResponse, MessagingResponse, FaxResponse };
declare type AnyResponse = VoiceResponse | MessagingResponse | FaxResponse;
declare type CallHandler<T> = (req: Request, res: T) => Promise<void> | void;
