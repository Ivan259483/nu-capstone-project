import React from 'react';
import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Font, Preview, Tailwind,
} from '@react-email/components';

export function OtpEmail({ otp, email }) {
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
      <Preview>Your AutoSPF+ verification code: {otp}</Preview>
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
              {/* Icon */}
              <Section className="text-center mb-6">
                <div style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', margin: '0 auto',
                }}>
                  <Text className="text-3xl m-0">🔐</Text>
                </div>
              </Section>

              <Heading className="text-white text-2xl font-bold text-center mt-0 mb-2">
                Verify Your Email
              </Heading>
              <Text className="text-[#9ca3af] text-sm text-center mt-0 mb-6">
                Use the code below to complete your verification
              </Text>

              {/* OTP Box */}
              <Section className="text-center mb-6">
                <div style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.1))',
                  border: '2px solid rgba(245,158,11,0.4)',
                  borderRadius: '12px', padding: '20px', display: 'inline-block',
                }}>
                  <Text style={{
                    fontSize: '42px', fontWeight: '800', letterSpacing: '12px',
                    color: '#f59e0b', margin: 0, fontFamily: 'monospace',
                  }}>
                    {otp}
                  </Text>
                </div>
              </Section>

              <Text className="text-[#9ca3af] text-sm text-center mb-0">
                This code expires in <strong className="text-white">10 minutes</strong>.
              </Text>
              <Text className="text-[#9ca3af] text-sm text-center mt-1">
                Do not share this code with anyone.
              </Text>

              <Hr className="border-[#1f1f1f] my-6" />

              <Text className="text-[#6b7280] text-xs text-center m-0">
                If you didn&apos;t request this, you can safely ignore this email.
              </Text>
            </Section>

            {/* Footer */}
            <Text className="text-[#4b5563] text-xs text-center mt-6">
              © {new Date().getFullYear()} AutoSPF+ · Premium Automotive Care
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export default OtpEmail;
