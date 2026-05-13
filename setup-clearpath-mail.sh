#!/bin/bash
# ClearPath Mail - Full Project Setup Script
# Run this on your laptop: bash setup-clearpath-mail.sh
# It will create the project at ~/clearpath-mail

set -e
PROJECT_DIR="$HOME/clearpath-mail"
echo "Creating ClearPath Mail project at $PROJECT_DIR..."
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

cat > .env.local.example << CLEARPATH_EOF
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Anthropic (Claude API)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
STRIPE_PRICE_ID=your_price_id_for_499_monthly

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CLEARPATH_EOF

cat > .gitignore << CLEARPATH_EOF
node_modules/
.next/
out/
.env
.env.local
.env.*.local
*.tsbuildinfo
next-env.d.ts
CLEARPATH_EOF

cat > next.config.ts << CLEARPATH_EOF
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
CLEARPATH_EOF

cat > package.json << CLEARPATH_EOF
{
  "name": "clearpath-mail",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@supabase/supabase-js": "^2.47.0",
    "@supabase/ssr": "^0.5.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "imapflow": "^1.0.171",
    "mailparser": "^3.7.2",
    "stripe": "^17.5.0",
    "lucide-react": "^0.468.0",
    "framer-motion": "^11.15.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.1.0"
  }
}
CLEARPATH_EOF

cat > postcss.config.mjs << CLEARPATH_EOF
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
CLEARPATH_EOF

