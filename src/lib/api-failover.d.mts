export function isHttpsOrigin(value: string | undefined): boolean;
export function shouldFallbackFromCloudflare(request: Request, response: Response): Promise<boolean>;
