export const userAdditionalFields = {
  customerId: {
    type: 'string',
    required: false,
    // Payment providers own this mapping; public auth inputs must not set it.
    input: false,
  },
} as const;
