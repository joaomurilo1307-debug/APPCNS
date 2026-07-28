export default function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
