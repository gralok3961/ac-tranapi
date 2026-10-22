export enum EnvironmentType {
    LOCAL = 'Local',
    PROD = 'Production'
}

export enum HttpStatus {
    BAD_REQUEST = 400,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    UNPROCESSABLE_ENTITY = 422,
    INTERNAL_SERVER_ERROR = 500,
}
