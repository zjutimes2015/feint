import { z } from 'zod';

/**
 * Newsletter email input: trimmed and lowercased before validation, so padded
 * or mixed-case input maps to the same provider contact.
 */
export const newsletterEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Please enter a valid email address' })),
});
