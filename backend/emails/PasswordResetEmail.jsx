import React from 'react';
import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Font, Preview, Tailwind, Button,
} from '@react-email/components';

export function PasswordResetEmail({ otp }) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>Reset your AutoSPF+ password — code: {otp}</Preview>
      <Tailwind>
        <Body className="bg-[#0a0a0a] font-sans m-0 p-0">
          <Container className="mx-auto py-10 px-4 max-w-[520px]">

            {/* Header */}
            <Section className="text-center mb-8">
              <Heading className="text-3xl font-bold text-[#f59e0b] m-0 tracking-tight">
                AUTO<span className="text-white">SPF+</span>
              </Heading>
              <Text className="text-[#6b7280] text-sm mt-1 mb-0">
                Premium Automotive Detailing & Protection
              </Text>
            </Section>

            {/* Card */}
            <Section className="bg-[#111111] border border-[#1f1f1f] rounded-2xl p-8">
              <Section className="text-center mb-6">
                <Text className="text-5xl m-0">🔑</Text>
              </Section>

              <Heading className="text-white text-2xl font-bold text-center mt-0 mb-2">
                Password Reset
              </Heading>
              <Text className="text-[#9ca3af] text-sm text-center mt-0 mb-6">
                Use this code to reset your AutoSPF+ password
              </Text>

              {/* OTP Box */}
              <Section className="text-center mb-6">
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '2px solid rgba(239,68,68,0.4)',
                  borderRadius: '12px', padding: '20px', display: 'inline-block',
                }}>
                  <Text style={{
                    fontSize: '42px', fontWeight: '800', letterSpacing: '12px',
                    color: '#ef4444', margin: 0, fontFamily: 'monospace',
                  }}>
                    {otp}
                  </Text>
                </div>
              </Section>

              <Text className="text-[#9ca3af] text-sm text-center mb-0">
                This code expires in <strong className="text-white">10 minutes</strong>.
              </Text>

              <Hr className="border-[#1f1f1f] my-6" />

              <div style={{
                background: 'rgba(239,68,68,0.05)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '8px', padding: '12px',
              }}>
                <Text className="text-[#ef4444] text-xs text-center m-0 font-semibold">
                  ⚠️ If you didn't request this, please contact support immediately.
                </Text>
              </div>
            </Section>

            <Text className="text-[#4b5563] text-xs text-center mt-6">
              © {new Date().getFullYear()} AutoSPF+ · Premium Automotive Care
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default PasswordResetEmail;
