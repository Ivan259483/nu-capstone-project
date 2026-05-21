# Resend Deliverability Checklist

Use this checklist when Gmail places AutoSPF+ OTP messages in Spam.

## Required DNS

Add the exact values shown in the Resend domain dashboard. For the current production domain, the expected shape is:

| Type | Host | Value |
| --- | --- | --- |
| MX | `send.autospf.shop` | `feedback-smtp.<region>.amazonses.com` with priority `10`; use the exact region shown in Resend |
| TXT | `send.autospf.shop` | `v=spf1 include:amazonses.com ~all` |
| TXT | `resend._domainkey.autospf.shop` | Resend DKIM public key beginning with `p=` |
| TXT | `_dmarc.autospf.shop` | `v=DMARC1; p=none; rua=mailto:dmarc@autospf.shop; adkim=s; aspf=r; pct=100` |

Create working mailboxes or aliases for `support@autospf.shop` and `dmarc@autospf.shop`.

## Verification

Run:

```bash
npm run check:email-dns --prefix backend
```

Then send a Gmail test and open **Show original**. SPF, DKIM, and DMARC should pass, and DKIM or SPF must align with `autospf.shop`.

## Sending Practices

- Send OTP from `AutoSPF+ <verify@autospf.shop>`.
- Use `support@autospf.shop` as Reply-To and footer support address.
- Keep OTP subjects simple: `Your AutoSPF+ verification code`, `Your AutoSPF+ sign-in code`, or `Your AutoSPF+ password reset code`.
- Do not place OTP values in the subject line.
- Avoid high-frequency repeated Gmail tests from the same inbox.
- Warm a new domain slowly and monitor Google Postmaster Tools for reputation, authentication, spam rate, and delivery errors.
