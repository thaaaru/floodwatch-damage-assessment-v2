// SPDX-License-Identifier: Apache-2.0

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function EarlyWarningLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
