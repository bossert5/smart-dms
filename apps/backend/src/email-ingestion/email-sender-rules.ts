export function normalizeSenderRule(pattern: string): string {
  return pattern.trim().toLowerCase();
}

export function emailSenderMatchesRules(
  senderAddress: string | null | undefined,
  normalizedRules: readonly string[],
): boolean {
  if (normalizedRules.length === 0) {
    return true;
  }
  const sender = senderAddress?.trim().toLowerCase();
  if (!sender) {
    return false;
  }

  return normalizedRules.some((rule) => matchesRule(sender, rule));
}

function matchesRule(sender: string, normalizedRule: string): boolean {
  if (normalizedRule.startsWith('*@')) {
    return sender.endsWith(normalizedRule.slice(1));
  }

  return sender === normalizedRule;
}
