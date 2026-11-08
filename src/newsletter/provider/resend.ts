import type {
  CheckSubscribeStatusParams,
  NewsletterProvider,
  SubscribeNewsletterParams,
  UnsubscribeNewsletterParams,
} from '@/newsletter/types';
import { Resend } from 'resend';

/**
 * Implementation of the NewsletterProvider interface using Resend
 *
 * According to Resend's latest concept model:
 * - Contacts are directly bound to email addresses (no audienceId needed)
 * - Topics can be used for fine-grained subscription management
 * - Global unsubscribed status is still supported
 *
 * docs:
 * https://resend.com/docs/dashboard/audiences/introduction
 * https://resend.com/docs/dashboard/audiences/contacts
 * https://resend.com/docs/dashboard/topics/introduction
 * https://resend.com/docs/dashboard/segments/migrating-from-audiences-to-segments
 * https://mksaas.com/docs/newsletter
 */
export class ResendNewsletterProvider implements NewsletterProvider {
  private resend: Resend;

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }

    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  /**
   * Get the provider name
   * @returns Provider name
   */
  public getProviderName(): string {
    return 'resend';
  }

  /**
   * Subscribe a user to the newsletter
   * In Resend's new model, contacts are directly bound to email addresses
   *
   * Resend limits the API to 2 requests per second, so there is no pre-check
   * with contacts.get. Create the contact first; if that fails (for example
   * because the contact already exists), update it to subscribed instead.
   *
   * @param email The email address to subscribe
   * @returns True if the subscription was successful, false otherwise
   */
  async subscribe({ email }: SubscribeNewsletterParams): Promise<boolean> {
    try {
      const createResult = await this.resend.contacts.create({
        email,
        unsubscribed: false,
      });
      if (!createResult.error) return true;

      const updateResult = await this.resend.contacts.update({
        email,
        unsubscribed: false,
      });

      if (updateResult.error) {
        console.error('Error updating contact', updateResult.error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error subscribing newsletter', error);
      return false;
    }
  }

  /**
   * Unsubscribe a user from the newsletter
   * Updates the contact's global unsubscribed status
   * @param email The email address to unsubscribe
   * @returns True if the unsubscription was successful, false otherwise
   */
  async unsubscribe({ email }: UnsubscribeNewsletterParams): Promise<boolean> {
    try {
      const result = await this.resend.contacts.update({
        email,
        unsubscribed: true,
      });

      if (result.error) {
        console.error('Error unsubscribing newsletter', result.error);
        return false;
      }

      console.log('Unsubscribed newsletter', email);
      return true;
    } catch (error) {
      console.error('Error unsubscribing newsletter', error);
      return false;
    }
  }

  /**
   * Check if a user is subscribed to the newsletter
   * In Resend's new model, checks the contact's global unsubscribed status
   * @param email The email address to check
   * @returns True if the user is subscribed, false otherwise
   */
  async checkSubscribeStatus({
    email,
  }: CheckSubscribeStatusParams): Promise<boolean> {
    try {
      const result = await this.resend.contacts.get({ email });

      if (result.error) {
        // If contact doesn't exist, they are not subscribed
        console.log('Contact not found:', email);
        return false;
      }

      // Contact is subscribed if unsubscribed is false or undefined
      const status = !result.data?.unsubscribed;
      console.log('Check subscribe status:', { email, status });
      return status;
    } catch (error) {
      console.error('Error checking subscribe status:', error);
      return false;
    }
  }
}
