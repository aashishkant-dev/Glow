// Shared mutable badge counters for the Provider app, kept in their own module to avoid
// circular imports between ProviderNavigator and the screens that read/update them.
export const requestsBadge = { current: 0 };
