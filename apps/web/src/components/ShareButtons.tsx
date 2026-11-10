// Compartir por enlaces (mejora 8): WhatsApp (wa.me), Facebook
// (sharer) y Copiar enlace. Sin SDK, solo enlaces.
'use client';

import { useState } from 'react';
import { Button } from './ui';

export function shareUrls(url: string, text: string) {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  };
}

export default function ShareButtons({
  url,
  text,
  label = 'Compartir',
}: {
  url: string;
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const urls = shareUrls(url, text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <a
        href={urls.whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Compartir por WhatsApp
      </a>
      <a
        href={urls.facebook}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#1877f2] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Compartir en Facebook
      </a>
      <Button variant="secondary" type="button" onClick={copy}>
        {copied ? '¡Enlace copiado!' : 'Copiar enlace'}
      </Button>
    </div>
  );
}
