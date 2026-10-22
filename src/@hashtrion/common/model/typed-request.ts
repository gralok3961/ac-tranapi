import { Request } from "express";

export type TypedRequest<TBody> = Request<{}, {}, TBody>;
