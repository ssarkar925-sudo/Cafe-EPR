import FreshWhatsAppResetClient from "./fresh-reset-client";

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FreshWhatsAppResetClient />
      {children}
    </>
  );
}