mkdir -p public
cat > public/manifest.json << CLEARPATH_EOF
{
  "name": "ClearPath Mail",
  "short_name": "CP Mail",
  "description": "AI-powered inbox cleaner by ClearPath Holdings",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#060a14",
  "theme_color": "#060a14",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
CLEARPATH_EOF

mkdir -p src/app/api/emails/clean
cat > src/app/api/emails/clean/route.ts << CLEARPATH_EOF
import { NextRequest, NextResponse } from "next/server";
import { deleteEmails, archiveEmails } from "@/lib/imap";

export async function POST(req: NextRequest) {
  try {
    const { provider, email, password, actions } = await req.json();

    if (!provider || !email || !password || !actions) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const toDelete: number[] = [];
    const toArchive: number[] = [];

    for (const action of actions) {
      if (action.action === "delete") toDelete.push(action.uid);
      if (action.action === "archive") toArchive.push(action.uid);
    }

    const results = { deleted: 0, archived: 0, errors: [] as string[] };

    if (toDelete.length > 0) {
      try {
        await deleteEmails(provider, email, password, toDelete);
        results.deleted = toDelete.length;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Delete failed";
        results.errors.push(msg);
      }
    }

    if (toArchive.length > 0) {
      try {
        await archiveEmails(provider, email, password, toArchive);
        results.archived = toArchive.length;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Archive failed";
        results.errors.push(msg);
      }
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Clean failed" }, { status: 500 });
  }
}
CLEARPATH_EOF

mkdir -p src/app/api/emails/scan
cat > src/app/api/emails/scan/route.ts << CLEARPATH_EOF
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentEmails } from "@/lib/imap";
import { classifyEmails } from "@/lib/classifier";

export async function POST(req: NextRequest) {
  try {
    const { provider, email, password, count = 50, preferences } = await req.json();

    if (!provider || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const emails = await fetchRecentEmails(provider, email, password, count);
    const classified = await classifyEmails(emails, preferences);

    const summary = {
      total: classified.length,
      toDelete: classified.filter((e) => e.action === "delete").length,
      toArchive: classified.filter((e) => e.action === "archive").length,
      toFlag: classified.filter((e) => e.action === "flag").length,
      toKeep: classified.filter((e) => e.action === "keep").length,
    };

    return NextResponse.json({ emails: classified, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
CLEARPATH_EOF

mkdir -p src/app/api/emails/test
cat > src/app/api/emails/test/route.ts << CLEARPATH_EOF
import { NextRequest, NextResponse } from "next/server";
import { testConnection } from "@/lib/imap";

export async function POST(req: NextRequest) {
  try {
    const { provider, email, password } = await req.json();

    if (!provider || !email || !password) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await testConnection(provider, email, password);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
CLEARPATH_EOF

mkdir -p src/app/api/stripe/checkout
cat > src/app/api/stripe/checkout/route.ts << CLEARPATH_EOF
import { NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/stripe";

export async function GET() {
  try {
    // TODO: get real userId and email from Supabase auth session
    const session = await createCheckoutSession("user_placeholder", "user@example.com");

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }

    return NextResponse.redirect(session.url);
  } catch {
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
CLEARPATH_EOF

mkdir -p src/app/api/stripe/webhook
cat > src/app/api/stripe/webhook/route.ts << CLEARPATH_EOF
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const userId = subscription.metadata.userId;

      if (userId) {
        await supabase
          .from("subscriptions")
          .upsert({
            user_id: userId,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            current_period_end: new Date(
              subscription.current_period_end * 1000
            ).toISOString(),
          });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const userId = subscription.metadata.userId;

      if (userId) {
        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("user_id", userId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
CLEARPATH_EOF

mkdir -p src/app/dashboard
cat > src/app/dashboard/page.tsx << CLEARPATH_EOF
"use client";

import { useState } from "react";
import {
  Mail,
  Trash2,
  Archive,
  Flag,
  Check,
  RefreshCw,
  ChevronDown,
  Settings,
  LogOut,
  Inbox,
  BarChart3,
  Undo2,
  Shield,
  Eye,
  Clock,
} from "lucide-react";

type ClassifiedEmail = {
  uid: number;
  from: string;
  subject: string;
  category: string;
  tier: "safe_auto" | "review_first" | "never_touch";
  action: string;
  confidence: number;
  reason: string;
  approved: boolean;
};

type RestoreItem = {
  uid: number;
  from: string;
  subject: string;
  actionTaken: string;
  timestamp: Date;
};

const TIER_STYLES: Record<string, { label: string; color: string }> = {
  safe_auto: { label: "Safe Auto", color: "text-green-400 bg-green-400/10 border-green-400/20" },
  review_first: { label: "Review First", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  never_touch: { label: "Never Touch", color: "text-cp-blue bg-cp-blue/10 border-cp-blue/20" },
};

const ACTION_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  delete: { color: "text-red-400 bg-red-400/10 border-red-400/20", icon: <Trash2 className="w-3.5 h-3.5" /> },
  archive: { color: "text-amber-400 bg-amber-400/10 border-amber-400/20", icon: <Archive className="w-3.5 h-3.5" /> },
  review: { color: "text-purple-400 bg-purple-400/10 border-purple-400/20", icon: <Eye className="w-3.5 h-3.5" /> },
  keep: { color: "text-green-400 bg-green-400/10 border-green-400/20", icon: <Shield className="w-3.5 h-3.5" /> },
};

export default function DashboardPage() {
  const [emails, setEmails] = useState<ClassifiedEmail[]>([]);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"inbox" | "restore">("inbox");
  const [showMenu, setShowMenu] = useState(false);
  const [restoreQueue, setRestoreQueue] = useState<RestoreItem[]>([]);

  const summary = {
    total: emails.length,
    delete: emails.filter((e) => e.action === "delete").length,
    archive: emails.filter((e) => e.action === "archive").length,
    review: emails.filter((e) => e.action === "review").length,
    keep: emails.filter((e) => e.action === "keep").length,
    autoApproved: emails.filter((e) => e.tier === "safe_auto" && e.approved).length,
    needsReview: emails.filter((e) => e.tier === "review_first" || !e.approved).length,
    protected: emails.filter((e) => e.tier === "never_touch").length,
  };

  const filteredEmails =
    filter === "all"
      ? emails
      : filter === "needs_review"
      ? emails.filter((e) => !e.approved && e.tier !== "never_touch")
      : emails.filter((e) => e.action === filter);

  const scanInbox = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/emails/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          email: "",
          password: "",
          count: 50,
        }),
      });
      const data = await res.json();
      if (data.emails) setEmails(data.emails);
    } catch (err) {
      console.error("Scan failed:", err);
    }
    setScanning(false);
  };

  const executeClean = async () => {
    setCleaning(true);
    try {
      const approved = emails.filter(
        (e) => e.approved && (e.action === "delete" || e.action === "archive")
      );

      const actions = approved.map((e) => ({ uid: e.uid, action: e.action }));

      await fetch("/api/emails/clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          email: "",
          password: "",
          actions,
        }),
      });

      const newRestoreItems: RestoreItem[] = approved.map((e) => ({
        uid: e.uid,
        from: e.from,
        subject: e.subject,
        actionTaken: e.action,
        timestamp: new Date(),
      }));
      setRestoreQueue([...newRestoreItems, ...restoreQueue]);

      const cleanedUids = new Set(approved.map((e) => e.uid));
      setEmails(emails.filter((e) => !cleanedUids.has(e.uid)));
    } catch (err) {
      console.error("Clean failed:", err);
    }
    setCleaning(false);
  };

  const toggleApproval = (uid: number) => {
    setEmails(
      emails.map((e) =>
        e.uid === uid ? { ...e, approved: !e.approved } : e
      )
    );
  };

  const changeAction = (uid: number, newAction: string) => {
    setEmails(
      emails.map((e) => (e.uid === uid ? { ...e, action: newAction, approved: false } : e))
    );
  };

  const approveAllSafeAuto = () => {
    setEmails(
      emails.map((e) =>
        e.tier === "safe_auto" ? { ...e, approved: true } : e
      )
    );
  };

  return (
    <main className="min-h-screen flex flex-col bg-cp-deep">
      {/* Top bar */}
      <nav className="sticky top-0 z-50 px-4 h-14 flex items-center justify-between bg-cp-deep/80 backdrop-blur-xl border-b border-cp-blue/10">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-cp-cyan" />
          <span className="text-xs font-extrabold tracking-widest uppercase text-white">
            ClearPath Mail
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === "inbox" ? "restore" : "inbox")}
            className={`p-2 rounded-lg transition-colors ${
              view === "restore"
                ? "bg-cp-blue/20 text-cp-cyan"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 rounded-full bg-cp-blue/20 flex items-center justify-center text-cp-cyan"
            >
              <Settings className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 w-48 bg-cp-card border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                <button className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Settings
                </button>
                <button className="w-full px-4 py-3 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Billing
                </button>
                <button className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-700">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {view === "restore" ? (
        /* Restore Center */
        <div className="flex-1 px-4 pt-4">
          <h2 className="text-lg font-bold mb-1">Restore Center</h2>
          <p className="text-xs text-slate-500 mb-4">
            Undo any action from the last 30 days.
          </p>
          {restoreQueue.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                Nothing to restore yet. Cleaned emails will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {restoreQueue.map((item) => (
                <div
                  key={`${item.uid}-${item.timestamp.getTime()}`}
                  className="rounded-xl border border-slate-800 bg-cp-card p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.subject}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.from} &middot;{" "}
                      {item.actionTaken === "delete" ? "Deleted" : "Archived"}{" "}
                      {item.timestamp.toLocaleDateString()}
                    </p>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg border border-cp-blue text-cp-blue text-xs font-medium hover:bg-cp-blue/10 ml-2 flex-shrink-0">
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Inbox View */
        <>
          {/* Tier summary */}
          <div className="px-4 pt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-cp-card border border-slate-800 p-3 text-center">
              <div className="text-xl font-bold text-green-400">
                {summary.autoApproved}
              </div>
              <div className="text-[0.6rem] text-slate-500 uppercase tracking-wider">
                Auto-clean
              </div>
            </div>
            <div className="rounded-xl bg-cp-card border border-slate-800 p-3 text-center">
              <div className="text-xl font-bold text-amber-400">
                {summary.needsReview}
              </div>
              <div className="text-[0.6rem] text-slate-500 uppercase tracking-wider">
                Needs review
              </div>
            </div>
            <div className="rounded-xl bg-cp-card border border-slate-800 p-3 text-center">
              <div className="text-xl font-bold text-cp-blue">
                {summary.protected}
              </div>
              <div className="text-[0.6rem] text-slate-500 uppercase tracking-wider">
                Protected
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 pt-3 flex gap-2">
            <button
              onClick={scanInbox}
              disabled={scanning}
              className="flex-1 py-2.5 rounded-xl border border-cp-blue text-cp-blue text-sm font-medium hover:bg-cp-blue/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`}
              />
              {scanning ? "Scanning..." : "Scan Inbox"}
            </button>
            <button
              onClick={executeClean}
              disabled={
                cleaning ||
                emails.filter((e) => e.approved).length === 0
              }
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cp-blue to-cp-cyan text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {cleaning ? "Cleaning..." : "Clean Approved"}
            </button>
          </div>

          {/* Quick approve */}
          {summary.autoApproved < emails.filter((e) => e.tier === "safe_auto").length && (
            <div className="px-4 pt-2">
              <button
                onClick={approveAllSafeAuto}
                className="w-full py-2 rounded-lg bg-green-400/5 border border-green-400/20 text-green-400 text-xs font-medium hover:bg-green-400/10 transition-colors flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Approve all Safe Auto (
                {emails.filter((e) => e.tier === "safe_auto").length} emails)
              </button>
            </div>
          )}

          {/* Filter tabs */}
          <div className="px-4 pt-3 flex gap-1 overflow-x-auto">
            {[
              { key: "all", label: `All (${summary.total})` },
              { key: "needs_review", label: `Review (${summary.needsReview})` },
              { key: "delete", label: `Delete (${summary.delete})` },
              { key: "archive", label: `Archive (${summary.archive})` },
              { key: "keep", label: `Keep (${summary.keep})` },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === f.key
                    ? "bg-cp-blue/20 text-cp-cyan"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Email list */}
          <div className="flex-1 px-4 pt-3 pb-20 space-y-2 overflow-y-auto">
            {filteredEmails.length === 0 && !scanning && (
              <div className="text-center py-16">
                <Inbox className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">
                  {emails.length === 0
                    ? 'Tap "Scan Inbox" to get started'
                    : "No emails in this view"}
                </p>
              </div>
            )}

            {filteredEmails.map((email) => (
              <div
                key={email.uid}
                className={`rounded-xl border bg-cp-card p-3 transition-all ${
                  email.tier === "never_touch"
                    ? "border-cp-blue/10 opacity-60"
                    : email.approved
                    ? "border-green-500/15"
                    : "border-slate-800"
                }`}
              >
                <div className="flex items-start gap-3">
                  {email.tier !== "never_touch" ? (
                    <button
                      onClick={() => toggleApproval(email.uid)}
                      className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        email.approved
                          ? "border-green-400 bg-green-400/10"
                          : "border-slate-600 hover:border-slate-500"
                      }`}
                    >
                      {email.approved && (
                        <Check className="w-3 h-3 text-green-400" />
                      )}
                    </button>
                  ) : (
                    <div className="mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0">
                      <Shield className="w-3.5 h-3.5 text-cp-blue" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-xs text-slate-400 truncate max-w-[140px]">
                        {email.from}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.55rem] font-medium border ${
                          TIER_STYLES[email.tier].color
                        }`}
                      >
                        {TIER_STYLES[email.tier].label}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.55rem] font-medium border ${
                          ACTION_STYLES[email.action].color
                        }`}
                      >
                        {ACTION_STYLES[email.action].icon}
                        {email.action}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">
                      {email.subject}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {email.reason}
                    </p>
                    {email.confidence < 0.7 && (
                      <p className="text-[0.6rem] text-amber-400/70 mt-1">
                        Low confidence ({Math.round(email.confidence * 100)}%) —
                        please review
                      </p>
                    )}
                  </div>

                  {email.tier !== "never_touch" && (
                    <div className="relative flex-shrink-0">
                      <select
                        value={email.action}
                        onChange={(e) =>
                          changeAction(email.uid, e.target.value)
                        }
                        className="text-[0.6rem] bg-cp-deep border border-slate-700 text-slate-400 rounded px-1.5 py-1 appearance-none pr-5 focus:outline-none"
                      >
                        <option value="delete">Delete</option>
                        <option value="archive">Archive</option>
                        <option value="review">Review</option>
                        <option value="keep">Keep</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-slate-500 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
CLEARPATH_EOF

mkdir -p src/app
cat > src/app/globals.css << CLEARPATH_EOF
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-deep: #060a14;
  --bg-card: rgba(15, 23, 42, 0.6);
  --bg-card-solid: #0f172a;
  --blue-primary: #1e88e5;
  --blue-light: #42a5f5;
  --cyan-accent: #4dd0e1;
  --cyan-bright: #00e5ff;
  --navy: #0d1b3e;
  --text-primary: #f0f4f8;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --gradient-accent: linear-gradient(135deg, #1e88e5, #4dd0e1);
}

body {
  background: var(--bg-deep);
  color: var(--text-primary);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
}

body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
}

@layer utilities {
  .gradient-text {
    background: var(--gradient-accent);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .glow-blue {
    box-shadow: 0 0 20px rgba(30, 136, 229, 0.3),
      0 0 60px rgba(30, 136, 229, 0.1);
  }

  .glow-cyan {
    box-shadow: 0 0 20px rgba(77, 208, 225, 0.3),
      0 0 60px rgba(77, 208, 225, 0.1);
  }
}
CLEARPATH_EOF

mkdir -p src/app
cat > src/app/layout.tsx << CLEARPATH_EOF
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClearPath Mail — AI Inbox Cleaner",
  description:
    "Stop drowning in email. ClearPath Mail uses AI to classify, clean, and organize your inbox across Gmail, AOL, iCloud, and more.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ClearPath Mail",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#060a14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
CLEARPATH_EOF

mkdir -p src/app/login
cat > src/app/login/page.tsx << CLEARPATH_EOF
"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // TODO: implement Supabase auth
      window.location.href = "/dashboard";
    } catch {
      setError("Login failed. Please try again.");
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <Mail className="w-8 h-8 text-cp-cyan" />
        <div className="leading-tight">
          <span className="text-lg font-extrabold tracking-widest uppercase block text-white">
            ClearPath
          </span>
          <span className="text-[0.6rem] font-medium tracking-[0.22em] uppercase text-slate-500 block">
            Mail
          </span>
        </div>
      </Link>

      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-cp-card border border-slate-800 p-6"
      >
        <h1 className="text-xl font-bold text-center">Welcome back</h1>

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-cp-deep border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-cp-blue transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg bg-cp-deep border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-cp-blue transition-colors"
            placeholder="Your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cp-blue to-cp-cyan text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p className="text-xs text-slate-500 text-center">
          Don&apos;t have an account?{" "}
          <Link href="/onboarding" className="text-cp-cyan hover:underline">
            Get started
          </Link>
        </p>
      </form>
    </main>
  );
}
CLEARPATH_EOF

mkdir -p src/app/onboarding
cat > src/app/onboarding/page.tsx << CLEARPATH_EOF
"use client";

import { useState } from "react";
import {
  Mail,
  ChevronRight,
  ChevronLeft,
  Check,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
  Shield,
} from "lucide-react";
import Link from "next/link";

type EmailAccount = {
  provider: string;
  email: string;
  password: string;
};

const PROVIDERS = [
  {
    id: "gmail",
    name: "Gmail",
    note: "Use an App Password (Google Account → Security → App Passwords)",
  },
  {
    id: "outlook",
    name: "Outlook",
    note: "Use your password or App Password if 2FA is enabled",
  },
  {
    id: "icloud",
    name: "iCloud",
    note: "Use an App-Specific Password (appleid.apple.com → Sign-In and Security)",
  },
  {
    id: "aol",
    name: "AOL",
    note: "Use an App Password (AOL Account → Security)",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [currentAccount, setCurrentAccount] = useState<EmailAccount>({
    provider: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [vipSenders, setVipSenders] = useState<string[]>([]);
  const [vipInput, setVipInput] = useState("");

  const steps = ["Welcome", "Connect Email", "VIP List", "Preferences", "Subscribe"];

  const addAccount = () => {
    setAccounts([...accounts, currentAccount]);
    setCurrentAccount({ provider: "", email: "", password: "" });
    setTestResult(null);
  };

  const removeAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index));
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/emails/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentAccount),
      });
      const data = await res.json();
      setTestResult(
        data.success ? "connected" : data.error || "Connection failed"
      );
    } catch {
      setTestResult("Connection failed. Check your credentials.");
    }
    setTesting(false);
  };

  const addVip = () => {
    if (vipInput.trim() && !vipSenders.includes(vipInput.trim())) {
      setVipSenders([...vipSenders, vipInput.trim()]);
      setVipInput("");
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <nav className="px-6 h-16 flex items-center bg-cp-deep/70 backdrop-blur-xl border-b border-cp-blue/10">
        <Link href="/" className="flex items-center gap-2">
          <Mail className="w-6 h-6 text-cp-cyan" />
          <span className="text-sm font-extrabold tracking-widest uppercase text-white">
            ClearPath Mail
          </span>
        </Link>
      </nav>

      {/* Progress */}
      <div className="px-6 pt-8 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < step
                    ? "bg-cp-cyan text-cp-deep"
                    : i === step
                    ? "bg-cp-blue text-white"
                    : "bg-slate-800 text-slate-500"
                }`}
              >
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span
                className={`text-[0.65rem] hidden sm:block ${
                  i === step ? "text-white font-medium" : "text-slate-500"
                }`}
              >
                {s}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 px-6 max-w-lg mx-auto w-full">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="text-center py-12">
            <h1 className="text-3xl font-extrabold mb-4">
              Welcome to{" "}
              <span className="gradient-text">ClearPath Mail</span>
            </h1>
            <p className="text-slate-400 mb-6 text-lg">
              Let&apos;s get your inboxes connected and set up your preferences.
              This takes about 2 minutes.
            </p>
            <div className="rounded-xl bg-cp-card border border-slate-800 p-5 text-left space-y-3 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-cp-cyan mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">You stay in control</p>
                  <p className="text-xs text-slate-500">
                    We never delete anything without your approval. Everything
                    is undoable for 30 days.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-cp-cyan mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Credentials are encrypted
                  </p>
                  <p className="text-xs text-slate-500">
                    Your passwords are encrypted at rest and never stored in
                    plain text.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-cp-cyan mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Emails are never stored
                  </p>
                  <p className="text-xs text-slate-500">
                    We read to classify, then forget. Your email content never
                    touches our database.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Connect Email */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Connect your inboxes</h2>
            <p className="text-slate-400 text-sm mb-6">
              Add as many accounts as you want. We connect via IMAP — the
              standard email protocol.
            </p>

            {accounts.length > 0 && (
              <div className="mb-6 space-y-2">
                {accounts.map((acc, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-cp-card border border-slate-800"
                  >
                    <div className="flex items-center gap-3">
                      <Check className="w-4 h-4 text-cp-cyan" />
                      <div>
                        <p className="text-sm font-medium">{acc.email}</p>
                        <p className="text-xs text-slate-500">
                          {PROVIDERS.find((p) => p.id === acc.provider)?.name}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeAccount(i)}
                      className="text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-4 rounded-2xl bg-cp-card border border-slate-800 p-5">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Email Provider
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() =>
                        setCurrentAccount({
                          ...currentAccount,
                          provider: p.id,
                        })
                      }
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        currentAccount.provider === p.id
                          ? "border-cp-blue bg-cp-blue/10 text-white"
                          : "border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                {currentAccount.provider && (
                  <p className="text-xs text-cp-cyan/70 mt-2">
                    {
                      PROVIDERS.find(
                        (p) => p.id === currentAccount.provider
                      )?.note
                    }
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={currentAccount.email}
                  onChange={(e) =>
                    setCurrentAccount({
                      ...currentAccount,
                      email: e.target.value,
                    })
                  }
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-cp-deep border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-cp-blue transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  App Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={currentAccount.password}
                    onChange={(e) =>
                      setCurrentAccount({
                        ...currentAccount,
                        password: e.target.value,
                      })
                    }
                    placeholder="App-specific password"
                    className="w-full px-4 py-2.5 rounded-lg bg-cp-deep border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-cp-blue transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={testConnection}
                  disabled={
                    !currentAccount.provider ||
                    !currentAccount.email ||
                    !currentAccount.password ||
                    testing
                  }
                  className="flex-1 py-2.5 rounded-lg border border-cp-blue text-cp-blue text-sm font-medium hover:bg-cp-blue/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                <button
                  onClick={addAccount}
                  disabled={testResult !== "connected"}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cp-blue to-cp-cyan text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Account
                </button>
              </div>

              {testResult && testResult !== "connected" && (
                <p className="text-xs text-red-400">{testResult}</p>
              )}
              {testResult === "connected" && (
                <p className="text-xs text-green-400">
                  Connection successful! Click &quot;Add Account&quot; to save.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: VIP List */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">
              Who should we <span className="gradient-text">never touch</span>?
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Add email addresses or domains that are always important. We will
              never suggest any action on emails from these senders.
            </p>

            <div className="rounded-2xl bg-cp-card border border-slate-800 p-5 mb-4">
              <label className="block text-xs text-slate-400 mb-1.5">
                Add a VIP sender (email or domain)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={vipInput}
                  onChange={(e) => setVipInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addVip()}
                  placeholder="mom@gmail.com or bankofamerica.com"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-cp-deep border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-cp-blue transition-colors text-sm"
                />
                <button
                  onClick={addVip}
                  disabled={!vipInput.trim()}
                  className="px-4 py-2.5 rounded-lg bg-cp-blue text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {vipSenders.length > 0 && (
              <div className="space-y-2 mb-4">
                {vipSenders.map((vip) => (
                  <div
                    key={vip}
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-cp-card border border-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-cp-blue" />
                      <span className="text-sm">{vip}</span>
                    </div>
                    <button
                      onClick={() =>
                        setVipSenders(vipSenders.filter((v) => v !== vip))
                      }
                      className="text-slate-500 hover:text-red-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl bg-cp-blue/5 border border-cp-blue/10 p-4">
              <p className="text-xs text-slate-400">
                <span className="text-cp-cyan font-medium">Tip:</span> Add your
                family, your bank, your employer, and anyone whose email you
                never want filtered. You can always edit this later.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Preferences */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Cleanup preferences</h2>
            <p className="text-slate-400 text-sm mb-6">
              Choose what happens to each type of email. You can change these
              anytime.
            </p>
            <div className="space-y-3">
              <PreferenceCard
                title="Spam & Phishing"
                description="Obvious junk, scam emails, phishing"
                tier="safe_auto"
                defaultAction="delete"
              />
              <PreferenceCard
                title="Promotions & Marketing"
                description="Sales, coupons, store emails, brand blasts"
                tier="safe_auto"
                defaultAction="delete"
              />
              <PreferenceCard
                title="Social Notifications"
                description="Facebook, LinkedIn, Instagram alerts"
                tier="safe_auto"
                defaultAction="archive"
              />
              <PreferenceCard
                title="Newsletters"
                description="Subscribed content, digests, updates"
                tier="review_first"
                defaultAction="archive"
              />
              <PreferenceCard
                title="Receipts & Orders"
                description="Purchase confirmations, shipping updates"
                tier="review_first"
                defaultAction="archive"
              />
              <PreferenceCard
                title="Account Alerts"
                description="Password resets, security alerts, verification"
                tier="review_first"
                defaultAction="review"
              />
            </div>
            <div className="rounded-xl bg-cp-blue/5 border border-cp-blue/10 p-4 mt-4">
              <p className="text-xs text-slate-400">
                <span className="text-cp-cyan font-medium">Note:</span> Family,
                personal, financial, and legal emails are always in the
                &quot;Never Touch&quot; tier. We&apos;ll never suggest actions on
                those.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Subscribe */}
        {step === 4 && (
          <div className="py-6">
            <h2 className="text-2xl font-bold text-center mb-2">
              Choose your plan
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              Start free, upgrade anytime.
            </p>

            <div className="space-y-4">
              {/* Free */}
              <div className="rounded-2xl border border-slate-800 bg-cp-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold">Free</h3>
                  <span className="text-xl font-extrabold">$0</span>
                </div>
                <ul className="text-xs text-slate-400 space-y-1.5 mb-4">
                  <li>1 email account</li>
                  <li>AI classification</li>
                  <li>Manual review & approve</li>
                  <li>7-day undo history</li>
                </ul>
                <button
                  onClick={() => (window.location.href = "/dashboard")}
                  className="w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium text-sm hover:bg-slate-800 transition-colors"
                >
                  Continue Free
                </button>
              </div>

              {/* Pro */}
              <div className="rounded-2xl border border-cp-blue/30 bg-cp-card p-5 glow-blue relative">
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cp-blue to-cp-cyan text-[0.6rem] font-semibold text-white">
                  Recommended
                </div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold">Pro</h3>
                  <div>
                    <span className="text-xl font-extrabold">$7.99</span>
                    <span className="text-xs text-slate-500">/mo</span>
                  </div>
                </div>
                <p className="text-[0.65rem] text-slate-500 mb-3">
                  or $69.99/year (save 27%)
                </p>
                <ul className="text-xs text-slate-300 space-y-1.5 mb-4">
                  <li>Unlimited email accounts</li>
                  <li>AI classification + auto-clean</li>
                  <li>Custom VIP & Never Touch lists</li>
                  <li>30-day undo & restore center</li>
                  <li>Daily inbox reports</li>
                </ul>
                <button
                  onClick={() =>
                    (window.location.href = "/api/stripe/checkout")
                  }
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cp-blue to-cp-cyan text-white font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Start 7-Day Free Trial
                </button>
                <p className="text-[0.6rem] text-slate-500 text-center mt-2">
                  No charge for 7 days. Cancel anytime.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="px-6 py-6 max-w-lg mx-auto w-full flex justify-between">
        <button
          onClick={() => setStep(step - 1)}
          disabled={step === 0}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-0"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        {step < 4 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && accounts.length === 0}
            className="flex items-center gap-1 text-sm font-medium text-cp-cyan hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 0 ? "Let's go" : step === 2 && vipSenders.length === 0 ? "Skip for now" : "Continue"}
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </main>
  );
}

function PreferenceCard({
  title,
  description,
  tier,
  defaultAction,
}: {
  title: string;
  description: string;
  tier: string;
  defaultAction: string;
}) {
  const [action, setAction] = useState(defaultAction);

  const tierColors: Record<string, string> = {
    safe_auto: "text-green-400 bg-green-400/10",
    review_first: "text-amber-400 bg-amber-400/10",
    never_touch: "text-cp-blue bg-cp-blue/10",
  };

  const tierLabels: Record<string, string> = {
    safe_auto: "Safe Auto",
    review_first: "Review First",
    never_touch: "Never Touch",
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-cp-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold">{title}</h3>
            <span
              className={`text-[0.55rem] px-1.5 py-0.5 rounded-full font-medium ${tierColors[tier]}`}
            >
              {tierLabels[tier]}
            </span>
          </div>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="text-xs bg-cp-deep border border-slate-700 text-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cp-blue"
        >
          <option value="delete">Delete</option>
          <option value="archive">Archive</option>
          <option value="review">Review first</option>
          <option value="keep">Keep</option>
        </select>
      </div>
    </div>
  );
}
CLEARPATH_EOF

mkdir -p src/app
cat > src/app/page.tsx << CLEARPATH_EOF
"use client";

import {
  Mail,
  Shield,
  Zap,
  Sparkles,
  ChevronRight,
  Eye,
  Lock,
  Undo2,
  Layers,
  Check,
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 h-16 flex items-center justify-between bg-cp-deep/70 backdrop-blur-xl border-b border-cp-blue/10">
        <div className="flex items-center gap-2">
          <Mail className="w-7 h-7 text-cp-cyan" />
          <div className="leading-tight">
            <span className="text-sm font-extrabold tracking-widest uppercase block text-white">
              ClearPath
            </span>
            <span className="text-[0.55rem] font-medium tracking-[0.22em] uppercase text-slate-500 block">
              Mail
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/onboarding"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-cp-blue to-cp-cyan text-white hover:opacity-90 transition-opacity"
          >
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero — control-first positioning */}
      <section className="pt-32 pb-20 px-6 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cp-blue/10 border border-cp-blue/20 text-cp-cyan text-xs font-medium mb-6">
          <Sparkles className="w-3 h-3" />
          All your inboxes. One place.
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
          Finally feel{" "}
          <span className="gradient-text">in control</span>
          <br />
          of your inbox again.
        </h1>
        <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">
          Gmail. Outlook. iCloud. You have too many inboxes and they&apos;re all
          full of noise. ClearPath Mail connects them all and helps you clean
          house — on your terms, at your pace.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/onboarding"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cp-blue to-cp-cyan text-white font-semibold text-lg glow-blue hover:opacity-90 transition-opacity"
          >
            Start Free
            <ChevronRight className="w-5 h-5" />
          </Link>
          <p className="text-xs text-slate-500">
            Free forever for 1 account &middot; Pro from $7.99/mo
          </p>
        </div>
      </section>

      {/* The hook — multi-inbox */}
      <section className="px-6 pb-20 max-w-3xl mx-auto text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          One place to clean <span className="gradient-text">every inbox</span> you have.
        </h2>
        <p className="text-slate-400 mb-8 max-w-xl mx-auto">
          That Gmail you use daily. The old iCloud from your iPhone. The Outlook
          from work. Stop switching between apps — connect them all and manage
          the mess from one dashboard.
        </p>
        <div className="flex justify-center gap-6 flex-wrap">
          {["Gmail", "Outlook", "iCloud", "AOL"].map((provider) => (
            <div
              key={provider}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-cp-card border border-slate-800 text-sm text-slate-300"
            >
              <Mail className="w-4 h-4 text-cp-cyan" />
              {provider}
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-cp-card border border-slate-800 text-sm text-slate-500">
            + more coming soon
          </div>
        </div>
      </section>

      {/* Trust — confidence tiers */}
      <section className="px-6 pb-20 max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            You stay in control. Always.
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto">
            We never delete anything without your permission. Every email gets a
            confidence tier — you decide what&apos;s safe to auto-clean and
            what&apos;s off-limits.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <TierCard
            color="green"
            title="Safe to Clean"
            description="Obvious spam, marketing blasts, known junk senders, expired promotions, social notifications."
            action="Auto-clean after you approve the category"
            items={[
              "Obvious spam",
              "Marketing blasts",
              "Social notifications",
              "Expired promotions",
            ]}
          />
          <TierCard
            color="amber"
            title="Review First"
            description="Newsletters, receipts, travel confirmations, account alerts — useful but cluttery."
            action="We suggest, you decide one by one"
            items={[
              "Newsletters",
              "Receipts & orders",
              "Travel confirmations",
              "Account alerts",
            ]}
          />
          <TierCard
            color="blue"
            title="Never Touch"
            description="Family, finances, legal docs, starred messages, your custom VIP list."
            action="We never suggest action on these"
            items={[
              "Family & friends",
              "Financial & legal",
              "Starred messages",
              "Your VIP list",
            ]}
          />
        </div>
      </section>

      {/* Features — trust-oriented */}
      <section className="px-6 pb-20 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon={<Eye className="w-6 h-6 text-cp-cyan" />}
            title="AI Suggests, You Decide"
            description="Every recommendation comes with a reason. Approve, reject, or override — you're always the boss."
          />
          <FeatureCard
            icon={<Undo2 className="w-6 h-6 text-cp-cyan" />}
            title="Undo Anything"
            description="30-day restore center. Accidentally clean something important? Get it back in one tap."
          />
          <FeatureCard
            icon={<Lock className="w-6 h-6 text-cp-cyan" />}
            title="Your Data, Your Rules"
            description="Credentials encrypted. Emails never stored on our servers. We read to classify, then forget."
          />
          <FeatureCard
            icon={<Layers className="w-6 h-6 text-cp-cyan" />}
            title="Gets Smarter"
            description="The more you approve and reject, the better it learns your preferences. Less review over time."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 pb-20 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">
          How it works
        </h2>
        <div className="space-y-6">
          {[
            {
              step: "1",
              title: "Connect your inboxes",
              desc: "Add Gmail, Outlook, and iCloud in under 2 minutes with our setup wizard.",
            },
            {
              step: "2",
              title: "AI scans and classifies",
              desc: "Every email gets categorized with a confidence tier and a recommended action.",
            },
            {
              step: "3",
              title: "Review and approve",
              desc: "Swipe through recommendations on your phone. Approve what looks right, override what doesn't.",
            },
            {
              step: "4",
              title: "Inbox cleaned",
              desc: "Junk gets deleted, noise gets archived, important stuff stays. Everything is undoable for 30 days.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-start gap-4 rounded-xl bg-cp-card border border-slate-800 p-5"
            >
              <div className="w-8 h-8 rounded-full bg-cp-blue/20 flex items-center justify-center text-cp-cyan text-sm font-bold flex-shrink-0">
                {item.step}
              </div>
              <div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 pb-20 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-2">
          Start free. Upgrade when you&apos;re ready.
        </h2>
        <p className="text-slate-400 text-center mb-10">
          No credit card required to get started.
        </p>

        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Free */}
          <div className="rounded-2xl border border-slate-800 bg-cp-card p-7">
            <h3 className="text-lg font-bold mb-1">Free</h3>
            <div className="text-3xl font-extrabold mb-4">
              $0<span className="text-lg text-slate-500 font-normal">/mo</span>
            </div>
            <ul className="text-sm text-slate-400 space-y-2.5 mb-6">
              {[
                "1 email account",
                "AI classification",
                "Manual review & approve",
                "7-day undo history",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-slate-500" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/onboarding"
              className="block w-full py-2.5 rounded-xl border border-slate-700 text-slate-300 font-medium text-center text-sm hover:bg-slate-800 transition-colors"
            >
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border border-cp-blue/30 bg-cp-card p-7 glow-blue relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cp-blue to-cp-cyan text-xs font-semibold text-white">
              Most Popular
            </div>
            <h3 className="text-lg font-bold mb-1">Pro</h3>
            <div className="text-3xl font-extrabold mb-1">
              $7<span className="text-xl text-slate-400">.99</span>
              <span className="text-lg text-slate-500 font-normal">/mo</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              or $69.99/year (save 27%)
            </p>
            <ul className="text-sm text-slate-300 space-y-2.5 mb-6">
              {[
                "Unlimited email accounts",
                "AI classification + auto-clean",
                "Custom VIP & Never Touch lists",
                "30-day undo & restore center",
                "Daily inbox reports",
                "Priority processing",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cp-cyan" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/onboarding"
              className="block w-full py-2.5 rounded-xl bg-gradient-to-r from-cp-blue to-cp-cyan text-white font-semibold text-center text-sm hover:opacity-90 transition-opacity"
            >
              Start 7-Day Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center text-xs text-slate-500">
        <p>
          &copy; {new Date().getFullYear()} ClearPath Holdings, LLC. All rights
          reserved.
        </p>
        <div className="flex justify-center gap-4 mt-2">
          <Link href="/terms" className="hover:text-slate-300">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-slate-300">
            Privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-cp-card p-5 hover:border-cp-blue/30 transition-colors">
      <div className="mb-3">{icon}</div>
      <h3 className="text-sm font-bold mb-1.5">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function TierCard({
  color,
  title,
  description,
  action,
  items,
}: {
  color: "green" | "amber" | "blue";
  title: string;
  description: string;
  action: string;
  items: string[];
}) {
  const colors = {
    green: {
      border: "border-green-500/20",
      dot: "bg-green-400",
      badge: "bg-green-400/10 text-green-400",
      glow: "hover:border-green-500/30",
    },
    amber: {
      border: "border-amber-500/20",
      dot: "bg-amber-400",
      badge: "bg-amber-400/10 text-amber-400",
      glow: "hover:border-amber-500/30",
    },
    blue: {
      border: "border-cp-blue/20",
      dot: "bg-cp-blue",
      badge: "bg-cp-blue/10 text-cp-blue-light",
      glow: "hover:border-cp-blue/30",
    },
  };

  const c = colors[color];

  return (
    <div
      className={`rounded-2xl border ${c.border} bg-cp-card p-5 ${c.glow} transition-colors`}
    >
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wider mb-3 ${c.badge}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        {title}
      </div>
      <p className="text-xs text-slate-400 mb-3">{description}</p>
      <ul className="text-xs text-slate-500 space-y-1.5 mb-4">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className={`w-1 h-1 rounded-full ${c.dot}`} />
            {item}
          </li>
        ))}
      </ul>
      <p className="text-[0.65rem] text-slate-500 border-t border-slate-800 pt-3">
        {action}
      </p>
    </div>
  );
}
CLEARPATH_EOF

mkdir -p src/lib
cat > src/lib/classifier.ts << CLEARPATH_EOF
import Anthropic from "@anthropic-ai/sdk";
import {
  type EmailCategory,
  type ClassifiedEmail,
  type UserPreferences,
  applyTierRules,
} from "./confidence-tiers";

const SYSTEM_PROMPT = `You are an email classifier for ClearPath Mail, an inbox management service.

Classify each email into exactly one of these categories:
- spam: Unsolicited junk mail, mass mailings from unknown senders
- phishing: Scam attempts, fake alerts, suspicious links, impersonation
- promotion: Sales, coupons, store emails, limited-time offers
- marketing: Brand awareness, product announcements, webinars
- social_notification: Facebook, LinkedIn, Twitter, Instagram alerts
- newsletter: Subscribed digests, weekly updates, blog roundups
- receipt: Purchase confirmations, shipping updates, order status
- travel: Flight confirmations, hotel bookings, rental car, travel alerts
- account_alert: Password resets, security alerts, TOS updates, verification
- financial: Bank statements, investment updates, tax docs, invoices
- legal: Legal notices, contracts, compliance, government correspondence
- family: Messages from family members (identifiable by tone/context)
- personal: Direct messages from real people, personal conversations
- work: Work-related correspondence, meetings, project updates

For each email provide:
- uid: the email uid (pass through)
- from: sender address (pass through)
- subject: subject line (pass through)
- category: one of the categories above
- confidence: 0.0 to 1.0 (how confident you are in the classification)
- reason: one sentence explaining WHY this classification (this is shown to the user)

Respond with valid JSON array only. No markdown, no explanation, no wrapping.`;

export async function classifyEmails(
  emails: Array<{ uid: number; from: string; subject: string; snippet: string; date?: string }>,
  userPreferences?: UserPreferences
): Promise<ClassifiedEmail[]> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Classify these emails:\n\n${JSON.stringify(
          emails.map((e) => ({
            uid: e.uid,
            from: e.from,
            subject: e.subject,
            preview: e.snippet,
          })),
          null,
          2
        )}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  let rawResults: Array<{
    uid: number;
    from: string;
    subject: string;
    category: EmailCategory;
    confidence: number;
    reason: string;
  }>;

  try {
    rawResults = JSON.parse(text);
  } catch {
    throw new Error("Failed to parse classification response");
  }

  const prefs: UserPreferences = userPreferences || {
    tierOverrides: {},
    vipSenders: [],
    neverDeleteDomains: [],
  };

  return rawResults.map((result) => {
    const tierResult = applyTierRules(
      { from: result.from, category: result.category },
      prefs
    );

    const sourceEmail = emails.find((e) => e.uid === result.uid);

    return {
      uid: result.uid,
      from: result.from,
      subject: result.subject,
      date: sourceEmail?.date || new Date().toISOString(),
      category: result.category,
      tier: tierResult.tier,
      action: tierResult.action,
      confidence: result.confidence,
      reason: result.reason,
      approved: tierResult.tier === "safe_auto" && result.confidence >= 0.85,
    };
  });
}
CLEARPATH_EOF

mkdir -p src/lib
cat > src/lib/confidence-tiers.ts << CLEARPATH_EOF
export type ConfidenceTier = "safe_auto" | "review_first" | "never_touch";

export type EmailCategory =
  | "spam"
  | "phishing"
  | "promotion"
  | "marketing"
  | "social_notification"
  | "newsletter"
  | "receipt"
  | "travel"
  | "account_alert"
  | "financial"
  | "legal"
  | "family"
  | "personal"
  | "work"
  | "starred";

export type RecommendedAction = "delete" | "archive" | "keep" | "review";

export type ClassifiedEmail = {
  uid: number;
  from: string;
  subject: string;
  date: string;
  category: EmailCategory;
  tier: ConfidenceTier;
  action: RecommendedAction;
  confidence: number;
  reason: string;
  userOverride?: RecommendedAction;
  approved: boolean;
};

export const DEFAULT_TIER_RULES: Record<EmailCategory, { tier: ConfidenceTier; action: RecommendedAction }> = {
  spam:                { tier: "safe_auto",    action: "delete" },
  phishing:            { tier: "safe_auto",    action: "delete" },
  promotion:           { tier: "safe_auto",    action: "delete" },
  marketing:           { tier: "safe_auto",    action: "delete" },
  social_notification: { tier: "safe_auto",    action: "archive" },
  newsletter:          { tier: "review_first", action: "archive" },
  receipt:             { tier: "review_first", action: "archive" },
  travel:              { tier: "review_first", action: "keep" },
  account_alert:       { tier: "review_first", action: "review" },
  financial:           { tier: "never_touch",  action: "keep" },
  legal:               { tier: "never_touch",  action: "keep" },
  family:              { tier: "never_touch",  action: "keep" },
  personal:            { tier: "never_touch",  action: "keep" },
  work:                { tier: "never_touch",  action: "keep" },
  starred:             { tier: "never_touch",  action: "keep" },
};

export type UserPreferences = {
  tierOverrides: Partial<Record<EmailCategory, { tier: ConfidenceTier; action: RecommendedAction }>>;
  vipSenders: string[];
  neverDeleteDomains: string[];
};

export function applyTierRules(
  email: { from: string; category: EmailCategory },
  preferences: UserPreferences
): { tier: ConfidenceTier; action: RecommendedAction } {
  const fromAddress = email.from.toLowerCase();

  if (preferences.vipSenders.some((vip) => fromAddress.includes(vip.toLowerCase()))) {
    return { tier: "never_touch", action: "keep" };
  }

  if (preferences.neverDeleteDomains.some((domain) => fromAddress.endsWith(domain.toLowerCase()))) {
    return { tier: "never_touch", action: "keep" };
  }

  if (preferences.tierOverrides[email.category]) {
    return preferences.tierOverrides[email.category]!;
  }

  return DEFAULT_TIER_RULES[email.category];
}
CLEARPATH_EOF

mkdir -p src/lib
cat > src/lib/imap.ts << CLEARPATH_EOF
import { ImapFlow } from "imapflow";

const PROVIDER_HOSTS: Record<string, { host: string; port: number }> = {
  gmail: { host: "imap.gmail.com", port: 993 },
  aol: { host: "imap.aol.com", port: 993 },
  icloud: { host: "imap.mail.me.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  yahoo: { host: "imap.mail.yahoo.com", port: 993 },
};

export function getImapConfig(provider: string, email: string, password: string) {
  const config = PROVIDER_HOSTS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  return {
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: email, pass: password },
    logger: false as const,
  };
}

export async function testConnection(
  provider: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const config = getImapConfig(provider, email, password);
  const client = new ImapFlow(config);

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { success: false, error: message };
  }
}

export async function fetchRecentEmails(
  provider: string,
  email: string,
  password: string,
  count: number = 50
) {
  const config = getImapConfig(provider, email, password);
  const client = new ImapFlow(config);
  const emails: Array<{
    uid: number;
    from: string;
    subject: string;
    date: Date;
    snippet: string;
  }> = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const messages = client.fetch(`1:${count}`, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: { start: 0, maxLength: 500 },
      }, { uid: true });

      for await (const msg of messages) {
        emails.push({
          uid: msg.uid,
          from: msg.envelope.from?.[0]?.address || "unknown",
          subject: msg.envelope.subject || "(no subject)",
          date: msg.envelope.date || new Date(),
          snippet: msg.source?.toString("utf-8").slice(0, 200) || "",
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch emails";
    throw new Error(message);
  }

  return emails;
}

export async function deleteEmails(
  provider: string,
  email: string,
  password: string,
  uids: number[]
) {
  const config = getImapConfig(provider, email, password);
  const client = new ImapFlow(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      await client.messageDelete(uids.join(","), { uid: true });
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete emails";
    throw new Error(message);
  }
}

export async function archiveEmails(
  provider: string,
  email: string,
  password: string,
  uids: number[],
  folder: string = "Archive"
) {
  const config = getImapConfig(provider, email, password);
  const client = new ImapFlow(config);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      await client.messageMove(uids.join(","), folder, { uid: true });
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to archive emails";
    throw new Error(message);
  }
}
CLEARPATH_EOF

mkdir -p src/lib
cat > src/lib/stripe.ts << CLEARPATH_EOF
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export async function createCheckoutSession(userId: string, email: string) {
  return stripe.checkout.sessions.create({
    customer_email: email,
    mode: "subscription",
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID!,
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?welcome=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?step=3`,
  });
}

export async function createBillingPortalSession(customerId: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });
}
CLEARPATH_EOF

mkdir -p src/lib
cat > src/lib/supabase.ts << CLEARPATH_EOF
import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
CLEARPATH_EOF

mkdir -p supabase
cat > supabase/schema.sql << CLEARPATH_EOF
-- ClearPath Mail Database Schema
-- Run this in your Supabase SQL editor

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Email accounts (encrypted credentials)
create table public.email_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('gmail', 'outlook', 'icloud', 'aol')),
  email text not null,
  encrypted_password text not null,
  is_active boolean default true,
  last_scan_at timestamptz,
  created_at timestamptz default now()
);

alter table public.email_accounts enable row level security;

create policy "Users can manage own email accounts"
  on public.email_accounts for all using (auth.uid() = user_id);

-- VIP senders (Never Touch list)
create table public.vip_senders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  sender text not null,
  created_at timestamptz default now(),
  unique(user_id, sender)
);

alter table public.vip_senders enable row level security;

create policy "Users can manage own VIP list"
  on public.vip_senders for all using (auth.uid() = user_id);

-- Cleanup preferences per category
create table public.preferences (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  spam_action text default 'delete',
  phishing_action text default 'delete',
  promotion_action text default 'delete',
  marketing_action text default 'delete',
  social_action text default 'archive',
  newsletter_action text default 'archive',
  receipt_action text default 'archive',
  travel_action text default 'keep',
  account_alert_action text default 'review',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.preferences enable row level security;

create policy "Users can manage own preferences"
  on public.preferences for all using (auth.uid() = user_id);

-- Scan history
create table public.scan_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.email_accounts(id) on delete cascade not null,
  total_scanned int default 0,
  total_deleted int default 0,
  total_archived int default 0,
  total_flagged int default 0,
  total_kept int default 0,
  scanned_at timestamptz default now()
);

alter table public.scan_logs enable row level security;

create policy "Users can view own scan logs"
  on public.scan_logs for select using (auth.uid() = user_id);

-- Restore queue (undo center — 30-day retention)
create table public.restore_queue (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  account_id uuid references public.email_accounts(id) on delete cascade not null,
  email_uid int not null,
  sender text not null,
  subject text not null,
  category text not null,
  action_taken text not null check (action_taken in ('delete', 'archive')),
  reason text,
  restored boolean default false,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 days')
);

alter table public.restore_queue enable row level security;

create policy "Users can manage own restore queue"
  on public.restore_queue for all using (auth.uid() = user_id);

-- Stripe subscriptions
create table public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text default 'free' check (plan in ('free', 'pro')),
  status text default 'active',
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can view own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Cleanup expired restore items (run via Supabase cron or pg_cron)
-- select cron.schedule('cleanup-restore-queue', '0 3 * * *', $$delete from public.restore_queue where expires_at < now()$$);
CLEARPATH_EOF

cat > tailwind.config.ts << CLEARPATH_EOF
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cp: {
          deep: "#060a14",
          card: "#0f172a",
          blue: "#1e88e5",
          "blue-light": "#42a5f5",
          cyan: "#4dd0e1",
          "cyan-bright": "#00e5ff",
          navy: "#0d1b3e",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
CLEARPATH_EOF

cat > tsconfig.json << CLEARPATH_EOF
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
CLEARPATH_EOF

echo ""
echo "Project created! Next steps:"
echo "  cd ~/clearpath-mail"
echo "  git init && git add -A && git commit -m \"Initial commit\""
echo "  git remote add origin https://github.com/driveclearpath/ClearPath-Mail.git"
echo "  git push -u origin main"
echo "  npm install"
echo "  cp .env.local.example .env.local"
echo "  # Fill in your API keys in .env.local"
echo "  npm run dev"
echo ""
echo "ClearPath Mail setup complete!"