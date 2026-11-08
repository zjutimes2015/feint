export class WebhookVerificationError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'WebhookVerificationError';
    this.cause = cause;
  }
}
