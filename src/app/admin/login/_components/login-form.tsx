"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { signInAdmin, type SignInState } from "../actions";

const initialState: SignInState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAdmin, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <Field label="이메일">
        <Input
          type="email"
          name="email"
          placeholder="admin@dopda.kr"
          className="h-12 px-4 text-base"
          autoComplete="email"
          required
        />
      </Field>
      <Field label="비밀번호">
        <Input
          type="password"
          name="password"
          placeholder="••••••••"
          className="h-12 px-4 text-base"
          autoComplete="current-password"
          required
        />
      </Field>

      {state.error ? (
        <p
          role="alert"
          className="text-sm text-red-600"
        >
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isPending}
        className="mt-2 w-full h-12 rounded-full text-sm font-medium"
      >
        {isPending ? "로그인 중..." : "로그인"}
      </Button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-black">{label}</label>
      {children}
    </div>
  );
}
