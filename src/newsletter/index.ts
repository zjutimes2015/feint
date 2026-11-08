import { websiteConfig } from '@/config/website';
import { BeehiivNewsletterProvider } from './provider/beehiiv';
import { MailCheapNewsletterProvider } from './provider/mailcheap';
import { ResendNewsletterProvider } from './provider/resend';
import type { NewsletterProvider, NewsletterProviderName } from './types';

type NewsletterProviderFactory = () => NewsletterProvider;

const providerRegistry: Partial<
  Record<NewsletterProviderName, NewsletterProviderFactory>
> = {
  resend: () => new ResendNewsletterProvider(),
  beehiiv: () => new BeehiivNewsletterProvider(),
  mailcheap: () => new MailCheapNewsletterProvider(),
};

let newsletterProvider: NewsletterProvider | null = null;

function createNewsletterProvider(): NewsletterProvider {
  const name = websiteConfig.newsletter.provider;
  if (!name)
    throw new Error('newsletter.provider is required in websiteConfig.');
  const factory = providerRegistry[name];
  if (!factory) throw new Error(`Unsupported newsletter provider: ${name}.`);
  return factory();
}

/**
 * Get the newsletter provider
 * @returns current newsletter provider instance
 */
export const getNewsletterProvider = (): NewsletterProvider => {
  if (!newsletterProvider) newsletterProvider = createNewsletterProvider();
  return newsletterProvider;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Subscribe a user to the newsletter
 * @param email The email address to subscribe, normalized before use
 * @returns True if the subscription was successful, false otherwise
 */
export const subscribe = async (email: string): Promise<boolean> => {
  const provider = getNewsletterProvider();
  return provider.subscribe({ email: normalizeEmail(email) });
};

/**
 * Unsubscribe a user from the newsletter
 * @param email The email address to unsubscribe, normalized before use
 * @returns True if the unsubscription was successful, false otherwise
 */
export const unsubscribe = async (email: string): Promise<boolean> => {
  const provider = getNewsletterProvider();
  return provider.unsubscribe({ email: normalizeEmail(email) });
};

/**
 * Check if a user is subscribed to the newsletter
 * @param email The email address to check, normalized before use
 * @returns True if the user is subscribed, false otherwise
 */
export const isSubscribed = async (email: string): Promise<boolean> => {
  const provider = getNewsletterProvider();
  return provider.checkSubscribeStatus({ email: normalizeEmail(email) });
};
