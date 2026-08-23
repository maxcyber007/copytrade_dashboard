export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text is always sent; HTML is optional and must carry the same content. */
  text: string;
  html?: string;
};

/**
 * The only contract the application depends on for delivery. Swapping SMTP for
 * a transactional API is an adapter, not a change to any service.
 */
export interface IEmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
