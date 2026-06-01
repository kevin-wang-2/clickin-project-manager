"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  href: string;
  title: string;
  subtitle: string;
  accountName: string;
  isProjectMember: boolean;
  className?: string;
  children?: React.ReactNode;
};

export default function ProductionMemberGuardLink({
  href,
  title,
  subtitle,
  accountName,
  isProjectMember,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  const cardContent = children ?? (
    <>
      <p className="text-xs font-semibold tracking-widest text-zinc-300 uppercase mb-1">{subtitle}</p>
      <p className="text-base font-medium text-zinc-700">{title}</p>
    </>
  );

  if (isProjectMember) {
    return (
      <Link href={href} className={className}>
        {cardContent}
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {cardContent}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="member-guard-title" className="w-full max-w-sm rounded-xl bg-white p-5 text-left shadow-xl">
            <p id="member-guard-title" className="text-sm font-semibold text-zinc-800">无法编辑项目内容</p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              当前账号（{accountName}）还不是该项目的成员。如需编辑，请联系管理员将当前账号加入该项目。
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
