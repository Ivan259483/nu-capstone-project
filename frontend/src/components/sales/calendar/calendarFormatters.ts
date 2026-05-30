export function formatCalendarCustomerName(value?: string | null, fallback = 'Customer') {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;

  return raw
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part
            .split("'")
            .map((segment) => (
              segment
                ? segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
                : segment
            ))
            .join("'"),
        )
        .join('-'),
    )
    .join(' ');
}
