"use client";

/**
 * `/merchant/approvals` and `/merchant/governance/approvals` are the same
 * screen — the sidebar links here. This previously held a second, divergent
 * copy of the component (with its own hard-coded governance fields and its own
 * silent-failure handlers), so fixing one left the other broken. Re-export the
 * single canonical implementation.
 */
export { default } from "@/app/merchant/governance/approvals/page";
