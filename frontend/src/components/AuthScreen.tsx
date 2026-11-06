"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { fetchAccount, logIn, MIN_PASSWORD_LENGTH, signUp } from "@/lib/auth";

const MODES = {
  login: {
    heading: "Log in",
    submit: "Log in",
    submitting: "Logging in…",
    send: logIn,
    otherPrompt: "New to Prelegal?",
    otherLink: "Create an account",
    otherHref: "/signup/",
    autoComplete: "current-password",
  },
  signup: {
    heading: "Create your account",
    submit: "Create account",
    submitting: "Creating account…",
    send: signUp,
    otherPrompt: "Already have an account?",
    otherLink: "Log in",
    otherHref: "/login/",
    autoComplete: "new-password",
  },
};

function Blank({ width, delay }: { width: string; delay: number }) {
  return (
    <span
      className="redact"
      style={{ width, animationDelay: `${delay}ms` }}
    >
      <span className="sr-only">blank</span>
    </span>
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422) {
      return `Enter a valid email and a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (error.detail) return error.detail;
  }
  return "Prelegal can’t be reached. Check your connection and try again.";
}

export function AuthScreen({ mode }: { mode: keyof typeof MODES }) {
  const router = useRouter();
  const copy = MODES[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Someone who's already logged in has nothing to do here.
    fetchAccount().then(
      () => router.replace("/"),
      () => {},
    );
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await copy.send({ email, password });
      router.replace("/");
    } catch (failure) {
      setError(describeError(failure));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(24rem,5fr)]">
      <div className="on-shell bg-shell text-shell-text flex flex-col justify-between gap-10 p-6 sm:p-10 lg:p-14">
        <p className="font-display text-2xl font-extrabold">Prelegal</p>
        <div>
          <p className="font-display max-w-[18ch] text-[clamp(2.75rem,min(5.5vw,9dvh),5.5rem)] leading-[0.98] font-extrabold">
            This agreement is between <Blank width="3.2ch" delay={150} /> and{" "}
            <Blank width="4.6ch" delay={300} />. They agree to{" "}
            <Blank width="6.5ch" delay={450} /> and to stop sending redlines at
            midnight.
          </p>
          <p className="text-shell-muted mt-8 max-w-[46ch] text-lg">
            Draft NDAs, service agreements and more by chatting. Review every
            word, then download the PDF.
          </p>
        </div>
      </div>

      <div className="bg-paper flex flex-col justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-shell text-5xl leading-none font-extrabold">
            {copy.heading}
          </h1>
          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div>
              <label htmlFor="email" className="font-semibold">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field-input mt-1.5"
              />
            </div>
            <div>
              <label htmlFor="password" className="font-semibold">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
                autoComplete={copy.autoComplete}
                aria-describedby={mode === "signup" ? "password-help" : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field-input mt-1.5"
              />
              {mode === "signup" && (
                <p id="password-help" className="text-muted mt-1.5 text-sm">
                  Use at least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-error font-medium">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-shell hover:bg-ink text-shell-text cursor-pointer px-4 py-3 font-semibold transition-colors disabled:cursor-wait disabled:opacity-70"
            >
              {isSubmitting ? copy.submitting : copy.submit}
            </button>
          </form>
          <p className="mt-6">
            {copy.otherPrompt}{" "}
            <Link
              href={copy.otherHref}
              className="text-ink font-semibold underline underline-offset-2"
            >
              {copy.otherLink}
            </Link>
          </p>
          <p className="text-muted mt-10 text-sm">
            Prelegal doesn’t provide legal advice.
          </p>
        </div>
      </div>
    </main>
  );
}
