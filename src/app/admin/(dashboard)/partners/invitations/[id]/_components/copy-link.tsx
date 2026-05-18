"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 가입 링크 표시 + 클립보드 복사.
 * 복사 성공 시 2초간 "복사됨" 라벨로 전환 후 원복.
 */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 브라우저가 clipboard API 거부 — fallback: select all
      const input = document.getElementById(
        "invitation-url-input",
      ) as HTMLInputElement | null;
      input?.select();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        id="invitation-url-input"
        readOnly
        value={url}
        className="h-11 flex-1 font-mono text-xs"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button
        type="button"
        onClick={onCopy}
        className={cn(
          "h-11 rounded-full px-5 text-sm font-medium shrink-0",
          copied && "bg-[#4b4b4b]",
        )}
      >
        {copied ? "복사됨" : "링크 복사"}
      </Button>
    </div>
  );
}
