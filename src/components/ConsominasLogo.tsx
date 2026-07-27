export default function ConsominasLogo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="55,5 95,40 60,45" fill="#E63329" />
        <polygon points="55,5 60,45 20,20" fill="#f2645c" />
        <polygon points="60,45 95,40 65,75" fill="#c22921" />
        <polygon points="20,20 60,45 30,60" fill="#E63329" />
        <polygon points="60,45 65,75 35,80" fill="#f2645c" />
        <polygon points="30,60 60,45 35,80" fill="#c22921" />
        <polygon points="30,60 35,80 10,95" fill="#E63329" />
      </svg>
      <span className="leading-tight">
        <span className="block text-xs font-medium text-brand">Grupo</span>
        <span className="-mt-1 block text-lg font-semibold text-ink">consominas</span>
      </span>
    </div>
  );
}
