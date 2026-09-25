export default function ConsominasLogo({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-consominas.png" alt="Grupo Consominas" style={{ height: size }} />
  );
}
