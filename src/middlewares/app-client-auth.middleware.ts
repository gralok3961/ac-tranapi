import { asyncMiddleware } from "@hashtrion/common/middlewares/async.middleware";
import { HashCrossProtocol } from "@hashtrion/application/hash-protocol";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export type AppClientAuthContext = {
    appInstallationId: string;
    appClientType: string;
};

export const appClientAuthMiddleware = () =>
    asyncMiddleware(async (req: Request, res: Response, next: NextFunction) => {
        const secret = process.env.APPCLIENT_SECRET;

        if (!secret) {
            return accessDenied(res);
        }

        const authHeader = req.header("Authorization");

        if (!authHeader || typeof authHeader !== "string") {
            return accessDenied(res);
        }

        if (!authHeader.startsWith("Bearer ")) {
            return accessDenied(res);
        }

        const token = authHeader.replace("Bearer ", "").trim();

        if (!token) {
            return accessDenied(res);
        }

        let payload: string | JwtPayload;

        try {
            payload = jwt.verify(token, secret);
        } catch {
            return accessDenied(res);
        }

        if (typeof payload === "string") {
            return accessDenied(res);
        }

        const appInstallationId = payload["appInstallationId"];
        const appClientType = payload["appClientType"];

        if (typeof appInstallationId !== "string" || !appInstallationId) {
            return accessDenied(res);
        }

        if (appClientType !== HashCrossProtocol.HashAppClientType.WALLET) {
            return accessDenied(res);
        }

        (req as any).appClient = {
            appInstallationId,
            appClientType
        } satisfies AppClientAuthContext;

        return next();
    });

function accessDenied(res: Response) {
    return res.status(401).json(new ErrorResponse("Unauthorized", 401).toReturn());
}