import { asyncMiddleware } from "@hashtrion/common/middlewares/async.middleware";
import { HashCrossProtocol } from "@hashtrion/application/hash-protocol";
import { ErrorResponse } from "@hashtrion/common/error-response";
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const internalApiAuthMiddleware = () =>
    asyncMiddleware(async (req: Request, res: Response, next: NextFunction) => {

        const internalApiKey = process.env.INTERNAL_API_KEY;

        if (!internalApiKey) {
            return accessDenied(res);
        }

        const requestApiKey = req.header(HashCrossProtocol.HttpHeader.hashApiKey);

        if (!requestApiKey) {
            return accessDenied(res);
        }

        if (!secureCompare(requestApiKey, internalApiKey)) {
            return accessDenied(res);
        }

        return next();
    });

function secureCompare(value: string, expected: string): boolean {

    const valueBuffer = Buffer.from(value);
    const expectedBuffer = Buffer.from(expected);

    if (valueBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function accessDenied(res: Response) {

    return res.status(401).json(
        new ErrorResponse("Unauthorized", 401).toReturn()
    );
}