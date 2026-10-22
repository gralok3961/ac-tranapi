import { ToReturnError } from "./model/to-return-error";

export class ErrorResponse extends Error {

    statusCode: number;

    constructor(message: string, statusCode: number) {

        super(message);

        this.statusCode = statusCode;
    }
    toReturn() {
        return {
            message: this.message,
            statusCode: this.statusCode
        } as ToReturnError
    }
}