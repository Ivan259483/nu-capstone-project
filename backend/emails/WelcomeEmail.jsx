import React from 'react';
import {
  Html, Head, Body, Container, Section, Text, Heading,
  Hr, Font, Preview, Tailwind, Button,
} from '@react-email/components';

export function WelcomeEmail({ name }) {
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
      <Preview>Welcome to AutoSPF+, {name}! Your account is ready.</Preview>
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
                <Text className="text-5xl m-0">🚗✨</Text>
              </Section>

              <Heading className="text-white text-2xl font-bold text-center mt-0 mb-2">
                Welcome, {name}!
              </Heading>
              <Text className="text-[#9ca3af] text-sm text-center mt-0 mb-6">
                Your AutoSPF+ account has been created successfully.
              </Text>

              {/* Features */}
              {[
                { icon: '🛡️', title: 'PPF & Paint Protection', desc: 'Premium ceramic coating & paint protection film' },
                { icon: '📅', title: 'Easy Booking', desc: 'Schedule services online anytime, anywhere' },
                { icon: '🔍', title: 'Vehicle Tracking', desc: 'Real-time updates on your vehicle status' },
              ].map((f, i) => (
                <Section key={i} className="mb-4">
                  <div style={{
                    background: 'rgba(245,158,11,0.05)',
                    border: '1px solid rgba(245,158,11,0.15)',
                    borderRadius: '10px', padding: '14px 16px',
                    display: 'flex', gap: '12px',
                  }}>
                    <Text className="text-xl m-0">{f.icon}</Text>
                    <div>
                      <Text className="text-white font-semibold text-sm m-0">{f.title}</Text>
                      <Text className="text-[#6b7280] text-xs m-0 mt-1">{f.desc}</Text>
                    </div>
                  </div>
                </Section>
              ))}

              <Section className="text-center mt-6">
                <Button
                  href="http://localhost:5173/login"
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#000', fontWeight: '700', fontSize: '15px',
                    padding: '14px 36px', borderRadius: '10px',
                    textDecoration: 'none', display: 'inline-block',
                  }}
                >
                  Get Started →
                </Button>
              </Section>

              <Hr className="border-[#1f1f1f] my-6" />
              <Text className="text-[#6b7280] text-xs text-center m-0">
                Need help? Contact us at support@autospf.com
              </Text>
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

export default WelcomeEmail;
