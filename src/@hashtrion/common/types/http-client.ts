import { ErrorResponse } from "../error-response";

export type HttpMethod = 'GET' | 'POST';

export const HTTPTYPES = {
  HttpConfig: Symbol.for('HttpConfig'),
};

export interface HttpConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpRequestOptions {
  path?: string;
  url?: string;
  method?: HttpMethod;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  timeoutMs?: number;
  baseUrlOverride?: string;
}

export interface IHttpService {
  request<TResponse>(options: HttpRequestOptions): Promise<TResponse>;
  get<TResponse>(pathOrUrl: string, options?: Omit<HttpRequestOptions, 'method' | 'path' | 'url'>): Promise<TResponse>;
  post<TResponse>(pathOrUrl: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'body' | 'path' | 'url'>): Promise<TResponse>;
}

export class HttpRequestError extends ErrorResponse {
    public readonly url: string;
    public readonly responseBody?: unknown;

    constructor(params: {
        message: string;
        statusCode: number;
        url: string;
        responseBody?: unknown;
    }) {
        super(params.message, params.statusCode);
        this.name = 'HttpRequestError';
        this.url = params.url;
        this.responseBody = params.responseBody;
    }
}