import { inject, injectable } from 'inversify';
import { HttpConfig, HttpRequestError, HttpRequestOptions, HTTPTYPES, IHttpService } from '../types/http-client';
import { ErrorResponse } from '../error-response';

@injectable()
export class HttpService implements IHttpService {
    constructor(@inject(HTTPTYPES.HttpConfig) private readonly config: HttpConfig) { }

    public async request<TResponse>(options: HttpRequestOptions): Promise<TResponse> {
        const method = options.method ?? 'GET';
        const url = this.buildUrl(options);
        const timeoutMs = options.timeoutMs ?? this.config.timeoutMs ?? 10000;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const headers: Record<string, string> = {
                Accept: 'application/json',
                ...this.config.defaultHeaders,
                ...options.headers,
            };

            const hasBody = options.body !== undefined && options.body !== null;
            if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

            const response = await fetch(url, {
                method,
                headers,
                body: hasBody ? JSON.stringify(options.body) : undefined,
                signal: controller.signal,
            });

            const contentType = response.headers.get('content-type') ?? '';
            const responseBody = await this.parseResponseBody(response, contentType);

            if (!response.ok) {
                const errorBody = responseBody as any;

                throw new HttpRequestError({
                    message:
                        errorBody?.message ??
                        errorBody?.Message ??
                        `HTTP ${response.status} ${response.statusText}`,
                    url,
                    statusCode: response.status,
                    responseBody,
                });
            }

            return responseBody as TResponse;

        } catch (error: unknown) {
            if (error instanceof ErrorResponse) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                throw new HttpRequestError({
                    message: `Request timeout after ${timeoutMs}ms`,
                    url,
                    statusCode: 408,
                });
            }

            throw new ErrorResponse(
                error instanceof Error ? error.message : 'Unexpected HTTP request error',
                500
            );
        } finally {
            clearTimeout(timeout);
        }
    }

    public get<TResponse>(
        pathOrUrl: string,
        options?: Omit<HttpRequestOptions, 'method' | 'path' | 'url'>,
    ): Promise<TResponse> {
        return this.request<TResponse>({
            ...options,
            ...this.resolvePathOrUrl(pathOrUrl),
            method: 'GET',
        });
    }

    public post<TResponse>(
        pathOrUrl: string,
        body?: unknown,
        options?: Omit<HttpRequestOptions, 'method' | 'body' | 'path' | 'url'>,
    ): Promise<TResponse> {
        return this.request<TResponse>({
            ...options,
            ...this.resolvePathOrUrl(pathOrUrl),
            method: 'POST',
            body,
        });
    }

    private resolvePathOrUrl(pathOrUrl: string): Pick<HttpRequestOptions, 'path' | 'url'> {
        if (/^https?:\/\//i.test(pathOrUrl)) return { url: pathOrUrl };
        return { path: pathOrUrl };
    }

    private buildUrl(options: HttpRequestOptions): string {
        const rawUrl = options.url ?? this.combineBaseUrlAndPath(
            options.baseUrlOverride ?? this.config.baseUrl,
            options.path ?? ''
        );

        const url = new URL(rawUrl);

        if (options.query) {
            for (const [key, value] of Object.entries(options.query)) {
                if (value === undefined || value === null) continue;
                url.searchParams.set(key, String(value));
            }
        }

        return url.toString();
    }

    private combineBaseUrlAndPath(baseUrl: string | undefined, path: string): string {
        if (!baseUrl) {
            throw new Error('Base URL is required when using relative paths.');
        }

        const normalizedBaseUrl = baseUrl.endsWith('/')
            ? baseUrl.slice(0, -1)
            : baseUrl;

        const normalizedPath = path.startsWith('/') ? path : `/${path}`;

        return `${normalizedBaseUrl}${normalizedPath}`;
    }

    private async parseResponseBody(response: Response, contentType: string): Promise<unknown> {
        if (response.status === 204) return undefined;

        if (contentType.includes('application/json')) {
            return await response.json();
        }

        const text = await response.text();

        if (!text) return undefined;

        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
}