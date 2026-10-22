import { NextFunction, Request, Response } from 'express';
import { ErrorResponse } from '../error-response';
import { ToReturnError } from '../model/to-return-error';

export function errorMiddleWare(
    err: unknown,
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (res.headersSent) {
        return next(err);
    }
    const parseError = err as {
        type?: string;
        status?: number;
    } | null;

    if (
        parseError?.type === "entity.parse.failed" &&
        parseError.status === 400
    ) {
        return res.status(400).json({
            message: "Invalid JSON request body.",
            statusCode: 400
        });
    }

    if (err instanceof ErrorResponse) {
        const body: ToReturnError = err.toReturn();
        return res.status(err.statusCode).json(body);
    }

    if (err instanceof Error) {
        const body: ToReturnError = {
            message: err.message || 'Server Error',
            statusCode: 500,
        };

        return res.status(500).json(body);
    }

    const body: ToReturnError = {
        message: 'Server Error',
        statusCode: 500,
    };

    return res.status(500).json(body);
}