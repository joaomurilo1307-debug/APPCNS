import SignOutButton from "@/components/SignOutButton";

export default function PortalClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-4">
        <h1 className="text-lg font-semibold text-brand">Consominas · Portal do Cliente</h1>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-5xl p-8">{children}</main>
    </div>
  );
}
